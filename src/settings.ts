import { App, PluginSettingTab, Setting } from "obsidian";
import PiPlugin from "./main";

export interface PiPluginSettings {
	piBinaryPath: string;
	workingDirectory: string; // usually the vault root
	defaultThinkingLevel: "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
	autoSaveChats: boolean;
	chatSaveFolder: string;

	// Model / Provider preferences
	preferredProvider: string;   // e.g. "grok-build", "xai-auth"
	preferredModel: string;      // e.g. "grok-4.3"
	autoSetModelOnConnect: boolean;

	// Additional provider API keys (injected into the Pi process environment)
	xiaomiMimoApiKey: string; // XIAOMI_MIMO_API_KEY for pi-mimo-provider etc.
	openrouterApiKey: string; // OPENROUTER_API_KEY for OpenRouter routing / many models

	// Advanced
	extraCliArgs: string; // space-separated extra arguments passed to `pi --mode rpc`
	verboseMode: boolean; // if true, automatically adds --verbose to the spawn command
	ttyEmulation: boolean; // wrap spawn with `script` to emulate a TTY (can help some auth packages)
}

export const DEFAULT_SETTINGS: PiPluginSettings = {
	piBinaryPath: "pi",
	workingDirectory: "", // empty = use vault root at runtime
	defaultThinkingLevel: "medium",
	autoSaveChats: true,
	chatSaveFolder: "Pi Chats",

	preferredProvider: "",
	preferredModel: "grok-4.3",
	autoSetModelOnConnect: true,

	xiaomiMimoApiKey: "",
	openrouterApiKey: "",

	extraCliArgs: "",
	verboseMode: false,
	ttyEmulation: true,
};

export class PiSettingTab extends PluginSettingTab {
	plugin: PiPlugin;

