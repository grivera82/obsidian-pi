# Obsidian Pi

Chat with **Pi** (or **Grok** models through the pi CLI) directly inside Obsidian.

Use the powerful `pi` CLI agent inside your vault for note creation, editing, refactoring, tool use, and reasoning — with excellent support for Grok models (grok-build, grok-4.3, etc.).

This plugin gives you a native-feeling sidebar chat with full streaming, thinking visibility, tool call transparency, and model switching.

> **Desktop only.** Requires the `pi` CLI.

## Why use this with Grok?

The `pi` CLI has excellent support for Grok models (via providers like `grok-build` and `xai-auth`). This plugin includes robust model auto-switching, good debug logging, and reliable streaming — often better than direct headless modes for agentic workflows.

## Installation

### 1. Install / Update the Pi CLI

Make sure you have the `pi` command available and that it can access Grok models (e.g. via `pi models` or your auth setup).

### 2. The Plugin

The plugin is already set up via symlinks in your vault (pointing to this project).

**To enable it:**

1. In Obsidian → **Settings → Community plugins**
2. Disable the "Grok" plugin (if you previously installed the experimental obsidian-grok version)
3. Enable **"Pi"**
4. Reload if necessary

### 3. Recommended Settings for Grok

In the Pi plugin settings:

- **Pi binary path**: `pi` (or full path to your pi binary)
- **Preferred model**: `grok-4.3` (or `grok-4.3-latest`, `grok-build`, etc. — use whatever your `pi` lists)
- **Auto-switch model on connect**: On

This will automatically switch to your preferred Grok model when you open the chat.

## Development

```bash
cd ~/Projects/obsidian-pi
npm run dev
```

Changes to `main.js` are immediately live because of the symlinks in your vault.

## Key Features

- Rich streaming with thinking blocks
- Tool execution visibility
- Clickable model picker in the chat header (fuzzy search across all providers Pi knows about)
- Reliable model switching (including auto-switch on connect)
- Excellent debug panel for troubleshooting Grok + pi connections (now also shows exactly when duplicate renders from the pi event stream are prevented)
- Works great with Grok via the pi CLI's native auth (e.g. `pi-xai-oauth`) — no extra keys needed in the plugin

**Recent reliability improvement**: The plugin now correctly handles the case where the underlying `pi` CLI sends *both* incremental streaming events (`message_update` with `text_delta`/`text_end`) *and* a later `message_end` event containing the full assistant message for the same turn. This previously caused the same response to appear twice for many users. The fix includes an explicit turn-finalization flag and much clearer debug logging when the plugin safely skips a duplicate render.

## Authentication (Grok)

The plugin does **not** manage Grok authentication. It just runs your already-configured `pi` CLI.

Because Obsidian is a GUI app, it doesn't inherit your full terminal environment by default (especially on macOS). The plugin uses several techniques to work around this:

- Runs `pi` through your login shell (`zsh -l` or your `$SHELL -l`)
- Copies all `XAI_*`, `GROK_*`, and `PI_*` environment variables
- TTY emulation is **enabled by default** (uses `script` wrapper)

### If Grok auth doesn't work in the plugin but works in Terminal:

1. Make sure TTY emulation is enabled in plugin settings (it is on by default now).
2. Fully quit and restart Obsidian (important after changing the setting).
3. Check the debug panel for "Detected auth-related keys" and "Grok / xAI related env vars".
4. Confirm that `pi` can use Grok normally when you run it in your normal terminal.

Common working setup: Install auth with `pi install pi-xai-oauth` (or equivalent) in Terminal, then the plugin should pick it up.

## Using other providers (Xiaomi MiMo, OpenRouter, etc.)

The plugin works with **any model/provider** that your `pi` CLI supports — not just Grok.

### Xiaomi MiMo (MiMo-V2.5 series)

**Two things are required** — the key alone is not enough.

