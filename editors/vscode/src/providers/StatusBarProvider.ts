import * as vscode from 'vscode';
import { LevelCodeClient } from '../LevelCodeClient';

export class StatusBarProvider {
  private _statusBar: vscode.StatusBarItem;

  constructor(private readonly _client: LevelCodeClient) {
    this._statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this._statusBar.command = 'levelcode.openPanel';
    this._update('idle');

    _client.on('started', () => this._update('connected'));
    _client.on('stopped', () => this._update('idle'));
    _client.on('event', (evt: any) => {
      if (evt.type === 'thinking') {
        this._update('thinking');
      } else if (evt.type === 'done' || evt.type === 'error') {
        this._update('connected');
      }
    });
  }

  private _update(state: 'idle' | 'connected' | 'thinking'): void {
    const model = this._client.model || 'base';
    switch (state) {
      case 'idle':
        this._statusBar.text = `$(robot) LevelCode`;
        this._statusBar.tooltip = 'LevelCode: Click to open chat panel. Agent not started.';
        this._statusBar.backgroundColor = undefined;
        break;
      case 'connected':
        this._statusBar.text = `$(robot) LevelCode (${model})`;
        this._statusBar.tooltip = `LevelCode: Connected. Model: ${model}. Click to open chat.`;
        this._statusBar.backgroundColor = undefined;
        break;
      case 'thinking':
        this._statusBar.text = `$(loading~spin) LevelCode (${model})`;
        this._statusBar.tooltip = 'LevelCode: Agent is thinking...';
        this._statusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        break;
    }
    this._statusBar.show();
  }

  public show(): void {
    this._statusBar.show();
  }

  public hide(): void {
    this._statusBar.hide();
  }

  public dispose(): void {
    this._statusBar.dispose();
  }
}
