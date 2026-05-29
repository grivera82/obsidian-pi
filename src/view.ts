import { ItemView, WorkspaceLeaf, Notice, MarkdownRenderer, Component } from "obsidian";
import PiPlugin from "./main";
import { PiConnection, RpcEvent, MessageUpdateEvent } from "./rpc";

export const VIEW_TYPE_PI_CHAT = "pi-chat-view";

interface ChatMessage {
	role: "user" | "assistant" | "thinking" | "tool";
	content: string;
	toolName?: string;
}

export class PiChatView extends ItemView {
	plugin: PiPlugin;
	connection: PiConnection | null = null;

	// UI elements
	private messagesEl!: HTMLElement;
	private inputEl!: HTMLTextAreaElement;
	private sendBtn!: HTMLButtonElement;
	private abortBtn!: HTMLButtonElement;
	private statusEl!: HTMLElement;
	private modelEl!: HTMLElement;

	// Debug panel
	private debugContainer!: HTMLElement;
	private debugContent!: HTMLElement;
	private debugLogs: string[] = [];

	// Model state
	private availableModels: Array<{ id: string; provider?: string; name?: string }> = [];
	private currentModel: string = "";
	private currentProvider: string = "";

	private messages: ChatMessage[] = [];
	private isStreaming = false;
	private currentAssistantMessage: ChatMessage | null = null;
	private currentAssistantContainer: HTMLElement | null = null;
	private currentAssistantRaw = "";

	constructor(leaf: WorkspaceLeaf, plugin: PiPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_PI_CHAT;
	}

	getDisplayText(): string {
		return "Pi";
	}

	getIcon(): string {
		return "message-square";
	}

	async onOpen() {
		this.contentEl.empty();
		this.contentEl.addClass("pi-chat-view");

		// Header
		const header = this.contentEl.createDiv({ cls: "pi-chat-header" });
		header.createEl("h3", { text: "Pi", cls: "pi-chat-title" });

		// Current model display (clickable)
		this.modelEl = header.createDiv({ cls: "pi-chat-model", text: "No model" });
		this.modelEl.onclick = () => this.showModelSwitcher();

		this.statusEl = header.createDiv({ cls: "pi-chat-status", text: "Disconnected" });

		// Messages container
		this.messagesEl = this.contentEl.createDiv({ cls: "pi-chat-messages" });

		// Input area
		const inputArea = this.contentEl.createDiv({ cls: "pi-chat-input-area" });

		this.inputEl = inputArea.createEl("textarea", {
			cls: "pi-chat-input",
			placeholder: "Talk to Pi... (Shift+Enter for newline)",
		});

		const buttons = inputArea.createDiv({ cls: "pi-chat-buttons" });

		this.sendBtn = buttons.createEl("button", { text: "Send", cls: "mod-cta" });
		this.abortBtn = buttons.createEl("button", { text: "Abort", cls: "mod-warning" });
		this.abortBtn.style.display = "none";

		// Event wiring
		this.sendBtn.onclick = () => this.handleSend();
		this.abortBtn.onclick = () => this.handleAbort();

		this.inputEl.addEventListener("keydown", (e) => {
			if (e.key === "Enter" && !e.shiftKey) {
				e.preventDefault();
				this.handleSend();
			}
		});

		// Try to connect lazily when user sends first message
		this.updateStatus("Ready (will connect on first message)");

		// === Debug panel (collapsed by default) ===
		this.debugContainer = this.contentEl.createDiv({ cls: "pi-debug-container" });

		const details = this.debugContainer.createEl("details", { cls: "pi-debug-details" });
		const summary = details.createEl("summary", { cls: "pi-debug-summary" });
		summary.createSpan({ text: "Debug log (for troubleshooting)" });

		const debugBody = details.createDiv({ cls: "pi-debug-body" });

		this.debugContent = debugBody.createEl("pre", { cls: "pi-debug-content" });
		this.debugContent.setText("No events yet. Send a message to start seeing RPC traffic.");

		// Button row
		const btnRow = debugBody.createDiv({ cls: "pi-debug-buttons" });

		const copyBtn = btnRow.createEl("button", {
			text: "Copy log",
			cls: "pi-debug-copy",
		});
		copyBtn.onclick = async () => {
			const textToCopy = this.debugLogs.length > 0 
				? this.debugLogs.join("\n") 
				: this.debugContent.getText();

			try {
				await navigator.clipboard.writeText(textToCopy);
				const originalText = copyBtn.getText();
				copyBtn.setText("Copied!");
				setTimeout(() => copyBtn.setText(originalText), 1500);
			} catch (e) {
				// Simple fallback: create a temporary textarea
				const textarea = document.createElement("textarea");
				textarea.value = textToCopy;
				document.body.appendChild(textarea);
				textarea.select();
				document.execCommand("copy");
				document.body.removeChild(textarea);

				new Notice("Debug log copied to clipboard");
				const originalText = copyBtn.getText();
				copyBtn.setText("Copied!");
				setTimeout(() => copyBtn.setText(originalText), 1500);
			}
		};

		const clearBtn = btnRow.createEl("button", {
			text: "Clear log",
			cls: "pi-debug-clear",
		});
		clearBtn.onclick = () => {
			this.debugLogs = [];
			this.debugContent.setText("Log cleared.");
		};
	}

