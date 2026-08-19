import * as vscode from 'vscode';
import * as path from 'path';
import { LevelCodeClient, PendingEdit } from '../LevelCodeClient';

const DIFF_SCHEME = 'levelcode-diff';

export class DiffContentProvider implements vscode.TextDocumentContentProvider {
  public static readonly scheme = DIFF_SCHEME;
  private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
  public readonly onDidChange = this._onDidChange.event;

  private _edits: Map<string, PendingEdit> = new Map();

  constructor(private readonly _client: LevelCodeClient) {
    _client.on('editAdded', (edit: PendingEdit) => {
      this._edits.set(edit.id, edit);
      this._registerLenses(edit);
    });
    _client.on('editAccepted', (edit: PendingEdit) => {
      this._edits.delete(edit.id);
    });
    _client.on('editRejected', (edit: PendingEdit) => {
      this._edits.delete(edit.id);
    });
  }

  public provideTextDocumentContent(uri: vscode.Uri): string {
    const id = uri.query;
    const edit = this._edits.get(id);
    if (!edit) {
      return '';
    }
    return edit.newContent;
  }

  private _registerLenses(edit: PendingEdit): void {
    vscode.workspace.openTextDocument(vscode.Uri.file(edit.filePath)).then((doc) => {
      vscode.window.showTextDocument(doc, { preview: false }).then(() => {
        const fileName = path.basename(edit.filePath);
        vscode.window.showInformationMessage(
          `LevelCode suggests an edit to ${fileName}`,
          'Accept',
          'Reject',
          'Diff',
        ).then((choice) => {
          if (choice === 'Accept') {
            this._applyEdit(edit);
          } else if (choice === 'Reject') {
            this._client.rejectEdit(edit.id);
          } else if (choice === 'Diff') {
            this._showDiff(edit);
          }
        });
      });
    });
  }

  private async _applyEdit(edit: PendingEdit): Promise<void> {
    const uri = vscode.Uri.file(edit.filePath);
    const doc = await vscode.workspace.openTextDocument(uri);
    const editBuilder = new vscode.WorkspaceEdit();
    const fullRange = new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length));
    editBuilder.replace(uri, fullRange, edit.newContent);
    await vscode.workspace.applyEdit(editBuilder);
    this._client.acceptEdit(edit.id);
    vscode.window.showInformationMessage(`LevelCode: edit applied to ${path.basename(edit.filePath)}`);
  }

  public async showDiff(edit: PendingEdit): Promise<void> {
    const originalUri = vscode.Uri.file(edit.filePath);
    const proposedUri = vscode.Uri.parse(`${DIFF_SCHEME}:${path.basename(edit.filePath)}?${edit.id}`);
    await vscode.commands.executeCommand(
      'vscode.diff',
      originalUri,
      proposedUri,
      `LevelCode: ${path.basename(edit.filePath)} (proposed)`,
    );
  }

  private _showDiff(edit: PendingEdit): void {
    this.showDiff(edit);
  }

  public getEdit(id: string): PendingEdit | undefined {
    return this._edits.get(id);
  }

  public dispose(): void {
    this._onDidChange.dispose();
  }
}

export class EditCodeLensProvider implements vscode.CodeLensProvider {
  private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

  constructor(private readonly _client: LevelCodeClient) {
    _client.on('editAdded', () => this._onDidChangeCodeLenses.fire());
    _client.on('editAccepted', () => this._onDidChangeCodeLenses.fire());
    _client.on('editRejected', () => this._onDidChangeCodeLenses.fire());
  }

  public provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const lenses: vscode.CodeLens[] = [];
    for (const edit of this._client.pendingEdits) {
      if (vscode.Uri.file(edit.filePath).fsPath !== document.uri.fsPath) {
        continue;
      }
      const line = edit.range?.start.line ?? 0;
      const pos = new vscode.Range(line, 0, line, 0);
      lenses.push(
        new vscode.CodeLens(pos, {
          title: `$(check) Accept LevelCode edit${edit.description ? `: ${edit.description}` : ''}`,
          command: 'levelcode.acceptEdit',
          arguments: [edit.id],
        }),
      );
      lenses.push(
        new vscode.CodeLens(pos, {
          title: '$(x) Reject',
          command: 'levelcode.rejectEdit',
          arguments: [edit.id],
        }),
      );
    }
    return lenses;
  }
}
