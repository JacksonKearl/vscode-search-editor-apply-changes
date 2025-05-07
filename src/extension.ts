import * as vscode from 'vscode';
import * as pathUtils from 'path';

type LineRecord = {
	lineIndex: number;
	searchEditorContent: string;
	appendedLines: string[];
}

type FileRecord = {
	path: string;
	lines: LineRecord[];
}

const FILE_LINE_REGEX = /^(\S.*):$/;
const RESULT_LINE_REGEX = /^(\s+)(\d+)(:| ) (.*)$/;
/**
 * Also support CRLF line endings 
 * in case somebody still uses it in source files /)_-) 
 */
const LINE_BREAK_REGEX = /\r?\n/;

export const makeSearchResultModel = (searchResult: string) => {
	const filesChangeModel: FileRecord[] = []; 
	let lastLine: LineRecord | null = null;
	let lastFile: FileRecord | null = null;

	const lines = searchResult.split(LINE_BREAK_REGEX);
	for (const line of lines) {
		const fileLine = FILE_LINE_REGEX.exec(line);
		const resultLine = RESULT_LINE_REGEX.exec(line);

		if (fileLine) {
			const [, path] = fileLine;
			const fileRecord = {path, lines: []};
			filesChangeModel.push(fileRecord);
			lastFile = fileRecord;
			lastLine = null;

		} else if (resultLine && lastFile) {
			const [, _indentation, lineNumber, _separator, newLine] = resultLine;
			const lineIndex =  +lineNumber - 1;
			lastLine = {lineIndex, searchEditorContent: newLine, appendedLines: []};
			lastFile.lines.push(lastLine);
		} else if (lastLine) {
			lastLine.appendedLines.push(line);
		}
	}

	// post processing
	for (const file of filesChangeModel) {
		// Sort lines in reverse order to make changes in correct places in file
		file.lines.sort((a, b) => b.lineIndex - a.lineIndex);
	}

	return filesChangeModel;
};

export const makeNewLineContent = (line: LineRecord, document: vscode.TextDocument): string => {
	const appendedContentIsEmpty = line.appendedLines.join("").trim() === "";
	if (appendedContentIsEmpty) {
		return line.searchEditorContent;
	}

	const eol = document.eol === vscode.EndOfLine.CRLF ? "\r\n" : "\n";
	return [line.searchEditorContent, ...line.appendedLines].join(eol);
};

export const  processLineRecord =(
	lineRecord: LineRecord, 
	currentDocument: vscode.TextDocument, 
	currentTarget: vscode.Uri, 
	edit: vscode.WorkspaceEdit,
	channel: vscode.OutputChannel
): void => {	
	const originalLine = currentDocument.lineAt(lineRecord.lineIndex);
	const newContent = makeNewLineContent(lineRecord, currentDocument);
	
	if (originalLine.text !== newContent) {
		channel.appendLine(`${lineRecord.lineIndex}:	${originalLine.text} => ${newContent}`);
		edit.replace(currentTarget, originalLine.range, newContent);
	}
};

export function activate(context: vscode.ExtensionContext) {
	// Create the output channel once during activation
	const channel = vscode.window.createOutputChannel("Search Editor");
	// Add the channel to subscriptions so it gets disposed properly
	context.subscriptions.push(channel);

	context.subscriptions.push(vscode.commands.registerCommand('searchEditorApplyChanges.apply', async () => {
		const activeDocument = vscode.window.activeTextEditor?.document;
		if (!activeDocument || activeDocument.languageId !== 'search-result') {
			return;
		}

		const edit = new vscode.WorkspaceEdit();

		const filesModel = makeSearchResultModel(activeDocument.getText());
		for (const fileRecord of filesModel) {
			channel.appendLine(fileRecord.path);
			
			const currentTarget = relativePathToUri(fileRecord.path, activeDocument.uri);
			const currentDocument = currentTarget && await vscode.workspace.openTextDocument(currentTarget);
			if (!currentDocument) { continue; }

			for (const lineRecord of fileRecord.lines) {
				processLineRecord(lineRecord, currentDocument, currentTarget!, edit, channel);
			}
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