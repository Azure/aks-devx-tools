/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { QuickPickItem, window, Disposable, CancellationToken, QuickInputButton, QuickInput, ExtensionContext, QuickInputButtons, Uri } from 'vscode';
import { buildCreateCommand, buildCreateConfig } from '../helper/draftCommandBuilder';
import { runDraftCommand } from '../helper/runDraftHelper';
import { reporter } from '../../../utils/reporter';

/**
 * A multi-step input using window.createQuickPick() and window.createInputBox().
 * 
 * This first part uses the helper class `MultiStepInput` that wraps the API for the multi-step case.
 */
export async function multiStepInput(context: ExtensionContext, destination: string) {

    const resourceGroups: QuickPickItem[] = ['dockerfile-deployment', 'dockerfile', 'deployment']
		.map(label => ({ label }));

	const langugaesResources: QuickPickItem[] = ['clojure', 'c#', 'erlang', 'go', 'gomodule', "java", "gradle", "javascript", "php", "python", "rust", "swift"]
		.map(label => ({ label }));

    const deploymentType: QuickPickItem[] = ['helm', 'kustomize', 'manifests']
		.map(label => ({ label }));

	interface State {
		title: string;
		step: number;
		totalSteps: number;
		resourceGroup: QuickPickItem | string;
        fileType: QuickPickItem | string;
        language: string;
        portNumber: string;
		name: string;
        deploymentType: string;
		runtime: QuickPickItem;
	}

	async function collectInputs() {
		const state = {} as Partial<State>;
		await MultiStepInput.run(input => pickResourceGroup(input, state));
		return state as State;
	}

    const title = 'Draft Create Command';

	async function pickResourceGroup(input: MultiStepInput, state: Partial<State>) {
		const pick = await input.showQuickPick({
			title,
			step: 1,
			totalSteps: 5,
			placeholder: 'Pick a File Creation Type',
			items: resourceGroups,
			activeItem: typeof state.fileType !== 'string' ? state.fileType : undefined,
			shouldResume: shouldResume
		});
        state.fileType = pick.label;
		return (input: MultiStepInput) => pickResourceGroupLanguages(input, state);
    }

	async function pickResourceGroupLanguages(input: MultiStepInput, state: Partial<State>) {
		const pick = await input.showQuickPick({
			title,
			step: 2,
			totalSteps: 5,
			placeholder: 'Pick a language',
			items: langugaesResources,
			activeItem: typeof state.language !== 'string' ? state.language : undefined,
			shouldResume: shouldResume
		});
		state.language = pick.label;
        return (input: MultiStepInput) => inputPortNumber(input, state);
	}

    async function inputPortNumber(input: MultiStepInput, state: Partial<State>) {
		state.portNumber = await input.showInputBox({
			title,
			step: 3,
			totalSteps: 5,
			value: typeof state.portNumber === 'string' ? state.portNumber : '',
			prompt: 'Port Number',
			validate: validateNameIsUnique,
			shouldResume: shouldResume
		});
        return (input: MultiStepInput) => inputApplicationName(input, state);
		// return (input: MultiStepInput) => inputName(input, state);
	}

	async function inputApplicationName(input: MultiStepInput, state: Partial<State>) {
		state.name = await input.showInputBox({
			title,
			step: 4,
			totalSteps: 5,
			value: typeof state.name === 'string' ? state.name : '',
			prompt: 'Application Name',
			validate: validateNameIsUnique,
			shouldResume: shouldResume
		});
		return (input: MultiStepInput) => pickDeploymentType(input, state);
	}

	async function inputName(input: MultiStepInput, state: Partial<State>) {
		const additionalSteps = typeof state.resourceGroup === 'string' ? 1 : 0;
		// TODO: Remember current value when navigating back.
		state.name = await input.showInputBox({
			title,
			step: 3 + additionalSteps,
			totalSteps: 3 + additionalSteps,
			value: state.name || '',
			prompt: 'Choose a unique name for the Application Service',
			validate: validateNameIsUnique,
			shouldResume: shouldResume
		});
		return (input: MultiStepInput) => pickDeploymentType(input, state);
	}

    async function pickDeploymentType(input: MultiStepInput, state: Partial<State>) {
		const pick = await input.showQuickPick({
			title,
			step: 5,
			totalSteps: 5,
			placeholder: 'Pick a deployment type',
			items: deploymentType,
			activeItem: typeof state.deploymentType !== 'string' ? state.deploymentType : undefined,
			shouldResume: shouldResume
		});
        state.deploymentType = pick.label;
	}

	function shouldResume() {
		// Could show a notification with the option to resume.
		return new Promise<boolean>((resolve, reject) => {
			// noop
		});
	}

	async function validateNameIsUnique(name: string) {
		// ...validate...
		await new Promise(resolve => setTimeout(resolve, 1000));
		return name === 'vscode' ? 'Name not unique' : undefined;
	}

	async function getAvailableRuntimes(resourceGroup: QuickPickItem | string, token?: CancellationToken): Promise<QuickPickItem[]> {
		// ...retrieve...
		await new Promise(resolve => setTimeout(resolve, 1000));
		return ['Node 8.9', 'Node 6.11', 'Node 4.5']
			.map(label => ({ label }));
	}

	const state = await collectInputs();

    const language = state.language;
    const fileType = state.fileType;
    const port = state.portNumber;
    const appName = state.name;
    const workflow = state.deploymentType;
    const dotnetVersion = "";

    const configPath = buildCreateConfig(language, port, appName, workflow, dotnetVersion);
    const command = buildCreateCommand(destination, fileType.toString(), configPath);

    const result = await runDraftCommand(command);
    if (reporter) {
      const resultSuccessOrFailure = result[1]?.length === 0 && result[0]?.length !== 0;
      reporter.sendTelemetryEvent("createDraftResult", { createDraftResult: `${resultSuccessOrFailure}` });
    }

	window.showInformationMessage(`Draft Message - '${result}'`);
}


