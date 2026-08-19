local M = {}
local client = require("levelcode.client")
local ui = require("levelcode.ui")

function M.setup(user_config)
  local cfg = require("levelcode.config")
  M.cfg = cfg.merge(user_config)
  client.cfg = M.cfg
  ui.cfg = M.cfg

  M._create_commands()
  M._create_keymaps()

  if M.cfg.auto_attach_lsp then
    M._attach_lsp()
  end

  vim.api.nvim_create_user_command("LevelCode", function(opts)
    local args = opts.args or ""
    if args == "" then
      ui.toggle_chat()
    else
      client.send_prompt(args)
    end
  end, { nargs = "?", desc = "Open LevelCode chat or run a prompt" })

  return M
end

function M._create_commands()
  vim.api.nvim_create_user_command("LevelCodeSend", function(opts)
    local args = opts.args
    if args and args ~= "" then
      ui.toggle_chat()
      client.send_prompt(args)
      return
    end
    vim.ui.input({ prompt = "LevelCode prompt: " }, function(prompt)
      if prompt and prompt ~= "" then
        ui.toggle_chat()
        client.send_prompt(prompt)
      end
    end)
  end, { nargs = "?", desc = "Send a prompt to LevelCode" })

  vim.api.nvim_create_user_command("LevelCodeChat", function()
    ui.toggle_chat()
  end, { desc = "Toggle LevelCode chat window" })

  vim.api.nvim_create_user_command("LevelCodeExplain", function()
    local selection = M._get_visual_selection()
    local prompt = "Explain the following code:\n\n" .. (selection or M._current_line())
    ui.toggle_chat()
    client.send_prompt(prompt)
  end, { desc = "Ask LevelCode to explain the current selection" })

  vim.api.nvim_create_user_command("LevelCodeRefactor", function()
    local selection = M._get_visual_selection()
    if not selection or selection == "" then
      vim.notify("LevelCode: select code to refactor first", vim.log.levels.WARN)
      return
    end
    local prompt = "Refactor the following code to be cleaner and more idiomatic:\n\n" .. selection
    ui.toggle_chat()
    client.send_prompt(prompt)
  end, { desc = "Refactor current selection with LevelCode" })

  vim.api.nvim_create_user_command("LevelCodeDiff", function()
    if not client.state.pending_edit then
      vim.notify("LevelCode: no pending diff", vim.log.levels.WARN)
      return
    end
    ui.show_diff(client.state.pending_edit)
  end, { desc = "Show pending LevelCode edit diff" })
end

function M._create_keymaps()
  local km = M.cfg.keymaps or {}
  local function map(key, cmd, mode)
    mode = mode or "n"
    if not key then
      return
    end
    vim.keymap.set(mode, key, cmd, { silent = true, desc = "LevelCode" })
  end
  map(km.toggle_chat, "<cmd>LevelCodeChat<cr>")
  map(km.send_prompt, "<cmd>LevelCodeSend<cr>")
  map(km.explain, "<cmd>LevelCodeExplain<cr>", "v")
end

function M._attach_lsp()
  local lsp_bin = M.cfg.lsp_bin
  if not lsp_bin then
    return
  end
  local ok = pcall(function()
    vim.lsp.start({
      name = "levelcode",
      cmd = { lsp_bin, "--lsp" },
      root_dir = vim.fn.getcwd(),
      on_attach = function(_, bufnr)
        vim.keymap.set("n", "<leader>la", vim.lsp.buf.code_action, { buffer = bufnr, desc = "LevelCode code actions" })
      end,
    })
  end)
  if not ok then
    vim.schedule(function()
      vim.notify("LevelCode LSP not attached (binary not found or failed)", vim.log.levels.INFO)
    end)
  end
end

function M._get_visual_selection()
  local mode = vim.fn.mode()
  if mode ~= "v" and mode ~= "V" then
    return nil
  end
  local s_start = vim.fn.getpos("'<")
  local s_end = vim.fn.getpos("'>")
  local lines = vim.fn.getline(s_start[2], s_end[2])
  if #lines == 0 then
    return nil
  end
  return table.concat(lines, "\n")
end

function M._current_line()
  return vim.api.nvim_get_current_line()
end

return M
