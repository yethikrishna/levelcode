local M = {}
local config = require("levelcode.config")
local state = {
  job_id = nil,
  buf = nil,
  win = nil,
  cwd = nil,
  messages = {},
  pending = false,
}

local function levelcode_bin()
  return M.cfg.levelcode_cmd or "levelcode"
end

function M.is_running()
  return state.job_id ~= nil and vim.fn.jobwait({ state.job_id }, 0) == -1
end

function M.start(cwd)
  if M.is_running() then
    return true
  end
  cwd = cwd or vim.loop.cwd()
  state.cwd = cwd

  local bin = levelcode_bin()
  local args = { "--stdio", "--json" }
  if M.cfg.model then
    table.insert(args, "--model")
    table.insert(args, M.cfg.model)
  end

  local env = vim.fn.environ()
  if M.cfg.api_key and M.cfg.api_key ~= "" then
    env.LEVELCODE_API_KEY = M.cfg.api_key
  end

  local job_opts = {
    cwd = cwd,
    env = env,
    pty = false,
    rpc = true,
    on_stderr = function(_, data, _)
      for _, line in ipairs(data) do
        if line and line ~= "" then
          vim.schedule(function()
            M._on_log(line)
          end)
        end
      end
    end,
    on_exit = function(_, code, _)
      state.job_id = nil
      state.pending = false
      vim.schedule(function()
        M._on_exit(code)
      end)
    end,
  }

  state.job_id = vim.fn.jobstart({ bin, unpack(args) }, job_opts)
  if state.job_id <= 0 then
    vim.notify("LevelCode: failed to start " .. bin, vim.log.levels.ERROR)
    state.job_id = nil
    return false
  end
  return true
end

function M.stop()
  if state.job_id then
    vim.fn.jobstop(state.job_id)
    state.job_id = nil
  end
  state.pending = false
end

function M.send_prompt(prompt, opts)
  opts = opts or {}
  if not M.is_running() then
    local ok = M.start(opts.cwd)
    if not ok then
      return
    end
  end
  state.pending = true
  table.insert(state.messages, { role = "user", content = prompt })

  local payload = {
    jsonrpc = "2.0",
    id = math.floor(math.random() * 1e9),
    method = "workspace/executeCommand",
    params = {
      command = "levelcode.runPrompt",
      arguments = {
        { prompt = prompt, uri = opts.uri, filePath = opts.filePath, selection = opts.selection },
      },
    },
  }
  local ok, err = pcall(vim.rpcnotify, state.job_id, payload)
  if not ok then
    vim.notify("LevelCode: failed to send prompt: " .. tostring(err), vim.log.levels.ERROR)
    state.pending = false
  end
end

function M._on_log(line)
  if M.on_log then
    M.on_log(line)
  end
end

function M._on_exit(code)
  if code ~= 0 and code ~= 143 then
    vim.notify("LevelCode process exited with code " .. tostring(code), vim.log.levels.WARN)
  end
  if M.on_exit then
    M.on_exit(code)
  end
end

function M.run_terminal(prompt)
  local cmd = levelcode_bin()
  if prompt and prompt ~= "" then
    cmd = cmd .. " " .. vim.fn.shellescape(prompt)
  end
  vim.cmd("split | terminal " .. cmd)
  vim.cmd("startinsert")
end

function M.setup(cfg)
  M.cfg = config.merge(cfg)
  return M
end

M.state = state
return M