1. **Install + register the provider package in Pi** (do this in your normal terminal first):
   ```bash
   bun add pi-mimo-provider
   ```
   Then register it (usually by adding to `~/.pi/agent/settings.json` under `packages`, or via `--extension`). See the [pi-mimo-provider](https://github.com/agustif/pi-mimo-provider) repo for exact steps.

2. **Give the plugin your API key** (so it reaches the Pi process reliably on macOS):
   - Best: Paste it into **Settings → Community plugins → Pi → Additional API Keys → Xiaomi MiMo API Key**
   - Alternative: Set `XIAOMI_MIMO_API_KEY` in your shell and restart Obsidian.

3. Open (or reopen) the Pi chat. The models (`mimo-v2.5-pro`, `mimo-v2.5`, etc.) should appear in the model picker.

If you set the key but still don't see MiMo models, open the **debug panel** at the bottom of the chat view. The plugin now prints clear step-by-step instructions when it detects this exact situation.

The plugin automatically injects the key as `XIAOMI_MIMO_API_KEY` (highest priority).

### OpenRouter

OpenRouter is one of the easiest ways to access 100+ models (including many Grok, Claude, GPT, Gemini, Llama, DeepSeek, Qwen, etc.) through a single key.

1. Get an API key at [openrouter.ai/keys](https://openrouter.ai/keys).

2. Provide the key **either**:
   - Via environment variable:
     ```bash
     export OPENROUTER_API_KEY="sk-or-..."
     ```
   - **Or** (more reliable on macOS): Paste it into  
     **Settings → Community plugins → Pi → Additional API Keys → OpenRouter API Key**

3. In Pi, switch models to any OpenRouter-routed model (e.g. `openrouter/anthropic/claude-3.5-sonnet`, `openrouter/x-ai/grok-4`, `openrouter/qwen/qwen3-235b-a22b`, etc.). Many people use OpenRouter + Pi for easy model experimentation without installing separate provider packages.

The plugin automatically detects `OPENROUTER_API_KEY` and `OPENROUTER_KEY` from your environment and injects any key entered in settings.

## Notes

If you were previously using the experimental `obsidian-grok` direct integration, you can safely disable it and use this plugin instead for a more mature experience with Grok models.

## License

MIT (plugin) + respects Pi's license.

## First time developing plugins?

Quick starting guide for new plugin devs:

- Check if [someone already developed a plugin for what you want](https://obsidian.md/plugins)! There might be an existing plugin similar enough that you can partner up with.
- Make a copy of this repo as a template with the "Use this template" button (login to GitHub if you don't see it).
- Clone your repo to a local development folder. For convenience, you can place this folder in your `.obsidian/plugins/your-plugin-name` folder.
- Install NodeJS, then run `npm i` in the command line under your repo folder.
- Run `npm run dev` to compile your plugin from `main.ts` to `main.js`.
- Make changes to `main.ts` (or create new `.ts` files). Those changes should be automatically compiled into `main.js`.
- Reload Obsidian to load the new version of your plugin.
- Enable plugin in settings window.
- For updates to the Obsidian API run `npm update` in the command line under your repo folder.

## Releasing new releases

- Update your `manifest.json` with your new version number, such as `1.0.1`, and the minimum Obsidian version required for your latest release.
- Update your `versions.json` file with `"new-plugin-version": "minimum-obsidian-version"` so older versions of Obsidian can download an older version of your plugin that's compatible.
- Create new GitHub release using your new version number as the "Tag version". Use the exact version number, don't include a prefix `v`. See here for an example: https://github.com/obsidianmd/obsidian-sample-plugin/releases
- Upload the files `manifest.json`, `main.js`, `styles.css` as binary attachments. Note: The manifest.json file must be in two places, first the root path of your repository and also in the release.
- Publish the release.

> You can simplify the version bump process by running `npm version patch`, `npm version minor` or `npm version major` after updating `minAppVersion` manually in `manifest.json`.
> The command will bump version in `manifest.json` and `package.json`, and add the entry for the new version to `versions.json`

## Adding your plugin to the community plugin list

- Check the [plugin guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines).
- Publish an initial version.
- Make sure you have a `README.md` file in the root of your repo.
- Make a pull request at https://github.com/obsidianmd/obsidian-releases to add your plugin.

## How to use

- Clone this repo.
- Make sure your NodeJS is at least v16 (`node --version`).
- `npm i` or `yarn` to install dependencies.
- `npm run dev` to start compilation in watch mode.

## Manually installing the plugin

- Copy over `main.js`, `styles.css`, `manifest.json` to your vault `VaultFolder/.obsidian/plugins/your-plugin-id/`.

## Improve code quality with eslint
- [ESLint](https://eslint.org/) is a tool that analyzes your code to quickly find problems. You can run ESLint against your plugin to find common bugs and ways to improve your code. 
- This project already has eslint preconfigured, you can invoke a check by running`npm run lint`
- Together with a custom eslint [plugin](https://github.com/obsidianmd/eslint-plugin) for Obsidan specific code guidelines.
- A GitHub action is preconfigured to automatically lint every commit on all branches.

## Funding URL

You can include funding URLs where people who use your plugin can financially support it.

The simple way is to set the `fundingUrl` field to your link in your `manifest.json` file:

```json
{
    "fundingUrl": "https://buymeacoffee.com"
}
```

If you have multiple URLs, you can also do:

```json
{
    "fundingUrl": {
        "Buy Me a Coffee": "https://buymeacoffee.com",
        "GitHub Sponsor": "https://github.com/sponsors",
        "Patreon": "https://www.patreon.com/"
    }
}
```

## API Documentation

See https://docs.obsidian.md
