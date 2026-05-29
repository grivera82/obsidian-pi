# Obsidian Pi

Chat with the [Pi coding agent](https://pi.dev/) directly inside Obsidian.

Talk to Pi to create notes, edit content, organize your vault, generate MOCs, refactor structure, answer questions about your notes, and more — all through a beautiful native-feeling sidebar chat.

> **Desktop only.** Requires the Pi CLI to be installed (`npm i -g @earendil-works/pi-coding-agent`).

## Features (Planned / In Progress)

- Full streaming chat with Pi in a sidebar view
- Native Obsidian Markdown rendering (callouts, wikilinks, Mermaid, math, code highlighting)
- Thinking blocks and collapsible tool results
- Easy context: current note, selection, active search
- Session management backed by Pi's native tree sessions
- One-click actions to insert responses or apply edits to your notes
- Model switching, thinking level control
- Status bar with token usage and cost

## Installation

### 1. Install the Pi CLI

```bash
npm install -g @earendil-works/pi-coding-agent
```

or use the official installer:

```bash
curl -fsSL https://pi.dev/install.sh | sh
```

### 2. Install the Plugin

**Recommended (Community Plugins):**

- Once published, search for **"Pi"** in Obsidian → Community Plugins.

**Manual / Development Install:**

1. Download the latest release from the [Releases page](https://github.com/grivera82/obsidian-pi/releases).
2. Extract `main.js`, `styles.css`, and `manifest.json` into:
   ```
   YourVault/.obsidian/plugins/obsidian-pi/
   ```
3. Reload Obsidian and enable the plugin in **Settings → Community Plugins**.
   - Enable "Pi" in Community Plugins

3. Configure the path to the `pi` binary and your vault working directory in plugin settings.

## Development

```bash
npm install
npm run dev
```

See the [Pi RPC documentation](https://github.com/earendil-works/pi/tree/main/packages/coding-agent/docs/rpc.md) for protocol details.

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
