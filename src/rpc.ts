import { Platform, Notice } from "obsidian";

// Node.js modules - only loaded on desktop
let spawn: typeof import("child_process").spawn;
let createInterface: typeof import("readline").createInterface;
type ChildProcess = import("child_process").ChildProcess;
type ReadlineInterface = import("readline").Interface;

if (Platform.isDesktop) {
	const childProcessModule = require("child_process") as typeof import("child_process");
	const readlineModule = require("readline") as typeof import("readline");
	spawn = childProcessModule.spawn;
	createInterface = readlineModule.createInterface;
}

// =============================================================================
// RPC Protocol Types
// =============================================================================

export interface RpcEvent {
	type: string;
	id?: string;
	success?: boolean;
	error?: string;
	data?: Record<string, unknown>;
	[key: string]: unknown;
}

export interface RpcResponse extends RpcEvent {
	type: "response";
	id: string;
	success: boolean;
	data?: Record<string, unknown>;
	error?: string;
}

export interface MessageUpdateEvent extends RpcEvent {
	type: "message_update";
	assistantMessageEvent?: AssistantMessageEvent;
}

export interface AssistantMessageEvent {
	type: string;
	delta?: string;
	contentIndex?: number;
	partial?: Record<string, unknown>;
	toolCall?: Record<string, unknown>;
	reason?: string;
}

export interface ToolExecutionStartEvent extends RpcEvent {
	type: "tool_execution_start";
	toolCallId: string;
	toolName: string;
	args?: Record<string, unknown>;
}

export interface ToolExecutionUpdateEvent extends RpcEvent {
	type: "tool_execution_update";
	toolCallId: string;
	toolName: string;
	partialResult?: Record<string, unknown>;
}

export interface ToolExecutionEndEvent extends RpcEvent {
	type: "tool_execution_end";
	toolCallId: string;
	toolName: string;
	result?: Record<string, unknown>;
	isError?: boolean;
}

export interface AgentEndEvent extends RpcEvent {
	type: "agent_end";
	messages?: Array<Record<string, unknown>>;
}

// =============================================================================
// PiConnection
// =============================================================================

interface PendingRequest {
	resolve: (value: RpcEvent) => void;
	reject: (reason: Error) => void;
	timeoutId: number;
}

export type PiEventHandler = (event: RpcEvent) => void;

export interface PiConnectionOptions {
	piBinaryPath: string;
	cwd: string;
	nodePath?: string;
	apiKeys?: Record<string, string>;
	extraArgs?: string[];
	timeout?: number;
}

export class PiConnection {
	private options: PiConnectionOptions;
	private process: ChildProcess | null = null;
	private readline: ReadlineInterface | null = null;
	private handlers: PiEventHandler[] = [];
	private requestId = 0;
	private pendingRequests = new Map<string, PendingRequest>();
	private connected = false;
	private intentionallyDestroyed = false;

	constructor(options: PiConnectionOptions) {
		this.options = {
			timeout: 120_000,
			extraArgs: [],
			apiKeys: {},
			...options,
		};
	}

