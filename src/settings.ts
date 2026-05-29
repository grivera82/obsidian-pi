import { App, PluginSettingTab, Setting } from "obsidian";
import PiPlugin from "./main";

export interface PiPluginSettings {
	piBinaryPath: string;
	workingDirectory: string; // usually the vault root
	defaultThinkingLevel: "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
	autoSaveChats: boolean;
	chatSaveFolder: string;
}

export const DEFAULT_SETTINGS: PiPluginSettings = {
	piBinaryPath: "pi",
	workingDirectory: "", // empty = use vault root at runtime
	defaultThinkingLevel: "medium",
	autoSaveChats: true,
	chatSaveFolder: "Pi Chats",
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
	}
}
