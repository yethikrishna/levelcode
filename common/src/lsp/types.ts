// Minimal inline LSP types (mirrors a small subset of vscode-languageserver-protocol).
// We declare these inline to avoid an extra dependency, as requested.

export const LSP = {
  TextDocumentCodeAction: 'textDocument/codeAction',
  WorkspaceExecuteCommand: 'workspace/executeCommand',
  TextDocumentPublishDiagnostics: 'textDocument/publishDiagnostics',
  Initialize: 'initialize',
  Initialized: 'initialized',
  Shutdown: 'shutdown',
  Exit: 'exit',
} as const;

export interface Position {
  line: number;
  character: number;
}

export interface Range {
  start: Position;
  end: Position;
}

export interface LspTextEdit {
  range: Range;
  newText: string;
}

export interface TextDocumentIdentifier {
  uri: string;
}

export interface VersionedTextDocumentIdentifier extends TextDocumentIdentifier {
  version: number;
}

export type DiagnosticSeverity = 1 | 2 | 3 | 4; // Error | Warning | Info | Hint

export interface Diagnostic {
  range: Range;
  severity?: DiagnosticSeverity;
  code?: string | number;
  source?: string;
  message: string;
}

export type CodeActionKind = string;

export interface CodeAction {
  title: string;
  kind?: CodeActionKind;
  diagnostics?: Diagnostic[];
  isPreferred?: boolean;
  edit?: WorkspaceEdit;
  command?: Command;
}

export interface WorkspaceEdit {
  changes?: Record<string, LspTextEdit[]>;
}

export interface Command {
  title: string;
  command: string;
  arguments?: any[];
}

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: any;
}

export interface JsonRpcResponse<T = any> {
  jsonrpc: '2.0';
  id: number | string;
  result?: T;
  error?: { code: number; message: string; data?: any };
}

export interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: any;
}
