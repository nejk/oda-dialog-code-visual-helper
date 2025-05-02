// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

const todoDecorationType = vscode.window.createTextEditorDecorationType({
	backgroundColor: 'rgba(255,255,0,0.2)',  // light yellow
	border: '1px solid gold',
	overviewRulerColor: 'yellow',
	overviewRulerLane: vscode.OverviewRulerLane.Right,
});

const fixmeDecorationType = vscode.window.createTextEditorDecorationType({
	backgroundColor: 'rgba(255,0,0,0.2)',    // light red
	border: '1px solid red',
	overviewRulerColor: 'red',
	overviewRulerLane: vscode.OverviewRulerLane.Right,
});

function updateTodoFixmeHighlights(editor: vscode.TextEditor) {
	const text = editor.document.getText();

	const todoRegex = /\bTODO\b.*$/gm;
	const fixmeRegex = /\bFIXME\b.*$/gm;

	const todoDecorations: vscode.DecorationOptions[] = [];
	const fixmeDecorations: vscode.DecorationOptions[] = [];

	let match;

	while ((match = todoRegex.exec(text)) !== null) {
		const startPos = editor.document.positionAt(match.index);
		const endPos = editor.document.positionAt(match.index + match[0].length);
		todoDecorations.push({
			range: new vscode.Range(startPos, endPos),
			hoverMessage: '📝 ' + match[0],
		});
	}

	while ((match = fixmeRegex.exec(text)) !== null) {
		const startPos = editor.document.positionAt(match.index);
		const endPos = editor.document.positionAt(match.index + match[0].length);
		fixmeDecorations.push({
			range: new vscode.Range(startPos, endPos),
			hoverMessage: '🚨 ' + match[0],
		});
	}

	editor.setDecorations(todoDecorationType, todoDecorations);
	editor.setDecorations(fixmeDecorationType, fixmeDecorations);
}

// Inlay hints also an option with pros: can be displayed inline and cons: requires extra click.
export class ODAConversationYAMLCodeLensProvider implements vscode.CodeLensProvider {
	private statePosition: Record<string, number> = {};
	public stateNameRegex = /^  (\w+):\s*$/;
	public transitionRegex = /^(?: {6}| {8})([\w. ]+):\s*["']?(\w+)["']?/;

	onDidChangeCodeLenses?: vscode.Event<void>;

	provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
		const codeLenses: vscode.CodeLens[] = [];
		this.statePosition = {};

		const text = document.getText();
		const lines = text.split('\n');

		// 1. Map all state names to line numbers
		lines.forEach((line, lineNumber) => {
			const match = this.stateNameRegex.exec(line);
			if (match) {
				const stateName = match[1];
				this.statePosition[stateName] = lineNumber;
			}
		});

		// 2. Find transitions and add CodeLens
		lines.forEach((line, i) => {
			if (line.startsWith('    transitions:')) {
				// Check next few lines for default, error, next, action transitions like `error: "targetState"`
				for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
					if (this.stateNameRegex.test(lines[j])) {
						break;
					}
					const transMatch = this.transitionRegex.exec(lines[j]);
					if (transMatch) {
						const action = transMatch[1];
						const targetState = transMatch[2];
						const cmd: vscode.Command = {
							title: `➡️ Transition to '${targetState}'`,
							command: 'oda-dialog-code-visual-helper.transitionToState',
							arguments: [targetState],
						};
						codeLenses.push(new vscode.CodeLens(new vscode.Range(j, 0, j, 0), cmd));
					}
				}
			}
		});

		return codeLenses;
	}

	getStatePosition(stateName: string): number | undefined {
		return this.statePosition[stateName];
	}
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	/*
	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "helloworld" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	const disposable = vscode.commands.registerCommand('helloworld.helloWorld', () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		vscode.window.showInformationMessage('Hello World from HelloWorld!');
	});

	context.subscriptions.push(disposable);
	*/

	let transitionStack: string[] = [];
	let currentEditor: vscode.TextEditor | undefined = vscode.window.activeTextEditor;

	const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1);
	statusBar.tooltip = "State transition history";
	statusBar.show();
	context.subscriptions.push(statusBar);

	function updateStatusBar() {
		if (transitionStack.length === 0) {
			statusBar.text = '$(debug-start) Ready';
			statusBar.command = undefined;
			return;
		}

		const current = transitionStack[transitionStack.length - 1];
		statusBar.text = `$(circuit-board) ${transitionStack.join(' → ')}`;
		statusBar.command = 'oda-dialog-code-visual-helper.popState';
	}

	const popStateCommand = vscode.commands.registerCommand('oda-dialog-code-visual-helper.popState', async () => {
		if (transitionStack.length < 2) return;
	
		transitionStack.pop(); // remove current
		const previous = transitionStack[transitionStack.length - 1];
	
		await vscode.commands.executeCommand('oda-dialog-code-visual-helper.transitionToState', previous);
		updateStatusBar();
	});
	context.subscriptions.push(popStateCommand);

	vscode.window.onDidChangeActiveTextEditor((newEditor) => {
		if (newEditor && newEditor.document.fileName !== currentEditor?.document.fileName) {
			currentEditor = newEditor;
			transitionStack = [];
			updateStatusBar();
		}
	});

	vscode.window.onDidChangeActiveTextEditor(editor => {
		if (editor) updateTodoFixmeHighlights(editor);
	}, null, context.subscriptions);

	vscode.workspace.onDidChangeTextDocument(event => {
		const editor = vscode.window.activeTextEditor;
		if (editor && event.document === editor.document) {
			updateTodoFixmeHighlights(editor);
		}
	}, null, context.subscriptions);

	if (vscode.window.activeTextEditor) {
		updateTodoFixmeHighlights(vscode.window.activeTextEditor);
	}

	let provider = new ODAConversationYAMLCodeLensProvider();

	context.subscriptions.push(
		vscode.languages.registerCodeLensProvider({ language: 'yaml' }, provider)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('oda-dialog-code-visual-helper.transitionToState', (stateName: string) => {
			const editor = vscode.window.activeTextEditor;
			if (!editor) return;

			if (!stateName) {
				const document = editor.document;
				const selectedLineText = document.lineAt(editor.selection.active.line).text;

				let match = provider.transitionRegex.exec(selectedLineText);
				if (match) {
					stateName = match[2];
				} else {
					vscode.window.showErrorMessage(`No valid YAML state name found on selected line ${selectedLineText}`);
					return;
				}
			}

			const line = provider['getStatePosition'](stateName);
			if (line !== undefined) {
				const pos = new vscode.Position(line, 0);
				editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.AtTop);

				// Update breadcrumb stack
				if (transitionStack[transitionStack.length - 1] !== stateName) {
					transitionStack.push(stateName);
					updateStatusBar();
				}
			} else {
				vscode.window.showErrorMessage(`State '${stateName}' not found.`);
			}
		})
	);

	console.log("Extension is running");
}

// This method is called when your extension is deactivated
export function deactivate() { }
