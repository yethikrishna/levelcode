local M = {}
local client = require("levelcode.client")
local state = {
  chat = { buf = nil, win = nil, visible = false },
  diff = { buf = nil, win = nil, visible = false },
}

local function float_opts(cfg)
  local columns = vim.o.columns
  local lines = vim.o.lines
  local width = math.floor(columns * cfg.width)
  local height = math.floor(lines * cfg.height)
  local col = math.floor((columns - width) / 2)
  local row = math.floor((lines - height) / 2)
  return {
    relative = "editor",
    width = width,
    height = height,
    col = col,
    row = row,
    style = "minimal",
    border = cfg.border or "rounded",
    title = cfg.title,
    title_pos = cfg.title_pos or "center",
  }
end

local function create_chat_buffer()
  if state.chat.buf and vim.api.nvim_buf_is_valid(state.chat.buf) then
    return state.chat.buf
  end
  local buf = vim.api.nvim_create_buf(false, true)
  vim.api.nvim_buf_set_option(buf, "filetype", "levelcode-chat")
  vim.api.nvim_buf_set_option(buf, "buftype", "nofile")
  vim.api.nvim_buf_set_option(buf, "bufhidden", "hide")
  vim.api.nvim_buf_set_option(buf, "swapfile", false)
  vim.api.nvim_buf_set_lines(buf, 0, -1, false, {
    "Welcome to LevelCode for Neovim",
    "================================",
    "",
    "Type your prompt below and press <CR> to send (i to enter insert mode).",
    "",
  })

  vim.api.nvim_buf_set_keymap(buf, "n", "q", "<cmd>lua require('levelcode.ui').close_chat()<CR>", { noremap = true, silent = true })
  vim.api.nvim_buf_set_keymap(buf, "n", "<Esc>", "<cmd>lua require('levelcode.ui').close_chat()<CR>", { noremap = true, silent = true })
  vim.api.nvim_buf_set_keymap(buf, "i", "<CR>", "<cmd>lua require('levelcode.ui')._submit_from_chat()<CR>", { noremap = true, silent = true })
  vim.api.nvim_buf_set_keymap(buf, "n", "<CR>", "<cmd>lua require('levelcode.ui')._submit_from_chat()<CR>", { noremap = true, silent = true })

  state.chat.buf = buf
  return buf
end

function M.open_chat()
  local cfg = M.cfg or require("levelcode.config").defaults
  local buf = create_chat_buffer()
  if state.chat.win and vim.api.nvim_win_is_valid(state.chat.win) then
    vim.api.nvim_set_current_win(state.chat.win)
    state.chat.visible = true
    return
  end
  local opts = float_opts(cfg.chat)
  local win = vim.api.nvim_open_win(buf, true, opts)
  vim.api.nvim_win_set_option(win, "wrap", true)
  vim.api.nvim_win_set_option(win, "winblend", 10)
  state.chat.win = win
  state.chat.visible = true
  M._scroll_chat_to_bottom()

  client.on_log = function(line)
    M._append_line("[log] " .. line)
  end
end

function M.close_chat()
  if state.chat.win and vim.api.nvim_win_is_valid(state.chat.win) then
    vim.api.nvim_win_close(state.chat.win, true)
  end
  state.chat.win = nil
  state.chat.visible = false
end

function M.toggle_chat()
  if state.chat.visible then
    M.close_chat()
  else
    M.open_chat()
  end
end

function M._append_line(line)
  if not state.chat.buf or not vim.api.nvim_buf_is_valid(state.chat.buf) then
    return
  end
  vim.schedule(function()
    local lines = vim.split(line, "\n", { plain = true })
    local last = vim.api.nvim_buf_line_count(state.chat.buf)
    vim.api.nvim_buf_set_lines(state.chat.buf, last, last, false, lines)
    M._scroll_chat_to_bottom()
  end)
end

function M._scroll_chat_to_bottom()
  if state.chat.win and vim.api.nvim_win_is_valid(state.chat.win) and state.chat.buf then
    local count = vim.api.nvim_buf_line_count(state.chat.buf)
    vim.api.nvim_win_set_cursor(state.chat.win, { math.max(1, count), 0 })
  end
end

function M._submit_from_chat()
  if not state.chat.buf or not vim.api.nvim_buf_is_valid(state.chat.buf) then
    return
  end
  local lines = vim.api.nvim_buf_get_lines(state.chat.buf, 0, -1, false)
  local prompt_lines = {}
  local collecting = false
  for i = #lines, 1, -1 do
    local line = lines[i]
    if line:match("^%s*$") and collecting then
      break
    end
    if not line:match("^%s*$") and not line:match("^%[log%]") then
      collecting = true
      table.insert(prompt_lines, 1, line)
    end
  end
  local prompt = table.concat(prompt_lines, "\n"):gsub("^%s+", ""):gsub("%s+$", "")
  if prompt == "" then
    vim.notify("LevelCode: prompt is empty", vim.log.levels.WARN)
    return
  end
  M._append_line("")
  M._append_line("You: " .. prompt)
  M._append_line("LevelCode: ...")
  local current_file = vim.api.nvim_buf_get_name(0)
  client.send_prompt(prompt, { filePath = current_file ~= "" and current_file or nil })
end

function M.show_diff(edit)
  local cfg = M.cfg or require("levelcode.config").defaults
  local buf = state.diff.buf
  if not buf or not vim.api.nvim_buf_is_valid(buf) then
    buf = vim.api.nvim_create_buf(false, true)
    vim.api.nvim_buf_set_option(buf, "filetype", "diff")
    vim.api.nvim_buf_set_option(buf, "buftype", "nofile")
    state.diff.buf = buf
  end
  local diff_text = M._make_diff(edit.oldContent or "", edit.newContent or "", edit.filePath or "buffer")
  vim.api.nvim_buf_set_lines(buf, 0, -1, false, vim.split(diff_text, "\n", { plain = true }))
  if state.diff.win and vim.api.nvim_win_is_valid(state.diff.win) then
    vim.api.nvim_set_current_win(state.diff.win)
    return
  end
  local opts = float_opts(cfg.diff)
  opts.title = " LevelCode Diff "
  local win = vim.api.nvim_open_win(buf, true, opts)
  vim.api.nvim_win_set_option(win, "wrap", false)
  state.diff.win = win
  state.diff.visible = true
end

function M._make_diff(old, new, path)
  local old_lines = vim.split(old, "\n", { plain = true })
  local new_lines = vim.split(new, "\n", { plain = true })
  local out = {}
  table.insert(out, "--- a/" .. path)
  table.insert(out, "+++ b/" .. path)
  table.insert(out, "@@ proposed edit @@")
  local max = math.max(#old_lines, #new_lines)
  for i = 1, max do
    local o = old_lines[i]
    local n = new_lines[i]
    if o == n and o ~= nil then
      table.insert(out, " " .. o)
    else
      if o ~= nil then
        table.insert(out, "-" .. o)
      end
      if n ~= nil then
        table.insert(out, "+" .. n)
      end
    end
  end
  return table.concat(out, "\n")
end

function M._on_message(msg)
  if msg.type == "message" or msg.type == "thinking" then
    M._append_line(msg.content or "")
  elseif msg.type == "done" then
    M._append_line("")
    M._append_line("[done]")
  elseif msg.type == "error" then
    M._append_line("Error: " .. (msg.content or ""))
  end
end

client.on_message = M._on_message

return M
