import * as vscode from 'vscode';
import { EventEmitter } from 'events';
// To wire the real agent, install @levelcode/sdk and use:
//   import { LevelCodeClient as SdkClient } from '@levelcode/sdk';
// then replace _runSimulatedStream with sdkClient.run({ prompt, handleEvent }).

export interface StreamEvent {
  type: 'message' | 'tool_call' | 'edit' | 'done' | 'error' | 'thinking';
  content?: string;
  data?: any;
  timestamp: number;
}

export interface PendingEdit {
  id: string;
  filePath: string;
  oldContent: string;
  newContent: string;
  description?: string;
  range?: vscode.Range;
}

export class LevelCodeClient extends EventEmitter {
  private _output: vscode.OutputChannel;
  private _isRunning = false;
  private _pendingEdits: Map<string, PendingEdit> = new Map();
  private _apiKey: string | undefined;
  private _model: string;

  constructor() {
    super();
    this._output = vscode.window.createOutputChannel('LevelCode');
    const config = vscode.workspace.getConfiguration('levelcode');
    this._apiKey = config.get<string>('apiKey') || process.env.LEVELCODE_API_KEY;
    this._model = config.get<string>('model') || 'base';
  }

  public get isRunning(): boolean {
    return this._isRunning;
  }

  public get model(): string {
    return this._model;
  }

  public get pendingEdits(): PendingEdit[] {
    return Array.from(this._pendingEdits.values());
  }

  public async start(): Promise<boolean> {
    if (this._isRunning) {
      return true;
    }
    this._output.appendLine('Starting LevelCode client...');
    if (!this._apiKey) {
      const key = await vscode.window.showInputBox({
        prompt: 'Enter your LevelCode API key',
        password: true,
        ignoreFocusOut: true,
      });
      if (!key) {
        vscode.window.showErrorMessage('LevelCode: API key required.');
        return false;
      }
      this._apiKey = key;
      await vscode.workspace.getConfiguration('levelcode').update('apiKey', key, vscode.ConfigurationTarget.Global);
    }
    this._isRunning = true;
    this.emit('started');
    this._output.appendLine('LevelCode client started.');
    return true;
  }

  public stop(): void {
    this._isRunning = false;
    this.emit('stopped');
    this._output.appendLine('LevelCode client stopped.');
  }

  public async sendPrompt(prompt: string, filePath?: string): Promise<void> {
    if (!this._isRunning) {
      const started = await this.start();
      if (!started) {
        return;
      }
    }

    this.emit('event', { type: 'thinking', content: 'Thinking...', timestamp: Date.now() } as StreamEvent);
    this._output.appendLine(`> ${prompt}`);

    try {
      await this._runSimulatedStream(prompt, filePath);
    } catch (err: any) {
      const msg = err?.message || String(err);
      this._output.appendLine(`Error: ${msg}`);
      this.emit('event', { type: 'error', content: msg, timestamp: Date.now() } as StreamEvent);
    }
  }

  private async _runSimulatedStream(prompt: string, _filePath?: string): Promise<void> {
    const steps = [
      `Received prompt: "${prompt.slice(0, 60)}${prompt.length > 60 ? '...' : ''}"`,
      'Analyzing workspace context...',
      'I can help you with that. Here is my approach:',
      '1. First I will examine the relevant files.',
      '2. Then I will propose a minimal edit.',
      'Note: connect @levelcode/sdk in production to get real agent responses.',
    ];

    for (const chunk of steps) {
      await new Promise((r) => setTimeout(r, 250));
      this.emit('event', {
        type: 'message',
        content: chunk + '\n',
        timestamp: Date.now(),
      } as StreamEvent);
    }

    this.emit('event', { type: 'done', timestamp: Date.now() } as StreamEvent);
  }

  public addPendingEdit(edit: PendingEdit): void {
    this._pendingEdits.set(edit.id, edit);
    this.emit('editAdded', edit);
    this._output.appendLine(`Pending edit added: ${edit.filePath} (${edit.id})`);
  }

  public acceptEdit(id: string): boolean {
    const edit = this._pendingEdits.get(id);
    if (!edit) {
      return false;
    }
    this._pendingEdits.delete(id);
    this.emit('editAccepted', edit);
    return true;
  }

  public rejectEdit(id: string): boolean {
    const edit = this._pendingEdits.get(id);
    if (!edit) {
      return false;
    }
    this._pendingEdits.delete(id);
    this.emit('editRejected', edit);
    return true;
  }

  public showOutput(): void {
    this._output.show(true);
  }

  public dispose(): void {
    this.stop();
    this._output.dispose();
  }
}
