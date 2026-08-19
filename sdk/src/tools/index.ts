// Tool handlers for the LevelCode SDK
import { changeFile } from './change-file'
import { codeSearch } from './code-search'
import { glob } from './glob'
import { listDirectory } from './list-directory'
import { getFiles } from './read-files'
import { remember } from './remember'
import { repoMap } from './repo-map'
import { runFileChangeHooks } from './run-file-change-hooks'
import { runTerminalCommand } from './run-terminal-command'
import { verifyChanges } from './verify-changes'

// Export tools under Tools namespace
export const ToolHelpers = {
  runTerminalCommand,
  codeSearch,
  glob,
  listDirectory,
  getFiles,
  runFileChangeHooks,
  changeFile,
  verifyChanges,
  repoMap,
  remember,
}