	connect(): void {
		if (this.process) {
			this.destroy();
		}

		this.intentionallyDestroyed = false;

		if (!this.options.piBinaryPath?.trim()) {
			throw new Error("Pi binary path is not configured in settings.");
		}

		// macOS GUI apps don't inherit shell PATH or environment variables.
		// We must carefully reconstruct a useful environment for the Pi process.
		const currentPath = process.env.PATH || "";
		const nodePaths = ["/usr/local/bin", "/opt/homebrew/bin", "/opt/homebrew/sbin"];
		const enhancedPath = [...new Set([...nodePaths, ...currentPath.split(":")])].join(":");

		// Start with a curated set of variables that Pi and LLM clients commonly need.
		// We deliberately do NOT copy the entire process.env for privacy reasons.
		const env: Record<string, string> = {};

		// Core variables most CLI tools (including Pi) expect
		const coreVars = [
			"HOME",
			"USER",
			"LOGNAME",
			"SHELL",
			"TERM",
			"XDG_CONFIG_HOME",
			"XDG_DATA_HOME",
			"XDG_CACHE_HOME",
			"TMPDIR",
			"LANG",
			"LC_ALL",
			"LC_CTYPE",
		];

		for (const key of coreVars) {
			if (process.env[key]) {
				env[key] = process.env[key]!;
			}
		}

		// Automatically pass through common LLM provider API keys if they exist
		// in the parent process. This is the main fix for "works in terminal but
		// not from Obsidian" on macOS.
		const llmKeyNames = [
			// Major providers
			"ANTHROPIC_API_KEY",
			"OPENAI_API_KEY",
			"XAI_API_KEY",
			"GEMINI_API_KEY",
			"GOOGLE_API_KEY",
			"GROQ_API_KEY",
			"MISTRAL_API_KEY",
			"COHERE_API_KEY",
			"DEEPSEEK_API_KEY",
			"FIREWORKS_API_KEY",
			// Routing / aggregation
			"OPENROUTER_API_KEY",
			"TOGETHER_API_KEY",
			"PERPLEXITY_API_KEY",
			// Local / self-hosted
			"OLLAMA_HOST",
			"LMSTUDIO_API_KEY",
			// Generic fallbacks some tools respect
			"API_KEY",
			"LLM_API_KEY",
		];

		for (const key of llmKeyNames) {
			if (process.env[key]) {
				env[key] = process.env[key]!;
			}
		}

		// Apply enhanced PATH (critical on macOS for Homebrew / nvm)
		env.PATH = enhancedPath;

		// Highest priority: any keys the user explicitly configured in plugin settings
		// (these can override the auto-detected ones)
		for (const [key, value] of Object.entries(this.options.apiKeys || {})) {
			if (value?.trim()) {
				env[key] = value;
			}
		}

		this.process = spawn(this.options.piBinaryPath, ["--mode", "rpc", ...(this.options.extraArgs || [])], {
			cwd: this.options.cwd,
			stdio: ["pipe", "pipe", "pipe"],
			env,
		});

		this.connected = true;

		const stderrBuffer: string[] = [];

		// JSONL parsing on stdout
		if (this.process.stdout) {
			this.readline = createInterface({
				input: this.process.stdout,
				crlfDelay: Infinity,
			});

			this.readline.on("line", (line: string) => {
				const trimmed = line.trim();
				if (!trimmed) return;

				try {
					const event = JSON.parse(trimmed) as RpcEvent;
					this.dispatch(event);
				} catch {
					// Non-JSON debug output from Pi
					if (!trimmed.startsWith("{")) {
						console.debug("[Pi RPC] non-JSON:", trimmed);
					}
				}
			});
		}

		if (this.process.stderr) {
			this.process.stderr.on("data", (data: Buffer) => {
				const text = data.toString();
				stderrBuffer.push(text);

				// Forward stderr to debug log in real time (very useful for auth/model errors)
				for (const line of text.split("\n")) {
					const trimmed = line.trim();
					if (trimmed) {
						this.dispatch({ type: "stderr", line: trimmed });
					}
				}
			});
		}

		this.process.on("exit", (code, signal) => {
			if (this.intentionallyDestroyed) {
				this.connected = false;
				this.cleanup();
				return;
			}

			this.connected = false;
			const errMsg = `Pi process exited (code=${code}, signal=${signal})`;
			if (stderrBuffer.length) {
				console.warn("[Pi RPC] stderr:", stderrBuffer.join(""));
			}
			this.dispatch({ type: "error", error: errMsg });
			this.cleanup();
		});

		this.process.on("error", (err) => {
			this.connected = false;
			console.error("[Pi RPC] process error:", err);
			this.dispatch({ type: "error", error: `Pi process error: ${err.message}` });
			this.cleanup();
		});
	}

	/**
	 * Send a command and return a Promise for the matching response.
	 * Streaming events continue to be delivered via onEvent handlers.
	 */
	async send(command: Record<string, unknown>): Promise<RpcEvent> {
		if (!this.process?.stdin || !this.connected) {
			throw new Error("Pi is not connected");
		}

		const id = `req-${this.requestId++}`;
		const line = JSON.stringify({ ...command, id }) + "\n";

		return new Promise((resolve, reject) => {
			const timeoutId = window.setTimeout(() => {
				if (this.pendingRequests.has(id)) {
					this.pendingRequests.delete(id);
					reject(new Error(`Pi request timed out after ${(this.options.timeout || 120000) / 1000}s`));
				}
			}, this.options.timeout);

			this.pendingRequests.set(id, {
				resolve: (v) => {
					window.clearTimeout(timeoutId);
					resolve(v);
				},
				reject: (e) => {
					window.clearTimeout(timeoutId);
					reject(e);
				},
				timeoutId,
			});

			this.process!.stdin!.write(line);
		});
	}

	sendRaw(command: Record<string, unknown>): void {
		if (!this.process?.stdin || !this.connected) {
			throw new Error("Pi is not connected");
		}
		this.process.stdin.write(JSON.stringify(command) + "\n");
	}

	onEvent(handler: PiEventHandler): void {
		this.handlers.push(handler);
	}

	offEvent(handler: PiEventHandler): void {
		const idx = this.handlers.indexOf(handler);
		if (idx !== -1) this.handlers.splice(idx, 1);
	}

	destroy(): void {
		this.intentionallyDestroyed = true;
		this.handlers = [];
		if (this.process) {
			try {
				this.process.kill();
			} catch {}
		}
		this.cleanup();
	}

	isConnected(): boolean {
		return this.connected;
	}

	private dispatch(event: RpcEvent): void {
		if (event.type === "error" && this.intentionallyDestroyed) return;

		// Route responses to waiting promises
		if (event.type === "response" && typeof event.id === "string") {
			const pending = this.pendingRequests.get(event.id);
			if (pending) {
				this.pendingRequests.delete(event.id);
				if (event.success === false) {
					pending.reject(new Error(String(event.error || "Request failed")));
				} else {
					pending.resolve(event);
				}
				return;
			}
		}

		// Broadcast streaming events
		for (const h of this.handlers) {
			try {
				h(event);
			} catch (e) {
				console.error("[Pi RPC] handler error", e);
			}
		}
	}

	private cleanup(): void {
		const wasConnected = this.connected;
		this.connected = false;

		if (this.readline) {
			this.readline.close();
			this.readline = null;
		}
		this.process = null;

		for (const [, p] of this.pendingRequests) {
			window.clearTimeout(p.timeoutId);
			p.reject(new Error("Pi connection closed"));
		}
		this.pendingRequests.clear();
	}
}