	async onClose() {
		if (this.connection) {
			// We don't destroy here — the plugin owns the connection lifecycle
		}
	}

	private updateStatus(text: string) {
		this.statusEl.setText(text);
		this.logDebug(`[status] ${text}`);
	}

	private updateModelDisplay() {
		if (this.modelEl) {
			const display = this.currentProvider 
				? `${this.currentProvider} / ${this.currentModel || "?"}`
				: (this.currentModel || "No model");
			this.modelEl.setText(display);
			this.modelEl.title = "Click to switch model";
		}
	}

	private async showModelSwitcher() {
		if (!this.connection || this.availableModels.length === 0) {
			new Notice("No models available yet. Wait for connection or send a message first.");
			return;
		}

		// Simple model switcher using prompts for now (can be improved later)
		const options = this.availableModels.map(m => ({
			label: m.provider ? `${m.provider} / ${m.id}` : m.id,
			value: m
		}));

		// For a quick implementation, we'll use a basic approach:
		// Show a notice with instructions + add a proper command for switching.
		const current = this.currentProvider 
			? `${this.currentProvider}/${this.currentModel}` 
			: this.currentModel;

		new Notice(`Current: ${current}\nUse Command Palette → "Pi: Switch model" to change.`, 6000);
	}

	private logDebug(message: string, isError = false) {
		const time = new Date().toLocaleTimeString();
		const prefix = isError ? "❌ " : "";
		const line = `[${time}] ${prefix}${message}`;

		this.debugLogs.push(line);
		if (this.debugLogs.length > 80) {
			this.debugLogs.shift();
		}

		if (this.debugContent) {
			this.debugContent.setText(this.debugLogs.join("\n"));
			this.debugContent.scrollTop = this.debugContent.scrollHeight;
		}

		// Also log to Obsidian console for advanced users
		if (isError) {
			console.error("[Pi Debug]", message);
		} else {
			console.log("[Pi Debug]", message);
		}
	}

