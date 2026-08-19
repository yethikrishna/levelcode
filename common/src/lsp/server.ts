import {
  LSP,
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcNotification,
  CodeAction,
} from './types';
import { codeActionProvider, publishDiagnostics, RefactorSuggestion } from './bridge';

export interface LevelCodeLSPServerOptions {
  sendNotification: (method: string, params: any) => void;
  runPrompt?: (prompt: string, filePath?: string) => Promise<{
    output?: string;
    edits?: Array<{ filePath: string; oldContent: string; newContent: string; description?: string }>;
  }>;
  log?: (msg: string) => void;
}

interface DocumentState {
  uri: string;
  text: string;
  version: number;
}

export class LevelCodeLSPServer {
  private _options: LevelCodeLSPServerOptions;
  private _documents: Map<string, DocumentState> = new Map();
  private _initialized = false;
  private _shutdownRequested = false;
  private _nextId = 1;

  constructor(options: LevelCodeLSPServerOptions) {
    this._options = {
      log: () => {},
      ...options,
    };
  }

  public start(_input: NodeJS.ReadableStream = process.stdin, output: NodeJS.WritableStream = process.stdout): void {
    const writeMsg = (msg: JsonRpcResponse | JsonRpcNotification) => {
      const body = JSON.stringify(msg);
      const header = `Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n`;
      output.write(header + body);
    };
    this._options.sendNotification = (method, params) => {
      writeMsg({ jsonrpc: '2.0', method, params });
    };

    let buffer = '';
    const processMessage = (raw: string) => {
      const resp = this.handleMessage(raw);
      if (resp) {
        writeMsg(resp);
      }
    };

    // Simple header-based reader for stdin.
    const consume = () => {
      const headerEnd = buffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) return;
      const header = buffer.slice(0, headerEnd);
      const match = /Content-Length:\s*(\d+)/i.exec(header);
      if (!match) {
        buffer = buffer.slice(headerEnd + 4);
        return;
      }
      const length = parseInt(match[1], 10);
      const bodyStart = headerEnd + 4;
      if (buffer.length < bodyStart + length) return;
      const body = buffer.slice(bodyStart, bodyStart + length);
      buffer = buffer.slice(bodyStart + length);
      processMessage(body);
      consume();
    };

