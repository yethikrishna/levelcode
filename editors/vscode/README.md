# LevelCode for VS Code

AI coding agent integration that brings LevelCode's streaming edits, inline diff suggestions, and chat panel directly into VS Code.

## Features

- **Chat Panel** (`LevelCode: Open Chat Panel`) — webview panel that streams agent responses in real time.
- **Inline Diffs** — suggested edits appear as gutter decorations with **Accept** / **Reject** code lenses.
- **Status Bar** — shows active model/agent and connection state.
- **Send Prompt** — right-click any editor selection to send it as a prompt to LevelCode.
- **Sidebar View** — activity bar icon opens the LevelCode sidebar with chat and pending edits.

## Commands

| Command | ID | Description |
|---|---|---|
| Start Agent | `levelcode.start` | Initialize the LevelCode SDK client. |
| Send Prompt | `levelcode.sendPrompt` | Send the current selection or input box as a prompt. |
| Open Chat Panel | `levelcode.openPanel` | Open the webview chat panel. |
| Accept Edit | `levelcode.acceptEdit` | Apply a suggested inline edit. |
| Reject Edit | `levelcode.rejectEdit` | Dismiss a suggested inline edit. |

## Setup

1. Run `npm install` in `editors/vscode/`.
2. Run `npm run compile` (or `npm run watch` for development).
3. Open this folder in VS Code and press **F5** to launch the Extension Development Host.
4. Set your API key via **Settings → LevelCode → Api Key** or the `LEVELCODE_API_KEY` environment variable.

## Configuration

| Setting | Default | Purpose |
|---|---|---|
| `levelcode.apiKey` | `""` | LevelCode API key. |
| `levelcode.model` | `"base"` | Default agent/model. |
| `levelcode.sdkPath` | `""` | Custom path to the `levelcode` CLI binary. |
| `levelcode.autoStart` | `false` | Start the agent on launch. |

## Development

```bash
cd editors/vscode
npm install
npm run watch   # keep tsc running in a terminal
# Press F5 in VS Code to launch
```

Packaging:
```bash
npm install -g @vscode/vsce
npm run package
```
