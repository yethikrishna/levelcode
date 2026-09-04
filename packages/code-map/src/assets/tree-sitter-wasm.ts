/// <reference path="./wasm.d.ts" />

import treeSitterWasm from '../../../../node_modules/web-tree-sitter/tree-sitter.wasm' with {
  type: 'file',
}
import treeSitterJavascriptWasm from '../../../../node_modules/@vscode/tree-sitter-wasm/wasm/tree-sitter-javascript.wasm' with {
  type: 'file',
}
import treeSitterTypescriptWasm from '../../../../node_modules/@vscode/tree-sitter-wasm/wasm/tree-sitter-typescript.wasm' with {
  type: 'file',
}
import treeSitterTsxWasm from '../../../../node_modules/@vscode/tree-sitter-wasm/wasm/tree-sitter-tsx.wasm' with {
  type: 'file',
}
import treeSitterPythonWasm from '../../../../node_modules/@vscode/tree-sitter-wasm/wasm/tree-sitter-python.wasm' with {
  type: 'file',
}
import treeSitterGoWasm from '../../../../node_modules/@vscode/tree-sitter-wasm/wasm/tree-sitter-go.wasm' with {
  type: 'file',
}
import treeSitterRustWasm from '../../../../node_modules/@vscode/tree-sitter-wasm/wasm/tree-sitter-rust.wasm' with {
  type: 'file',
}
import treeSitterJavaWasm from '../../../../node_modules/@vscode/tree-sitter-wasm/wasm/tree-sitter-java.wasm' with {
  type: 'file',
}
import treeSitterRubyWasm from '../../../../node_modules/@vscode/tree-sitter-wasm/wasm/tree-sitter-ruby.wasm' with {
  type: 'file',
}
import treeSitterCsharpWasm from '../../../../node_modules/@vscode/tree-sitter-wasm/wasm/tree-sitter-c-sharp.wasm' with {
  type: 'file',
}
import treeSitterCppWasm from '../../../../node_modules/@vscode/tree-sitter-wasm/wasm/tree-sitter-cpp.wasm' with {
  type: 'file',
}

/**
 * Tree-sitter WASM assets embedded in compiled binaries.
 *
 * Under `bun build --compile`, `with { type: 'file' }` imports become
 * embedded assets whose import-time value is a readable path into the
 * executable's virtual filesystem (`B:\~BUN\root\...` on Windows,
 * `/$bunfs/root/...` elsewhere). Under `bun dev` they resolve to the real
 * node_modules paths. Either way the value is an ordinary filesystem path
 * the emscripten loader can read.
 *
 * This exists because `require.resolve('web-tree-sitter')` — the previous
 * resolution path in init-node — is resolved by Bun's compiler at BUILD
 * time and baked into the binary (the CI runner's path), which crashes at
 * runtime on any other machine.
 */

const asPath = (v: unknown): string => v as unknown as string

export const TREE_SITTER_WASM_PATHS: Record<string, string> = {
  'tree-sitter.wasm': asPath(treeSitterWasm),
  'tree-sitter-javascript.wasm': asPath(treeSitterJavascriptWasm),
  'tree-sitter-typescript.wasm': asPath(treeSitterTypescriptWasm),
  'tree-sitter-tsx.wasm': asPath(treeSitterTsxWasm),
  'tree-sitter-python.wasm': asPath(treeSitterPythonWasm),
  'tree-sitter-go.wasm': asPath(treeSitterGoWasm),
  'tree-sitter-rust.wasm': asPath(treeSitterRustWasm),
  'tree-sitter-java.wasm': asPath(treeSitterJavaWasm),
  'tree-sitter-ruby.wasm': asPath(treeSitterRubyWasm),
  'tree-sitter-c-sharp.wasm': asPath(treeSitterCsharpWasm),
  'tree-sitter-cpp.wasm': asPath(treeSitterCppWasm),
}