	constructor(app: App, plugin: PiPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("h2", { text: "Pi Settings" });

		new Setting(containerEl)
			.setName("Pi binary path")
			.setDesc("Path to the 'pi' executable. Usually just 'pi' is fine. The plugin will auto-detect common LLM API keys from your environment.")
			.addText((text) =>
				text
					.setPlaceholder("pi")
					.setValue(this.plugin.settings.piBinaryPath)
					.onChange(async (value) => {
						this.plugin.settings.piBinaryPath = value.trim() || "pi";
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Working directory")
			.setDesc("Directory Pi will use as its working root (where it can read/write files). Leave blank to use your vault root.")
			.addText((text) =>
				text
					.setPlaceholder((this.plugin.app.vault.adapter as any).basePath || "Vault root")
					.setValue(this.plugin.settings.workingDirectory)
					.onChange(async (value) => {
						this.plugin.settings.workingDirectory = value.trim();
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Default thinking level")
			.setDesc("Reasoning effort for models that support it.")
			.addDropdown((dropdown) =>
				dropdown
					.addOptions({
						off: "Off",
						minimal: "Minimal",
						low: "Low",
						medium: "Medium",
						high: "High",
						xhigh: "Extra High (Codex models)",
					})
					.setValue(this.plugin.settings.defaultThinkingLevel)
					.onChange(async (value) => {
						this.plugin.settings.defaultThinkingLevel = value as PiPluginSettings["defaultThinkingLevel"];
						await this.plugin.saveSettings();
					})
			);

		containerEl.createEl("h3", { text: "Chat History" });

		new Setting(containerEl)
			.setName("Auto-save chats as notes")
			.setDesc("When you close a Pi session, save the conversation as a Markdown note.")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.autoSaveChats).onChange(async (value) => {
					this.plugin.settings.autoSaveChats = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName("Chat save folder")
			.setDesc("Folder inside your vault where conversations will be saved.")
			.addText((text) =>
				text
					.setPlaceholder("Pi Chats")
					.setValue(this.plugin.settings.chatSaveFolder)
					.onChange(async (value) => {
						this.plugin.settings.chatSaveFolder = value.trim() || "Pi Chats";
						await this.plugin.saveSettings();
					})
			);

		containerEl.createEl("h3", { text: "Model & Provider" });

		new Setting(containerEl)
			.setName("Preferred provider")
			.setDesc("Provider ID (e.g. 'grok-build', 'xai-auth'). Usually leave blank when using a full 'provider/model' string in Preferred model.")
			.addText((text) =>
				text
					.setPlaceholder("grok-build")
					.setValue(this.plugin.settings.preferredProvider)
					.onChange(async (value) => {
						this.plugin.settings.preferredProvider = value.trim();
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Preferred model")
			.setDesc("Model ID to auto-switch to on connect (e.g. 'grok-4.3' or 'grok-4.3-latest'). Leave blank to stay on whatever the pi CLI starts with.")
			.addText((text) =>
				text
					.setPlaceholder("grok-4.3")
					.setValue(this.plugin.settings.preferredModel)
					.onChange(async (value) => {
						this.plugin.settings.preferredModel = value.trim();
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Auto-switch model on connect")
			.setDesc("Automatically set your preferred provider/model when the Pi chat opens.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.autoSetModelOnConnect)
					.onChange(async (value) => {
						this.plugin.settings.autoSetModelOnConnect = value;
						await this.plugin.saveSettings();
					})
			);

		containerEl.createEl("h3", { text: "Additional API Keys" });

		const mimoKeySetting = new Setting(containerEl)
			.setName("Xiaomi MiMo API Key")
			.setDesc("Your Xiaomi MiMo key (sk-... or tp-...). IMPORTANT: This only sends the key to Pi. You must ALSO install + register the 'pi-mimo-provider' package in your Pi environment (see README). Without the provider package, no MiMo models will appear.");

		mimoKeySetting.addText((text) => {
			text
				.setPlaceholder("sk-... or tp-...")
				.setValue(this.plugin.settings.xiaomiMimoApiKey || "")
				.onChange(async (value) => {
					this.plugin.settings.xiaomiMimoApiKey = value.trim();
					await this.plugin.saveSettings();
				});
			// Use password input for the key
			text.inputEl.type = "password";
			text.inputEl.style.width = "100%";
		});

		const openrouterKeySetting = new Setting(containerEl)
			.setName("OpenRouter API Key")
			.setDesc("API key for OpenRouter (supports 100+ models from many providers through one key). Injected as OPENROUTER_API_KEY.");

		openrouterKeySetting.addText((text) => {
			text
				.setPlaceholder("sk-or-...")
				.setValue(this.plugin.settings.openrouterApiKey || "")
				.onChange(async (value) => {
					this.plugin.settings.openrouterApiKey = value.trim();
					await this.plugin.saveSettings();
				});
			text.inputEl.type = "password";
			text.inputEl.style.width = "100%";
		});

		new Setting(containerEl)
			.setName("Extra CLI arguments")
			.setDesc("Advanced: Extra arguments to pass to `pi --mode rpc` (space separated). Useful for debugging, e.g. `--verbose` or custom flags.")
			.addText((text) =>
				text
					.setPlaceholder("--verbose --some-flag value")
					.setValue(this.plugin.settings.extraCliArgs)
					.onChange(async (value) => {
						this.plugin.settings.extraCliArgs = value.trim();
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Verbose mode")
			.setDesc("Automatically adds `--verbose` when spawning Pi (can produce more output in the debug log and console).")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.verboseMode)
					.onChange(async (value) => {
						this.plugin.settings.verboseMode = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("TTY emulation (macOS)")
			.setDesc("Wraps the Pi process with `script` to simulate a real terminal. Enable this if your Grok auth (via pi-xai-oauth or similar) does not work from the plugin but works in your terminal.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.ttyEmulation)
					.onChange(async (value) => {
						this.plugin.settings.ttyEmulation = value;
						await this.plugin.saveSettings();
					})
			);
	}
}
