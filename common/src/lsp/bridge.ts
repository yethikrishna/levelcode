import type { LspTextEdit, Range, Diagnostic, CodeAction, Command } from './types';

function findChangeRegion(oldContent: string, newContent: string): { range: Range; replacementText: string } {
  const oldLines = oldContent.split('\n');
  const newLines = newContent.split('\n');

  let startLine = 0;
  let endLineOld = oldLines.length - 1;
  let endLineNew = newLines.length - 1;

  const minLen = Math.min(oldLines.length, newLines.length);
  while (startLine < minLen && oldLines[startLine] === newLines[startLine]) {
    startLine++;
  }

  while (
    endLineOld >= startLine &&
    endLineNew >= startLine &&
    oldLines[endLineOld] === newLines[endLineNew]
  ) {
    endLineOld--;
    endLineNew--;
  }

  if (startLine > endLineOld && startLine > endLineNew) {
    const pos = { line: startLine, character: 0 };
    return { range: { start: pos, end: pos }, replacementText: '' };
  }

  const lastOldLine = oldLines[Math.min(endLineOld, oldLines.length - 1)] ?? '';
  const endChar = lastOldLine.length;
  const range: Range = {
    start: { line: startLine, character: 0 },
    end: { line: Math.max(endLineOld, startLine), character: endChar },
  };

  const replacementLines = newLines.slice(startLine, endLineNew + 1);
  return { range, replacementText: replacementLines.join('\n') };
}

/**
 * Convert an (oldContent, newContent) pair into an array of LSP TextEdits.
 * Uses prefix/suffix line matching to produce a minimal replace edit.
 */
export function editsToLspTextEdits(
  _filePath: string,
  oldContent: string,
  newContent: string,
): LspTextEdit[] {
  if (oldContent === newContent) {
    return [];
  }
  const { range, replacementText } = findChangeRegion(oldContent, newContent);
  return [{ range, newText: replacementText }];
}

/**
 * Build a `textDocument/publishDiagnostics` notification payload for a set of issues.
 */
export function publishDiagnostics(
  filePath: string,
  issues: Array<string | { message: string; line?: number; character?: number; severity?: 1 | 2 | 3 | 4; code?: string }>,
): { uri: string; diagnostics: Diagnostic[] } {
  const uri = filePath.startsWith('file://') ? filePath : `file://${filePath.replace(/\\/g, '/')}`;
  const diagnostics: Diagnostic[] = issues.map((issue) => {
    if (typeof issue === 'string') {
      return {
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
        severity: 2,
        source: 'levelcode',
        message: issue,
      };
    }
    const line = issue.line ?? 0;
    const character = issue.character ?? 0;
    return {
      range: { start: { line, character }, end: { line, character: character + 1 } },
      severity: issue.severity ?? 2,
      code: issue.code,
      source: 'levelcode',
      message: issue.message,
    };
  });
  return { uri, diagnostics };
}

export interface RefactorSuggestion {
  title: string;
  filePath: string;
  oldContent: string;
  newContent: string;
  description?: string;
  kind?: string;
  isPreferred?: boolean;
  commandId?: string;
}

/**
 * Convert a refactor suggestion into an LSP CodeAction carrying WorkspaceEdit + Command.
 */
export function codeActionProvider(refactor: RefactorSuggestion): CodeAction {
  const edits = editsToLspTextEdits(refactor.filePath, refactor.oldContent, refactor.newContent);
  const uri = refactor.filePath.startsWith('file://')
    ? refactor.filePath
    : `file://${refactor.filePath.replace(/\\/g, '/')}`;
  const action: CodeAction = {
    title: refactor.title,
    kind: refactor.kind ?? 'source.rewrite.ai',
    isPreferred: refactor.isPreferred ?? false,
    edit: { changes: { [uri]: edits } },
    command: {
      title: 'LevelCode: apply refactor',
      command: refactor.commandId ?? 'levelcode.applyRefactor',
      arguments: [{ filePath: refactor.filePath, title: refactor.title }],
    } as Command,
  };
  if (refactor.description) {
    action.diagnostics = [
      {
        range: edits[0]?.range ?? { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
        severity: 3,
        source: 'levelcode',
        message: refactor.description,
      },
    ];
  }
  return action;
}
