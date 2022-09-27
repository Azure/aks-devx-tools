/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { QuickPickItem, window, CancellationToken, ExtensionContext } from 'vscode';
import { buildCreateCommand, buildCreateConfig, buildSetupGHCommand } from '../helper/draftCommandBuilder';
import { runDraftCommand } from '../helper/runDraftHelper';
import { reporter } from '../../../utils/reporter';
import { MultiStepInput } from '../../../utils/multiStepWizardWrapper';
import { longRunning } from '../../../utils/host';

export async function multiStepInput(context: ExtensionContext, destination: string) {

	interface State {
		title: string;
		step: number;
		totalSteps: number;
		resourceGroup: string;
        subscriptionId: string;
		appName: string;
        ghRepo: string;
	}

	async function collectInputs() {
		const state = {} as Partial<State>;
		await MultiStepInput.run(input => inputAppName(input, state));
		return state as State;
	}

    const title = 'Run Draft Setup GitHub OpenID Connect (OIDC)';

	async function inputAppName(input: MultiStepInput, state: Partial<State>) {
		state.appName = await input.showInputBox({
			title,
			step: 1,
			totalSteps: 4,
			value: typeof state.appName === 'string' ? state.appName : '',
			prompt: 'Enter app registration name',
			validate: validateNameIsUnique,
			shouldResume: shouldResume
		});
        return (input: MultiStepInput) => inputSubscritptionId(input, state);
	}

	async function inputSubscritptionId(input: MultiStepInput, state: Partial<State>) {
		state.subscriptionId = await input.showInputBox({
			title,
			step: 2,
			totalSteps: 4,
			value: typeof state.subscriptionId === 'string' ? state.subscriptionId : '',
			prompt: 'Enter Azure subscription ID',
			validate: validateNameIsUnique,
			shouldResume: shouldResume
		});
		return (input: MultiStepInput) => inputresourceGroup(input, state);
	}

    async function inputresourceGroup(input: MultiStepInput, state: Partial<State>) {
		state.resourceGroup = await input.showInputBox({
			title,
			step: 3,
			totalSteps: 4,
			value: typeof state.resourceGroup === 'string' ? state.resourceGroup : '',
			prompt: 'Enter Azure resource group name',
			validate: validateNameIsUnique,
			shouldResume: shouldResume
		});
        return (input: MultiStepInput) => inputGHRepoName(input, state);
	}

	async function inputGHRepoName(input: MultiStepInput, state: Partial<State>) {
		state.ghRepo = await input.showInputBox({
			title,
			step: 4,
			totalSteps: 4,
			value: typeof state.ghRepo === 'string' ? state.ghRepo : '',
			prompt: 'Enter Github repository:',
			validate: validateNameIsUnique,
			shouldResume: shouldResume
		});
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

	const state = await collectInputs();

    const appName = state.appName;
    const subscriptionId = state.subscriptionId;
    const resourceGroup = state.resourceGroup;
    const ghRepo = state.ghRepo;

    const command = buildSetupGHCommand(appName, subscriptionId, resourceGroup, ghRepo);

    const result = await longRunning(`Setting up Github OIDC.`, () => runDraftCommand(command));
    if (reporter) {
        const resultSuccessOrFailure = result[1]?.length === 0 && result[0]?.length !== 0;
        reporter.sendTelemetryEvent("setupghDraftResult", { setupghDraftResult: `${resultSuccessOrFailure}` });
    }

	window.showInformationMessage(`Draft Message - '${result}'`);
}