    process.stdin.on('data', (chunk: Buffer | string) => {
      buffer += chunk.toString('utf8');
      consume();
    });
  }

  public stop(): void {
    this._initialized = false;
    this._shutdownRequested = true;
    this._options.log?.('LevelCode LSP stopped.');
  }

  public handleMessage(raw: string): JsonRpcResponse | null {
    let msg: JsonRpcRequest | JsonRpcNotification;
    try {
      msg = JSON.parse(raw);
    } catch {
      return {
        jsonrpc: '2.0',
        id: null as any,
        error: { code: -32700, message: 'Parse error' },
      };
    }

    const id = (msg as JsonRpcRequest).id;
    const isRequest = id !== undefined;
    try {
      const result = this._dispatch(msg as JsonRpcRequest, isRequest);
      if (isRequest) {
        return { jsonrpc: '2.0', id: id!, result: result ?? null };
      }
      return null;
    } catch (err: any) {
      if (isRequest) {
        return {
          jsonrpc: '2.0',
          id: id!,
          error: { code: -32603, message: err?.message || String(err) },
        };
      }
      this._options.log?.(`Notification error: ${err?.message || err}`);
      return null;
    }
  }

  private _dispatch(msg: JsonRpcRequest, isRequest: boolean): any {
    this._options.log?.(`${isRequest ? 'req' : 'not'} ${msg.method}`);
    switch (msg.method) {
      case LSP.Initialize:
        return this._handleInitialize(msg.params);
      case LSP.Initialized:
        this._initialized = true;
        return null;
      case LSP.Shutdown:
        this._shutdownRequested = true;
        return null;
      case LSP.Exit:
        this.stop();
        process.exit(this._shutdownRequested ? 0 : 1);
        return null;
      case 'textDocument/didOpen': {
        const td = msg.params?.textDocument;
        if (td) this._documents.set(td.uri, { uri: td.uri, text: td.text ?? '', version: td.version ?? 0 });
        return null;
      }
      case 'textDocument/didChange': {
        const td = msg.params?.textDocument;
        const changes = msg.params?.contentChanges ?? [];
        const doc = this._documents.get(td.uri);
        let text = doc?.text ?? '';
        for (const ch of changes) {
          if (ch.text !== undefined) text = ch.text;
        }
        this._documents.set(td.uri, { uri: td.uri, text, version: td.version ?? 0 });
        this._maybeDiagnose(td.uri, text);
        return null;
      }
      case 'textDocument/didClose':
        this._documents.delete(msg.params?.textDocument?.uri);
        return null;
      case LSP.TextDocumentCodeAction:
        return this._handleCodeAction(msg.params);
      case LSP.WorkspaceExecuteCommand:
        return this._handleExecuteCommand(msg.params);
      default:
        if (isRequest) {
          return null;
        }
        return null;
    }
  }

  private _handleInitialize(params: any) {
    const capabilities = params?.capabilities ?? {};
    this._options.log?.(`Client capabilities: ${JSON.stringify(Object.keys(capabilities))}`);
    return {
      capabilities: {
        textDocumentSync: 1,
        codeActionProvider: {
          codeActionKinds: ['source.rewrite.ai', 'quickfix', 'refactor'],
        },
        executeCommandProvider: {
          commands: ['levelcode.runPrompt', 'levelcode.applyRefactor', 'levelcode.explainCode'],
        },
      },
      serverInfo: {
        name: 'levelcode-lsp',
        version: '0.1.0',
      },
    };
  }

  private _handleCodeAction(params: any): CodeAction[] {
    const actions: CodeAction[] = [];
    const docUri: string = params?.textDocument?.uri ?? '';
    const range = params?.range;
    const doc = this._documents.get(docUri);
    if (!doc) return actions;

    const selectedText = range
      ? this._extractRange(doc.text, range)
      : doc.text;

    actions.push({
      title: '✨ LevelCode: Refactor selection',
      kind: 'source.rewrite.ai',
      isPreferred: false,
      command: {
        title: 'Run LevelCode refactor',
        command: 'levelcode.runPrompt',
        arguments: [
          {
            prompt: `Refactor the following code:\n\n\`\`\`\n${selectedText.slice(0, 2000)}\n\`\`\``,
            uri: docUri,
          },
        ],
      },
    });

    actions.push({
      title: '✨ LevelCode: Explain this code',
      kind: 'quickfix',
      command: {
        title: 'Explain code',
        command: 'levelcode.explainCode',
        arguments: [{ uri: docUri, range }],
      },
    });

    return actions;
  }

  private async _handleExecuteCommand(params: any): Promise<any> {
    const command: string = params?.command;
    const args = params?.arguments ?? [];
    switch (command) {
      case 'levelcode.runPrompt': {
        const arg = args[0] ?? {};
        const prompt = arg.prompt ?? 'Describe what you want LevelCode to do.';
        const uri: string = arg.uri ?? '';
        const doc = this._documents.get(uri);
        const filePath = uri.replace(/^file:\/\//, '');
        if (!this._options.runPrompt) {
          this._options.log?.('runPrompt not configured; returning stub response.');
          return this._stubResponse(uri);
        }
        const result = await this._options.runPrompt(prompt, filePath);
        if (result.edits) {
          for (const e of result.edits) {
            const refactor: RefactorSuggestion = {
              title: e.description ?? 'LevelCode suggested edit',
              filePath: e.filePath,
              oldContent: e.oldContent,
              newContent: e.newContent,
              description: e.description,
              kind: 'source.rewrite.ai',
            };
            const action = codeActionProvider(refactor);
            this._options.log?.(`Produced code action for ${e.filePath}`);
            return action;
          }
        }
        return { output: result.output };
      }
      case 'levelcode.applyRefactor':
        this._options.log?.(`Apply refactor: ${JSON.stringify(args[0])}`);
        return { applied: true };
      case 'levelcode.explainCode':
        return { explanation: 'Connect @levelcode/sdk for real explanations.' };
      default:
        return null;
    }
  }

  private _extractRange(text: string, range: { start: { line: number; character: number }; end: { line: number; character: number } }): string {
    const lines = text.split('\n');
    const out: string[] = [];
    for (let i = range.start.line; i <= range.end.line; i++) {
      const line = lines[i] ?? '';
      if (i === range.start.line && i === range.end.line) {
        out.push(line.slice(range.start.character, range.end.character));
      } else if (i === range.start.line) {
        out.push(line.slice(range.start.character));
      } else if (i === range.end.line) {
        out.push(line.slice(0, range.end.character));
      } else {
        out.push(line);
      }
    }
    return out.join('\n');
  }

  private _maybeDiagnose(uri: string, text: string): void {
    const issues: Array<{ message: string; line: number; severity: 1 | 2 | 3 | 4 }> = [];
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (/TODO\s*\(?\s*levelcode/i.test(lines[i])) {
        issues.push({ message: 'LevelCode TODO marker found', line: i, severity: 3 });
      }
      const hackMatch = /(HACK|FIXME)/i.exec(lines[i]);
      if (hackMatch) {
        issues.push({ message: `${hackMatch[1]} found — consider asking LevelCode to clean it up`, line: i, severity: 3 });
      }
    }
    const filePath = uri.replace(/^file:\/\//, '');
    const diag = publishDiagnostics(filePath, issues);
    this._options.sendNotification(LSP.TextDocumentPublishDiagnostics, diag);
  }

  private _stubResponse(uri: string) {
    const filePath = uri.replace(/^file:\/\//, '');
    return {
      message: 'LevelCode LSP stub: wire up runPrompt() in server options to connect the real agent.',
      filePath,
    };
  }
}

// Standalone CLI entry: `bun common/src/lsp/server.ts` or compiled equivalent.
// When this file is executed directly, start an LSP server over stdin/stdout.
declare const require: { main?: unknown } | undefined;
const isMainModule =
  (typeof process !== 'undefined' &&
    Array.isArray(process.argv) &&
    (process.argv[1]?.endsWith('server.ts') || process.argv[1]?.endsWith('server.js'))) ||
  (typeof require !== 'undefined' && (require as { main?: unknown }).main === (undefined as unknown));
if (isMainModule && typeof process !== 'undefined' && process.argv[1]?.includes('server')) {
  const server = new LevelCodeLSPServer({
    sendNotification: () => {},
    log: (msg: string) => process.stderr.write(`[levelcode-lsp] ${msg}\n`),
  });
  server.start();
}

export function startStdioServer(): LevelCodeLSPServer {
  const server = new LevelCodeLSPServer({
    sendNotification: () => {},
    log: (msg: string) => process.stderr.write(`[levelcode-lsp] ${msg}\n`),
  });
  server.start();
  return server;
}
