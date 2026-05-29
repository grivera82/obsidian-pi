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

	// Advanced
	extraCliArgs: string; // space-separated extra arguments passed to `pi --mode rpc`
	verboseMode: boolean; // if true, automatically adds --verbose to the spawn command
	ttyEmulation: boolean; // wrap spawn with `script` to emulate a TTY (can help some auth packages)

	// Direct key support (convenience for testing other providers like OpenRouter)
	openrouterApiKey: string;
}

export const DEFAULT_SETTINGS: PiPluginSettings = {
	piBinaryPath: "pi",
	workingDirectory: "", // empty = use vault root at runtime
	defaultThinkingLevel: "medium",
	autoSaveChats: true,
	chatSaveFolder: "Pi Chats",

	preferredProvider: "",
	preferredModel: "",
	autoSetModelOnConnect: true,

	extraCliArgs: "",
	verboseMode: false,
	ttyEmulation: false,

	// Direct key support (convenience for testing other providers)
	openrouterApiKey: "",
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
			.setDesc("Model ID to auto-switch to on connect. For routed models (e.g. OpenRouter), paste the full ID shown in the model list such as 'meta-llama/llama-3.3-70b-instruct:free'. Preferred provider may be left blank for these.")
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
			.setDesc("Wraps the Pi process with `script` to simulate a real terminal. This can help some auth packages (like pi-xai-oauth) that behave differently without a TTY. Only works on macOS.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.ttyEmulation)
					.onChange(async (value) => {
						this.plugin.settings.ttyEmulation = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("OpenRouter API Key (optional)")
			.setDesc("Paste your OpenRouter key here for easy testing of other models. Injected as OPENROUTER_API_KEY on spawn. Note: free-tier OpenRouter models (:free) often have very low rate limits and may return empty responses or trigger retries.")
			.addText((text) =>
				text
					.setPlaceholder("sk-or-...")
					.setValue(this.plugin.settings.openrouterApiKey)
					.onChange(async (value) => {
						this.plugin.settings.openrouterApiKey = value.trim();
						await this.plugin.saveSettings();
					})
			);
	}
}
