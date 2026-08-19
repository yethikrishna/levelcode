local M = {}

function M.setup(user_config)
  local commands = require("levelcode.commands")
  return commands.setup(user_config)
end

M.client = require("levelcode.client")
M.commands = require("levelcode.commands")
M.ui = require("levelcode.ui")
M.config = require("levelcode.config")

return M