	private ensureConnection(): PiConnection {
		if (!this.connection) {
			const extraArgs = this.plugin.settings.extraCliArgs;
			const argsMsg = extraArgs ? ` with extra args: ${extraArgs}` : "";
			this.logDebug(`Creating Pi RPC connection (spawning pi --mode rpc${argsMsg})...`);
			this.connection = this.plugin.getConnection();

			this.connection.onEvent((event) => this.handleRpcEvent(event));
			this.logDebug("Pi RPC connection object created and event listener attached. Any auth plugins installed via 'pi install' should be loaded by Pi automatically.");

			// Automatically query available models + current state after connecting.
			setTimeout(async () => {
				try {
					// Get available models
					const modelsResponse = await this.connection!.getAvailableModels();
					const modelsData = (modelsResponse as any).data || modelsResponse;
					const rawModels = modelsData?.models || [];

					this.availableModels = rawModels.map((m: any) => ({
						id: m.id || m.name,
						provider: m.provider,
						name: m.name || m.id,
					}));

					const modelNames = this.availableModels.map(m => m.id).join(", ");
					this.logDebug(`Available models from Pi: ${modelNames || "(none)"}`);

					// Get current state
					const stateResponse = await this.connection!.getState();
					const state = (stateResponse as any).data || {};
					const currentModel = state.model?.id || state.model?.name || "";
					const currentProvider = state.model?.provider || "";

					this.currentModel = currentModel;
					this.currentProvider = currentProvider;
					this.updateModelDisplay();

					this.logDebug(`Current model: ${currentProvider ? currentProvider + " / " : ""}${currentModel || "(none)"}`);

					// Auto-apply preferred model if configured
					const settings = this.plugin.settings;
					if (settings.autoSetModelOnConnect && (settings.preferredModel || settings.preferredProvider)) {
						const prefModel = (settings.preferredModel || "").trim();
						const prefProv = (settings.preferredProvider || "").trim();

						// Resolve using the actual model entry reported by Pi so we send the exact provider
						// value (if any) that Pi associated with that model ID. This is required for many
						// routed models whose IDs contain "/" (e.g. OpenRouter free models).
						let targetEntry = this.availableModels.find(m => m.id === prefModel);

						// If user only set a preferred provider (no specific model), pick first available from it
						if (!targetEntry && prefProv && !prefModel) {
							targetEntry = this.availableModels.find(m => m.provider === prefProv);
						}

						if (targetEntry) {
							const tModel = targetEntry.id;
							const tProv = targetEntry.provider || undefined;

							if (tModel !== currentModel || tProv !== currentProvider) {
								const logProvider = tProv || "(auto)";
								this.logDebug(`Auto-switching to preferred model: ${logProvider}/${tModel}`);
								try {
									await this.connection!.setModel(tProv, tModel);
									this.currentModel = tModel;
									this.currentProvider = tProv || "";
									this.updateModelDisplay();
									this.logDebug(`Successfully switched to ${logProvider}/${tModel}`);

									// Re-fetch state to confirm Pi actually accepted the model (catches silent fallbacks)
									try {
										const confirmResp = await this.connection!.getState();
										const confirmed = (confirmResp as any).data?.model || {};
										const cModel = confirmed.id || confirmed.name || "";
										const cProv = confirmed.provider || "";
										if (cModel && (cModel !== tModel || cProv !== (tProv || ""))) {
											this.logDebug(`After switch, Pi now reports: ${cProv ? cProv + "/" : ""}${cModel}`, true);
										}
									} catch {}
								} catch (err) {
									this.logDebug(`Failed to set preferred model: ${err instanceof Error ? err.message : err}`, true);
								}
							}
						} else if (prefModel) {
							const hint = this.availableModels.length > 0
								? ` (first few available: ${this.availableModels.slice(0, 3).map(m => m.id).join(", ")})`
								: "";
							this.logDebug(`Preferred model "${prefModel}" not found in Pi's available models${hint}. Skipping auto-switch.`, true);
						}
					}

					// Loud warning if xai-auth is missing (user's Grok Heavy auth package)
					const hasXaiAuth = this.availableModels.some(m => m.id === "xai-auth" || m.provider === "xai-auth");
					if (!hasXaiAuth) {
						this.logDebug("⚠️ 'xai-auth' provider not found in available models. The pi-xai-oauth package did not register. Your Grok Heavy credentials may not be available in this session.", true);
					}
				} catch (e) {
					this.logDebug(`Failed to query Pi state/models: ${e instanceof Error ? e.message : e}`, true);
				}
			}, 900);
		}
		return this.connection;
	}

	private async handleSend() {
		const text = this.inputEl.value.trim();
		if (!text || this.isStreaming) return;

		this.addMessage({ role: "user", content: text });
		this.inputEl.value = "";

		this.isStreaming = true;
		this.updateButtons();

		try {
			this.logDebug(`Sending prompt: "${text.substring(0, 60)}${text.length > 60 ? "..." : ""}"`);
			const conn = this.ensureConnection();
			this.updateStatus("Thinking...");

			const response = await conn.send({ type: "prompt", message: text });
			this.logDebug(`Prompt command accepted by Pi (response success=${response.success})`);

			// Streaming will be handled via events
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			this.logDebug(`Failed to send prompt: ${msg}`, true);
			this.isStreaming = false;
			this.updateButtons();
			this.updateStatus("Error");
			new Notice(`Pi error: ${msg}`);
		}
	}

