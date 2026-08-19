local M = {}

M.defaults = {
  levelcode_cmd = "levelcode",
  api_key = os.getenv("LEVELCODE_API_KEY") or "",
  model = "base",
  chat = {
    width = 0.8,
    height = 0.7,
    border = "rounded",
    title = " LevelCode Chat ",
    title_pos = "center",
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
  auto_attach_lsp = true,
  lsp_bin = nil,
}

function M.merge(user_config)
  user_config = user_config or {}
  local result = vim.deepcopy(M.defaults)

  if user_config.chat then
    result.chat = vim.tbl_deep_extend("force", result.chat, user_config.chat)
  end
  if user_config.diff then
    result.diff = vim.tbl_deep_extend("force", result.diff, user_config.diff)
  end
  if user_config.keymaps then
    result.keymaps = vim.tbl_deep_extend("force", result.keymaps, user_config.keymaps)
  end

  result.levelcode_cmd = user_config.levelcode_cmd or result.levelcode_cmd
  result.api_key = user_config.api_key or result.api_key
  result.model = user_config.model or result.model
  if user_config.auto_attach_lsp ~= nil then
    result.auto_attach_lsp = user_config.auto_attach_lsp
  end
  result.lsp_bin = user_config.lsp_bin or result.lsp_bin

  return result
end

return M
