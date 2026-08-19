import * as vscode from 'vscode';
import { LevelCodeClient, StreamEvent } from '../LevelCodeClient';

export class LevelCodePanel {
  public static currentPanel: LevelCodePanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _client: LevelCodeClient;
  private _disposables: vscode.Disposable[] = [];

  public static createOrShow(client: LevelCodeClient, extensionUri: vscode.Uri): void {
    const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.Beside;
    if (LevelCodePanel.currentPanel) {
      LevelCodePanel.currentPanel._panel.reveal(column);
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      'levelcode.chat',
      'LevelCode Chat',
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')],
      },
    );
    LevelCodePanel.currentPanel = new LevelCodePanel(panel, client, extensionUri);
  }

  private constructor(panel: vscode.WebviewPanel, client: LevelCodeClient, _extensionUri: vscode.Uri) {
    this._panel = panel;
    this._client = client;
    this._panel.webview.html = this._getHtml();
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    this._panel.webview.onDidReceiveMessage(
      async (msg) => {
        switch (msg.type) {
          case 'sendPrompt':
            await this._client.sendPrompt(msg.prompt, msg.filePath);
            break;
          case 'start':
            await this._client.start();
            break;
        }
      },
      null,
      this._disposables,
    );

    this._client.on('event', (evt: StreamEvent) => {
      this._panel.webview.postMessage({ type: 'event', event: evt });
    });

    this._client.on('started', () => {
      this._panel.webview.postMessage({ type: 'status', status: 'connected' });
    });

    this._client.on('stopped', () => {
      this._panel.webview.postMessage({ type: 'status', status: 'disconnected' });
    });
  }

  public appendEvent(event: StreamEvent): void {
    this._panel.webview.postMessage({ type: 'event', event });
  }

  private _getHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
<title>LevelCode</title>
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 0; height: 100vh;
    font-family: var(--vscode-font-family, sans-serif);
    font-size: var(--vscode-font-size, 13px);
    color: var(--vscode-foreground, #ccc);
    background: var(--vscode-editor-background, #1e1e1e);
    display: flex; flex-direction: column;
  }
  #header {
    padding: 10px 14px;
    border-bottom: 1px solid var(--vscode-panel-border, #333);
    display: flex; align-items: center; gap: 8px;
  }
  #status-dot {
    width: 10px; height: 10px; border-radius: 50%;
    background: #888; transition: background 0.2s;
  }
  #status-dot.connected { background: #4ec9b0; }
  #status-dot.thinking { background: #dcdcaa; animation: pulse 1s infinite; }
  @keyframes pulse { 0%,100%{opacity:1;} 50%{opacity:0.4;} }
  #messages {
    flex: 1; overflow-y: auto; padding: 12px 14px;
    line-height: 1.5; white-space: pre-wrap; word-wrap: break-word;
  }
  .msg { margin-bottom: 8px; padding: 6px 10px; border-radius: 6px; }
  .msg.user { background: var(--vscode-button-background, #0e639c); color: var(--vscode-button-foreground, #fff); margin-left: 20%; }
  .msg.assistant { background: var(--vscode-input-background, #3c3c3c); margin-right: 10%; }
  .msg.error { background: #5a1d1d; color: #f48771; }
  .msg.thinking { color: var(--vscode-descriptionForeground, #888); font-style: italic; }
  #input-bar {
    border-top: 1px solid var(--vscode-panel-border, #333);
    padding: 10px; display: flex; gap: 8px;
  }
  #prompt-input {
    flex: 1; background: var(--vscode-input-background, #3c3c3c);
    color: var(--vscode-input-foreground, #ccc);
    border: 1px solid var(--vscode-input-border, #555);
    border-radius: 4px; padding: 8px 10px; font-family: inherit; font-size: inherit;
    resize: none; min-height: 38px; max-height: 160px;
  }
  #prompt-input:focus { outline: none; border-color: var(--vscode-focusBorder, #007fd4); }
  button {
    background: var(--vscode-button-background, #0e639c);
    color: var(--vscode-button-foreground, #fff);
    border: none; border-radius: 4px; padding: 0 16px;
    cursor: pointer; font-family: inherit; font-size: inherit;
  }
  button:hover { background: var(--vscode-button-hoverBackground, #1177bb); }
  button:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
</head>
<body>
  <div id="header">
    <div id="status-dot"></div>
    <strong>LevelCode</strong>
    <span id="model-label" style="margin-left:auto;opacity:0.6;font-size:0.9em;"></span>
  </div>
  <div id="messages"></div>
  <div id="input-bar">
    <textarea id="prompt-input" placeholder="Ask LevelCode anything about your code..." rows="1"></textarea>
    <button id="send-btn">Send</button>
  </div>
<script>
const vscode = acquireVsCodeApi();
const messagesEl = document.getElementById('messages');
const inputEl = document.getElementById('prompt-input');
const sendBtn = document.getElementById('send-btn');
const statusDot = document.getElementById('status-dot');
const modelLabel = document.getElementById('model-label');

let connected = false;
function addMessage(role, text, cls) {
  const div = document.createElement('div');
  div.className = 'msg ' + (cls || role);
  div.textContent = text;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}
function setStatus(s) {
  statusDot.className = s;
  connected = s === 'connected';
  sendBtn.disabled = !connected;
}

sendBtn.addEventListener('click', () => {
  const text = inputEl.value.trim();
  if (!text) return;
  addMessage('user', text);
  vscode.postMessage({ type: 'sendPrompt', prompt: text });
  inputEl.value = '';
  setStatus('thinking');
});
inputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendBtn.click();
  }
});
window.addEventListener('message', (e) => {
  const msg = e.data;
  if (msg.type === 'event') {
    const ev = msg.event;
    if (ev.type === 'message') {
      addMessage('assistant', ev.content || '');
    } else if (ev.type === 'error') {
      addMessage('error', ev.content || 'Error', 'error');
      setStatus(connected ? 'connected' : 'disconnected');
    } else if (ev.type === 'thinking') {
      setStatus('thinking');
    } else if (ev.type === 'done') {
      setStatus('connected');
    }
  } else if (msg.type === 'status') {
    setStatus(msg.status);
  }
});

vscode.postMessage({ type: 'start' });
</script>
</body>
</html>`;
  }

  public dispose(): void {
    LevelCodePanel.currentPanel = undefined;
    this._panel.dispose();
    for (const d of this._disposables) {
      d.dispose();
    }
    this._disposables = [];
  }
}
