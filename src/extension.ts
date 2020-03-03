import * as vscode from 'vscode';
import * as pathUtils from 'path';


const FILE_LINE_REGEX = /^(\S.*):$/;
const RESULT_LINE_REGEX = /^(\s+)(\d+)(:| ) (.*)$/;

export function activate(context: vscode.ExtensionContext) {

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
		let editedFiles = new Set();
		let warnLongLines = false;

		const channel = vscode.window.createOutputChannel("Search Editor");

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
				const lineNumber = +_lineNumber - 1;
				const oldLine = currentDocument.lineAt(lineNumber);
				if (oldLine.range.end.character > 200) {
					// TODO: #2
					warnLongLines = true;
				}
				else if (oldLine.text !== newLine) {
					if (!editedFiles.has(currentTarget.toString())) {
						editedFiles.add(currentTarget.toString());
						channel.appendLine(filename);
					}
					channel.appendLine(`	${oldLine.text} => ${newLine}`);
					edit.replace(currentTarget, oldLine.range, newLine);
				}
			}
		}

		if (warnLongLines) {
			vscode.window.showWarningMessage('Changes to lines over 200 charachters in length may have been ignored.');
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