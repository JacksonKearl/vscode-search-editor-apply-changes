import * as vscode from 'vscode';
import * as pathUtils from 'path';


const FILE_LINE_REGEX = /^(\S.*):$/;
const RESULT_LINE_REGEX = /^(\s+)(\S+)(:| ) (.*)$/;

export function activate(context: vscode.ExtensionContext) {

	vscode.commands.registerCommand('searchEditorApplyChanges.insertLineAbove', async () => {
		const activeEditor = vscode.window.activeTextEditor;
		const activeDocument = activeEditor?.document;
		if (!activeEditor || !activeDocument || activeDocument.languageId !== 'search-result') {
			return;
		}

		const resultLines = activeEditor.selections
			.map(selection => activeDocument.lineAt(selection.start.line))
			.map(line => {
				const match = RESULT_LINE_REGEX.exec(line.text);
				if (!match) { return undefined; }
				const [_, indentation, number] = match;
				return { start: line.range.start, end: line.range.end, offset: indentation.length + number.length };
			})
			.filter(<T>(x: T | undefined): x is T => !!x);

		await activeEditor.edit(builder => {
			resultLines.map(line => {
				const prefix = ' '.repeat(line.offset - 1) + '↑';
				builder.insert(line.start, prefix + '  \n');
			});
		});

		await vscode.commands.executeCommand('cursorUp');
	});

	vscode.commands.registerCommand('searchEditorApplyChanges.insertLineBelow', async () => {
		const activeEditor = vscode.window.activeTextEditor;
		const activeDocument = activeEditor?.document;
		if (!activeEditor || !activeDocument || activeDocument.languageId !== 'search-result') {
			return;
		}

		const resultLines = activeEditor.selections
			.map(selection => activeDocument.lineAt(selection.start.line))
			.map(line => {
				const match = RESULT_LINE_REGEX.exec(line.text);
				if (!match) { return undefined; }
				const [_, indentation, number] = match;
				return { start: line.range.start, end: line.range.end, offset: indentation.length + number.length };
			})
			.filter(<T>(x: T | undefined): x is T => !!x);

		activeEditor.edit(builder => {
			resultLines.map(line => {
				const prefix = ' '.repeat(line.offset - 1) + '↓';
				builder.insert(line.end, '\n' + prefix + '  ');
			});
		});
	});

	vscode.commands.registerCommand('searchEditorApplyChanges.deleteLine', async () => {

	});

	context.subscriptions.push(vscode.commands.registerCommand('searchEditorApplyChanges.apply', async () => {
		const activeDocument = vscode.window.activeTextEditor?.document;
		if (!activeDocument || activeDocument.languageId !== 'search-result') {
			return;
		}

		const lines = activeDocument.getText().split('\n');
		let filename: string | undefined;
		let currentDocument: vscode.TextDocument | undefined;
		let currentTarget: vscode.Uri | undefined;
		const edit = new vscode.WorkspaceEdit();
		let warnLongLines = false;

		let lastLineEnd: vscode.Position | undefined = undefined;
		let toInsertBelow: string[] = [];
		let toInsertAbove: string[] = [];

		for (const line of lines) {
			const fileLine = FILE_LINE_REGEX.exec(line);
			if (fileLine) {
				const [, path] = fileLine;
				currentTarget = relativePathToUri(path, activeDocument.uri);
				currentDocument = currentTarget && await vscode.workspace.openTextDocument(currentTarget);
				filename = currentTarget && line;
			}

			if (!currentDocument || !currentTarget || !filename) { continue; }

			const resultLine = RESULT_LINE_REGEX.exec(line);
			if (resultLine) {
				const [, indentation, _lineNumber, seperator, newLine] = resultLine;
				if (_lineNumber === '↓') {
					toInsertBelow.push(newLine + '\n');
				} else if (toInsertBelow.length) {
					if (!lastLineEnd) { throw Error('Unable to insert below, previous line not found'); }
					edit.insert(currentTarget, lastLineEnd, toInsertBelow.join(''));
					toInsertBelow = [];
				}

				if (_lineNumber === '↑') {
					toInsertAbove.push(newLine + '\n');
				}

				if (_lineNumber !== '↓' && _lineNumber !== '↑') {
					const lineNumber = +_lineNumber - 1;
					const oldLine = currentDocument.lineAt(lineNumber);
					lastLineEnd = oldLine.rangeIncludingLineBreak.end;
					if (oldLine.range.end.character > 200) {
						// TODO: #2
						warnLongLines = true;
					}
					else if (oldLine.text !== newLine) {
						edit.replace(currentTarget, oldLine.range, toInsertAbove.join('') + newLine);
					} else if (toInsertAbove.length) {
						edit.insert(currentTarget, oldLine.range.start, toInsertAbove.join(''));
					}
					toInsertAbove = [];
				}
			} else {
				lastLineEnd = undefined;
			}
		}

		if (warnLongLines) {
			vscode.window.showWarningMessage('Changes to lines over 200 characters in length may have been ignored.');
		}

		vscode.workspace.applyEdit(edit);

		// Hack to get the state clean, as it in some ways is clean, and this reduces friction for SaveAll/etc.
		vscode.commands.executeCommand('cleanSearchEditorState');
	}));
}


// this method is called when your extension is deactivated
export function deactivate() { }


// From core's builtin search-result extension.
function relativePathToUri(path: string, resultsUri: vscode.Uri): vscode.Uri | undefined {
	if (pathUtils.isAbsolute(path)) { return vscode.Uri.file(path); }
	if (path.indexOf('~/') === 0) {
		return vscode.Uri.file(pathUtils.join(process.env.HOME!, path.slice(2)));
	}

	if (vscode.workspace.workspaceFolders) {
		const multiRootFormattedPath = /^(.*) • (.*)$/.exec(path);
		if (multiRootFormattedPath) {
			const [, workspaceName, workspacePath] = multiRootFormattedPath;
			const folder = vscode.workspace.workspaceFolders.filter(wf => wf.name === workspaceName)[0];
			if (folder) {
				return vscode.Uri.file(pathUtils.join(folder.uri.fsPath, workspacePath));
			}
		}

		else if (vscode.workspace.workspaceFolders.length === 1) {
			return vscode.Uri.file(pathUtils.join(vscode.workspace.workspaceFolders[0].uri.fsPath, path));
		} else if (resultsUri.scheme !== 'untitled') {
			// We're in a multi-root workspace, but the path is not multi-root formatted
			// Possibly a saved search from a single root session. Try checking if the search result document's URI is in a current workspace folder.
			const prefixMatch = vscode.workspace.workspaceFolders.filter(wf => resultsUri.toString().startsWith(wf.uri.toString()))[0];
			if (prefixMatch) { return vscode.Uri.file(pathUtils.join(prefixMatch.uri.fsPath, path)); }
		}
	}

	console.error(`Unable to resolve path ${path}`);
	return undefined;
}