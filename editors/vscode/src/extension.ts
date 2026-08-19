import * as vscode from 'vscode';
import * as path from 'path';
import { LevelCodeClient } from './LevelCodeClient';
import { LevelCodePanel } from './panel/LevelCodePanel';
import { DiffContentProvider, EditCodeLensProvider } from './providers/DiffContentProvider';
import { StatusBarProvider } from './providers/StatusBarProvider';

let client: LevelCodeClient | undefined;
let statusBar: StatusBarProvider | undefined;
let diffProvider: DiffContentProvider | undefined;

export function activate(context: vscode.ExtensionContext): void {
  client = new LevelCodeClient();
  statusBar = new StatusBarProvider(client);
  diffProvider = new DiffContentProvider(client);

  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(DiffContentProvider.scheme, diffProvider),
  );

  const lensProvider = new EditCodeLensProvider(client);
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider({ scheme: 'file' }, lensProvider),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('levelcode.start', async () => {
      if (!client) {
        return;
      }
      const ok = await client.start();
      if (ok) {
        vscode.window.showInformationMessage('LevelCode agent started.');
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('levelcode.openPanel', () => {
      if (!client) {
        return;
      }
      LevelCodePanel.createOrShow(client, context.extensionUri);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('levelcode.sendPrompt', async () => {
      if (!client) {
        return;
      }
      const editor = vscode.window.activeTextEditor;
      let filePath: string | undefined;
      let defaultPrompt = '';
      if (editor) {
        filePath = editor.document.uri.fsPath;
        const sel = editor.selection;
        if (!sel.isEmpty) {
          defaultPrompt = editor.document.getText(sel);
        }
      }
      const prompt = await vscode.window.showInputBox({
        prompt: 'Ask LevelCode',
        value: defaultPrompt,
        ignoreFocusOut: true,
        placeHolder: 'e.g. "Refactor this function to use async/await"',
      });
      if (!prompt) {
        return;
      }
      LevelCodePanel.createOrShow(client, context.extensionUri);
      await client.sendPrompt(prompt, filePath);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('levelcode.acceptEdit', async (editId?: string) => {
      if (!client || !editId) {
        return;
      }
      const edit = client.pendingEdits.find((e) => e.id === editId);
      if (!edit) {
        vscode.window.showWarningMessage(`Edit ${editId} not found.`);
        return;
      }
      const uri = vscode.Uri.file(edit.filePath);
      const doc = await vscode.workspace.openTextDocument(uri);
      const wsEdit = new vscode.WorkspaceEdit();
      const fullRange = new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length));
      wsEdit.replace(uri, fullRange, edit.newContent);
      await vscode.workspace.applyEdit(wsEdit);
      client.acceptEdit(editId);
      vscode.window.showInformationMessage(`LevelCode: applied edit to ${path.basename(edit.filePath)}.`);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('levelcode.rejectEdit', (editId?: string) => {
      if (!client || !editId) {
        return;
      }
      client.rejectEdit(editId);
    }),
  );

  const autoStart = vscode.workspace.getConfiguration('levelcode').get<boolean>('autoStart');
  if (autoStart) {
    client.start().catch(() => {});
  }

  context.subscriptions.push({ dispose: () => deactivate() });
}

export function deactivate(): void {
  if (client) {
    client.dispose();
    client = undefined;
  }
  if (statusBar) {
    statusBar.dispose();
    statusBar = undefined;
  }
  if (diffProvider) {
    diffProvider.dispose();
    diffProvider = undefined;
  }
}
