# LevelCode for Neovim

Neovim Lua plugin that brings LevelCode AI coding agent into your editor: a floating chat window, streaming responses, inline diff previews, and optional LSP integration.

## Requirements

- Neovim ≥ 0.9 (LuaJIT, `vim.api`, `vim.lsp`, `vim.fn`)
- The `levelcode` CLI available on your `$PATH` (or set via `levelcode_cmd`)
- A LevelCode API key (set via `LEVELCODE_API_KEY` env var or config option)

## Installation

### lazy.nvim

```lua
{
  "yethikrishna/levelcode",
  -- If you develop locally, point to the monorepo path instead:
  -- dir = "/path/to/levelcode/editors/nvim",
  config = function()
    require("levelcode").setup({
      api_key = "", -- or leave empty to read LEVELCODE_API_KEY
      model = "base",
      keymaps = {
        toggle_chat = "<leader>lc",
        send_prompt = "<leader>lp",
        explain = "<leader>le",
      },
    })
  end,
},
```

### packer.nvim

```lua
use {
  "yethikrishna/levelcode",
  -- For local dev:
  -- "/path/to/levelcode/editors/nvim",
  config = function()
    require("levelcode").setup()
  end,
}
```

### vim-plug

```vim
Plug "yethikrishna/levelcode"
lua << EOF
require("levelcode").setup()
EOF
```

## Commands

| Command | Description |
|---|---|
| `:LevelCode [prompt]` | Toggle the chat window, or send a prompt directly if provided. |
| `:LevelCodeSend [prompt]` | Send a prompt (prompts if no argument given). |
| `:LevelCodeChat` | Toggle the floating chat window. |
| `:LevelCodeExplain` | Explain the current visual selection. |
| `:LevelCodeRefactor` | Refactor the current visual selection. |
| `:LevelCodeDiff` | Show pending edit diff in a floating window. |

## Default keymaps

- `<leader>lc` — toggle chat
- `<leader>lp` — send prompt (input box)
- `<leader>le` — explain selection (visual mode)

## Configuration

```lua
require("levelcode").setup({
  levelcode_cmd = "levelcode",     -- path to the CLI binary
  api_key = "",                    -- defaults to LEVELCODE_API_KEY env var
  model = "base",                  -- agent/model id
  chat = {
    width = 0.8,
    height = 0.7,
    border = "rounded",
    title = " LevelCode Chat ",
  },
  diff = {
    width = 0.5,
    height = 0.6,
    border = "single",
  },
  keymaps = {
    toggle_chat = "<leader>lc",
    send_prompt = "<leader>lp",
    explain = "<leader>le",
  },
  auto_attach_lsp = true,          -- start the LevelCode LSP server when available
  lsp_bin = nil,                   -- path to the LSP binary (if not levelcode --lsp)
})
```

## LSP integration (optional)

Set `lsp_bin` to the LevelCode LSP bridge binary to get code actions directly from your LSP client (e.g., via `vim.lsp.buf.code_action()`). The bridge exposes:

- `textDocument/codeAction` — AI refactor/explain actions
- `workspace/executeCommand` — `levelcode.runPrompt`, `levelcode.applyRefactor`, `levelcode.explainCode`
- `textDocument/publishDiagnostics` — nudges on `TODO` / `FIXME` markers

## Lua API

```lua
local lc = require("levelcode")
lc.setup({ ... })
lc.ui.toggle_chat()
lc.client.send_prompt("Refactor this function", { filePath = vim.api.nvim_buf_get_name(0) })
lc.ui.show_diff({ oldContent = "a", newContent = "b", filePath = "foo.lua" })
```

## Plugin layout

```
editors/nvim/
├── lua/levelcode/
│   ├── init.lua        -- main entry, setup()
│   ├── config.lua      -- default configuration + merge
│   ├── client.lua      -- CLI job, JSON-RPC client
│   ├── commands.lua    -- :LevelCode* user commands, keymaps
│   └── ui.lua          -- floating chat & diff windows
├── plugin/levelcode.lua
└── README.md
```