	private handleAbort() {
		if (!this.connection) return;

		this.connection.sendRaw({ type: "abort" });
		this.updateStatus("Aborting...");
	}

	private updateButtons() {
		this.sendBtn.style.display = this.isStreaming ? "none" : "";
		this.abortBtn.style.display = this.isStreaming ? "" : "none";
		this.inputEl.disabled = this.isStreaming;
	}

	/** Public API so main.ts can send contextual prompts */
	async sendPrompt(prompt: string) {
		this.addMessage({ role: "user", content: prompt });

		this.isStreaming = true;
		this.updateButtons();

		try {
			this.logDebug(`[context] Sending contextual prompt: "${prompt.substring(0, 50)}..."`);
			const conn = this.ensureConnection();
			this.updateStatus("Thinking...");

			await conn.send({ type: "prompt", message: prompt });
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			this.logDebug(`[context] Failed: ${msg}`, true);
			this.isStreaming = false;
			this.updateButtons();
			this.updateStatus("Error");
			new Notice(`Pi error: ${msg}`);
		}
	}

	private addMessage(msg: ChatMessage) {
		this.messages.push(msg);

		const el = this.messagesEl.createDiv({ cls: `pi-message pi-message-${msg.role}` });

		const header = el.createDiv({ cls: "pi-message-header" });
		header.createSpan({ text: msg.role === "user" ? "You" : msg.role === "assistant" ? "Pi" : msg.role });

		const body = el.createDiv({ cls: "pi-message-body" });

		if (msg.role === "tool") {
			body.createEl("strong", { text: msg.toolName || "tool" });
			body.createEl("pre", { text: msg.content });
		} else {
			body.setText(msg.content);
		}

		this.messagesEl.scrollTo(0, this.messagesEl.scrollHeight);

		return { el, body };
	}