// -------------------------------------------------------
// Helper code that wraps the API for the multi-step case.
// -------------------------------------------------------


class InputFlowAction {
	static back = new InputFlowAction();
	static cancel = new InputFlowAction();
	static resume = new InputFlowAction();
}

type InputStep = (input: MultiStepInput) => Thenable<InputStep | void>;

interface QuickPickParameters<T extends QuickPickItem> {
	title: string;
	step: number;
	totalSteps: number;
	items: T[];
	activeItem?: T;
	placeholder: string;
	buttons?: QuickInputButton[];
	shouldResume: () => Thenable<boolean>;
}

interface InputBoxParameters {
	title: string;
	step: number;
	totalSteps: number;
	value: string;
	prompt: string;
	validate: (value: string) => Promise<string | undefined>;
	buttons?: QuickInputButton[];
	shouldResume: () => Thenable<boolean>;
}

class MultiStepInput {

	static async run<T>(start: InputStep) {
		const input = new MultiStepInput();
		return input.stepThrough(start);
	}

	private current?: QuickInput;
	private steps: InputStep[] = [];

	private async stepThrough<T>(start: InputStep) {
		let step: InputStep | void = start;
		while (step) {
			this.steps.push(step);
			if (this.current) {
				this.current.enabled = false;
				this.current.busy = true;
			}
			try {
				step = await step(this);
			} catch (err) {
				if (err === InputFlowAction.back) {
					this.steps.pop();
					step = this.steps.pop();
				} else if (err === InputFlowAction.resume) {
					step = this.steps.pop();
				} else if (err === InputFlowAction.cancel) {
					step = undefined;
				} else {
					throw err;
				}
			}
		}
		if (this.current) {
			this.current.dispose();
		}
	}

	async showQuickPick<T extends QuickPickItem, P extends QuickPickParameters<T>>({ title, step, totalSteps, items, activeItem, placeholder, buttons, shouldResume }: P) {
		const disposables: Disposable[] = [];
		try {
			return await new Promise<T | (P extends { buttons: (infer I)[] } ? I : never)>((resolve, reject) => {
				const input = window.createQuickPick<T>();
				input.title = title;
				input.step = step;
				input.totalSteps = totalSteps;
				input.placeholder = placeholder;
				input.items = items;
				if (activeItem) {
					input.activeItems = [activeItem];
				}
				input.buttons = [
					...(this.steps.length > 1 ? [QuickInputButtons.Back] : []),
					...(buttons || [])
				];
				disposables.push(
					input.onDidTriggerButton(item => {
						if (item === QuickInputButtons.Back) {
							reject(InputFlowAction.back);
						} else {
							resolve(<any>item);
						}
					}),
					input.onDidChangeSelection(items => resolve(items[0])),
					input.onDidHide(() => {
						(async () => {
							reject(shouldResume && await shouldResume() ? InputFlowAction.resume : InputFlowAction.cancel);
						})()
							.catch(reject);
					})
				);
				if (this.current) {
					this.current.dispose();
				}
				this.current = input;
				this.current.show();
			});
		} finally {
			disposables.forEach(d => d.dispose());
		}
	}

	async showInputBox<P extends InputBoxParameters>({ title, step, totalSteps, value, prompt, validate, buttons, shouldResume }: P) {
		const disposables: Disposable[] = [];
		try {
			return await new Promise<string | (P extends { buttons: (infer I)[] } ? I : never)>((resolve, reject) => {
				const input = window.createInputBox();
				input.title = title;
				input.step = step;
				input.totalSteps = totalSteps;
				input.value = value || '';
				input.prompt = prompt;
				input.buttons = [
					...(this.steps.length > 1 ? [QuickInputButtons.Back] : []),
					...(buttons || [])
				];
				let validating = validate('');
				disposables.push(
					input.onDidTriggerButton(item => {
						if (item === QuickInputButtons.Back) {
							reject(InputFlowAction.back);
						} else {
							resolve(<any>item);
						}
					}),
					input.onDidAccept(async () => {
						const value = input.value;
						input.enabled = false;
						input.busy = true;
						if (!(await validate(value))) {
							resolve(value);
						}
						input.enabled = true;
						input.busy = false;
					}),
					input.onDidChangeValue(async text => {
						const current = validate(text);
						validating = current;
						const validationMessage = await current;
						if (current === validating) {
							input.validationMessage = validationMessage;
						}
					}),
					input.onDidHide(() => {
						(async () => {
							reject(shouldResume && await shouldResume() ? InputFlowAction.resume : InputFlowAction.cancel);
						})()
							.catch(reject);
					})
				);
				if (this.current) {
					this.current.dispose();
				}
				this.current = input;
				this.current.show();
			});
		} finally {
			disposables.forEach(d => d.dispose());
		}
	}
}