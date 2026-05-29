import { Plugin, WorkspaceLeaf, Notice } from "obsidian";
import { DEFAULT_SETTINGS, PiPluginSettings, PiSettingTab } from "./settings";
import { PiConnection } from "./rpc";
import { PiChatView, VIEW_TYPE_PI_CHAT } from "./view";

export default class PiPlugin extends Plugin {
	settings: PiPluginSettings;
	connection: PiConnection | null = null;

	async onload() {
		await this.loadSettings();

		// Register the chat view
		this.registerView(VIEW_TYPE_PI_CHAT, (leaf) => new PiChatView(leaf, this));

		// Ribbon icon
		this.addRibbonIcon("message-square", "Open Pi chat", () => {
			this.activateChatView();
		});

		// Commands
		this.addCommand({
			id: "open-pi-chat",
			name: "Open Pi chat",
			callback: () => this.activateChatView(),
		});

		this.addCommand({
			id: "ask-pi-about-current-note",
			name: "Ask Pi about current note",
			checkCallback: (checking) => {
				const activeFile = this.app.workspace.getActiveFile();
				if (activeFile) {
					if (!checking) {
						this.askPiAboutCurrentNote();
					}
					return true;
				}
				return false;
			},
		});

		this.addCommand({
			id: "pi-switch-model",
			name: "Pi: Switch model",
			callback: async () => {
				const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_PI_CHAT);
				const view = leaves[0]?.view as any;

				if (!view || !view.availableModels || view.availableModels.length === 0) {
					new Notice("Open the Pi chat view and wait for models to load first.");
					return;
				}

				// Simple implementation: cycle through available models for now
				const models = view.availableModels;
				const currentIndex = models.findIndex((m: any) => m.id === view.currentModel);
				const nextIndex = (currentIndex + 1) % models.length;
				const next = models[nextIndex];

				try {
					await view.connection?.setModel(next.provider, next.id);
					view.currentModel = next.id;
					view.currentProvider = next.provider || "";
					view.updateModelDisplay?.();
					new Notice(`Switched to ${next.provider ? next.provider + " / " : ""}${next.id}`);
				} catch (e) {
					new Notice("Failed to switch model: " + (e instanceof Error ? e.message : e));
				}
			},
		});

		// Settings tab
		this.addSettingTab(new PiSettingTab(this.app, this));

		// Status bar (desktop only)
		const statusBar = this.addStatusBarItem();
		statusBar.setText("Pi: Ready");
		this.registerDomEvent(statusBar, "click", () => this.activateChatView());
	}

	onunload() {
		if (this.connection) {
			this.connection.destroy();
			this.connection = null;
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	/**
	 * Get (or create) a connection to the Pi RPC process.
	 */
	getConnection(): PiConnection {
		if (this.connection && this.connection.isConnected()) {
			return this.connection;
		}

		const cwd = this.resolveWorkingDirectory();

		// Parse extra CLI args (space separated)
		let extraArgs = this.settings.extraCliArgs
			? this.settings.extraCliArgs.split(/\s+/).filter(Boolean)
			: [];

		// Automatically inject --verbose if the toggle is enabled
		if (this.settings.verboseMode && !extraArgs.includes("--verbose")) {
			extraArgs = ["--verbose", ...extraArgs];
		}

		// Build apiKeys object — this gets merged into the child process env
		const apiKeys: Record<string, string> = {};

		if (this.settings.openrouterApiKey) {
			apiKeys["OPENROUTER_API_KEY"] = this.settings.openrouterApiKey;
		}

		this.connection = new PiConnection({
			piBinaryPath: this.settings.piBinaryPath,
			cwd,
			extraArgs,
			apiKeys,
		});

		try {
			this.connection.connect();
		} catch (e) {
			new Notice(`Failed to start Pi: ${e instanceof Error ? e.message : e}`);
			throw e;
		}

		return this.connection;
	}

	private resolveWorkingDirectory(): string {
		if (this.settings.workingDirectory?.trim()) {
			return this.settings.workingDirectory.trim();
		}
		// Default to the vault root on the filesystem (desktop only)
		const adapter = this.app.vault.adapter as any;
		return adapter.basePath || process.cwd();
	}

	/**
	 * Opens (or focuses) the Pi chat sidebar view.
	 */
	async activateChatView() {
		const { workspace } = this.app;

		let leaf = workspace.getLeavesOfType(VIEW_TYPE_PI_CHAT)[0];

		if (!leaf) {
			leaf = workspace.getRightLeaf(false)!;
			await leaf.setViewState({ type: VIEW_TYPE_PI_CHAT, active: true });
		}

		workspace.revealLeaf(leaf);
	}

	async askPiAboutCurrentNote() {
		const file = this.app.workspace.getActiveFile();
		if (!file) {
			new Notice("No active note");
			return;
		}

		await this.activateChatView();

		setTimeout(async () => {
			const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_PI_CHAT);
			const view = leaves[0]?.view as PiChatView | undefined;
			if (view) {
				const content = await this.app.vault.read(file);
				const prompt = `Here is the current note (${file.path}):\n\n${content}\n\nWhat would you like me to do with it?`;
				await view.sendPrompt(prompt);
			}
		}, 300);
	}
}