	private handleRpcEvent(event: RpcEvent) {
		// Always log incoming events so we can see if anything is coming back from Pi
		if (event.type === "error") {
			this.logDebug(`RPC event: ${event.type} → ${event.error || "unknown"}`, true);
		} else if (event.type === "message_update") {
			const deltaType = (event as any).assistantMessageEvent?.type;
			this.logDebug(`RPC event: message_update (${deltaType || "?"})`);
		} else if (event.type === "message_start" || event.type === "message_end") {
			// Log the actual message payload — this is often where the real content lives
			const msg = (event as any).message;
			const role = msg?.role;
			const hasText = msg?.content ? JSON.stringify(msg.content).slice(0, 120) : "no content";
			this.logDebug(`RPC event: ${event.type} (role=${role || "?"}) content=${hasText}`);
		} else if (event.type === "stderr") {
			this.logDebug(`[stderr] ${(event as any).line}`, true);
		} else if (event.type === "spawn_info") {
			const info = event as any;
			if (info.command) this.logDebug(`Spawn command: ${info.command}`);
			if (info.cwd) this.logDebug(`Working dir: ${info.cwd}`);
			if (info.detectedAuthKeys && info.detectedAuthKeys.length > 0) {
				this.logDebug(`Detected auth-related keys: ${info.detectedAuthKeys.join(", ")}`);
			}
			if (info.note) {
				this.logDebug(info.note);
			}
		} else if (event.type === "response") {
			const cmd = (event as any).command;
			if (cmd === "get_available_models") {
				const modelCount = (event as any).data?.models?.length ?? 0;
				this.logDebug(`Response to get_available_models: ${modelCount} model(s) returned`);
			} else {
				this.logDebug(`RPC response for command: ${cmd || "(unknown)"}`);
			}
		} else {
			this.logDebug(`RPC event: ${event.type}`);
		}

		switch (event.type) {
			case "agent_start":
				this.logDebug("Pi agent started processing the prompt");
				this.updateStatus("Pi is working...");
				break;

			case "message_update": {
				const update = event as MessageUpdateEvent;
				const delta = update.assistantMessageEvent;

				if (!delta) return;

				if (delta.type === "text_delta" || delta.type === "text_start") {
					if (!this.currentAssistantMessage) {
						this.currentAssistantMessage = { role: "assistant", content: "" };
						const { body } = this.addMessage(this.currentAssistantMessage);
						this.currentAssistantContainer = body;
						this.currentAssistantRaw = "";
					}

					if (delta.delta) {
						this.currentAssistantRaw += delta.delta;
						// During streaming we show raw text for performance
						if (this.currentAssistantContainer) {
							this.currentAssistantContainer.setText(this.currentAssistantRaw);
						}
						this.messagesEl.scrollTo(0, this.messagesEl.scrollHeight);
					}
				}

				if (delta.type === "done" || delta.type === "text_end") {
					// Final render with rich Markdown (wikilinks, callouts, etc.)
					if (this.currentAssistantContainer && this.currentAssistantRaw) {
						this.currentAssistantContainer.empty();
						// Use Obsidian's renderer for beautiful output
						MarkdownRenderer.render(
							this.app,
							this.currentAssistantRaw,
							this.currentAssistantContainer,
							"", // source path
							new Component()
						);
					}

					this.currentAssistantMessage = null;
					this.currentAssistantContainer = null;
					this.currentAssistantRaw = "";
					this.isStreaming = false;
					this.updateButtons();
					this.updateStatus("Ready");
				}
				break;
			}

			case "tool_execution_start":
				this.addMessage({
					role: "tool",
					content: `Starting: ${(event as any).args ? JSON.stringify((event as any).args) : ""}`,
					toolName: (event as any).toolName,
				});
				break;

			case "tool_execution_end": {
				const res = (event as any).result;
				this.addMessage({
					role: "tool",
					content: typeof res === "string" ? res : JSON.stringify(res, null, 2),
					toolName: (event as any).toolName,
				});
				break;
			}

			case "agent_end":
				this.isStreaming = false;
				this.updateButtons();
				this.updateStatus("Ready");
				break;

			case "auto_retry_start":
				this.logDebug("Pi is auto-retrying the model call (often due to rate limits or empty response from upstream)", true);
				this.updateStatus("Retrying...");
				break;

			case "auto_retry_end":
				this.logDebug("Pi auto-retry sequence ended");
				this.updateStatus("Ready");
				break;

			case "message_end": {
				// Some Pi responses deliver the full assistant message here instead of (or in addition to) deltas
				const msg = (event as any).message;
				if (msg?.role === "assistant" && msg.content) {
					let text = "";

					// Try to extract plain text from content array
					if (Array.isArray(msg.content)) {
						text = msg.content
							.filter((c: any) => c.type === "text" && c.text)
							.map((c: any) => c.text)
							.join("\n\n");
					} else if (typeof msg.content === "string") {
						text = msg.content;
					}

					if (text && this.currentAssistantContainer) {
						this.currentAssistantContainer.empty();
						MarkdownRenderer.render(this.app, text, this.currentAssistantContainer, "", new Component());
						this.logDebug("Rendered full message from message_end event");
					} else if (text) {
						// No streaming container existed — create one now
						this.currentAssistantMessage = { role: "assistant", content: text };
						const { body } = this.addMessage(this.currentAssistantMessage);
						MarkdownRenderer.render(this.app, text, body, "", new Component());
						this.logDebug("Created and rendered message from message_end (no prior deltas)");
					} else {
						// Assistant message arrived but contained no usable text (common with rate-limited free OpenRouter models)
						this.logDebug("Assistant message_end arrived with empty content — upstream model returned nothing (rate limit, auth, or model error likely)", true);
					}
				}
				break;
			}

			case "error":
				this.isStreaming = false;
				this.updateButtons();
				this.updateStatus("Error");
				new Notice(`Pi: ${event.error || "Unknown error"}`);
				this.logDebug(`RPC error event received: ${event.error}`, true);
				break;
		}
	}
}
