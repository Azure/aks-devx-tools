import * as vscode from 'vscode';
import { longRunning } from '../../utils/host';
import { downloadDraftBinary } from './helper/runDraftHelper';
import { window, ExtensionContext } from 'vscode';
import { buildSetupGHCommand } from './helper/draftCommandBuilder';
import { runDraftCommand } from './helper/runDraftHelper';
import { reporter } from './../../utils/reporter';
import { MultiStepInput, shouldResume } from './model/multiStep';

export default async function runDraftSetupGH(
    _context: vscode.ExtensionContext,
    destination: string
): Promise<void> {
    const downladResult = await longRunning(`Downloading Draft.`, () => downloadDraftBinary());
    if (!downladResult) {
        return undefined;
    }

    multiStepInput(_context, destination);
}

async function multiStepInput(context: ExtensionContext, destination: string) {
    const title = 'Configure GitHub OpenID Connect';

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
		await MultiStepInput.run(input => inputAppName(input, state, 1));
		return state as State;
	}

    const totalSteps = 4;
	async function inputAppName(input: MultiStepInput, state: Partial<State>, step: number) {
		state.appName = await input.showInputBox({
			title,
			step: step,
			totalSteps: totalSteps,
			value: typeof state.appName === 'string' ? state.appName : '',
			prompt: 'Enter app registration name',
			validate: async() => undefined,
			shouldResume: shouldResume
		});
        return (input: MultiStepInput) => inputSubscritptionId(input, state, step + 1);
	}

	async function inputSubscritptionId(input: MultiStepInput, state: Partial<State>, step: number) {
		state.subscriptionId = await input.showInputBox({
			title,
			step: step,
			totalSteps: totalSteps,
			value: typeof state.subscriptionId === 'string' ? state.subscriptionId : '',
			prompt: 'Enter Azure subscription ID',
			validate: async() => undefined,
			shouldResume: shouldResume
		});
		return (input: MultiStepInput) => inputresourceGroup(input, state, step + 1);
	}

    async function inputresourceGroup(input: MultiStepInput, state: Partial<State>, step: number) {
		state.resourceGroup = await input.showInputBox({
			title,
			step: step,
			totalSteps: totalSteps,
			value: typeof state.resourceGroup === 'string' ? state.resourceGroup : '',
			prompt: 'Enter Azure resource group name',
			validate: async() => undefined,
			shouldResume: shouldResume
		});
        return (input: MultiStepInput) => inputGHRepoName(input, state, step + 1);
	}

	async function inputGHRepoName(input: MultiStepInput, state: Partial<State>, step: number) {
		state.ghRepo = await input.showInputBox({
			title,
			step: step,
			totalSteps: totalSteps,
			value: typeof state.ghRepo === 'string' ? state.ghRepo : '',
			prompt: 'Enter GitHub repository:',
			validate: async() => undefined,
			shouldResume: shouldResume
		});
	}

	const state = await collectInputs();
    const appName = state.appName;
    const subscriptionId = state.subscriptionId;
    const resourceGroup = state.resourceGroup;
    const ghRepo = state.ghRepo;

    const command = buildSetupGHCommand(appName, subscriptionId, resourceGroup, ghRepo);

    const [success, err] = await longRunning(`Setting up GitHub OIDC.`, () => runDraftCommand(command));
    const isSuccess = err?.length === 0 && success?.length !== 0;
    if (reporter) {
        reporter.sendTelemetryEvent("setupghDraftResult", { setupghDraftResult: `${isSuccess}` });
    }

    if (isSuccess) {
	    window.showInformationMessage("GitHub OIDC set up");
    } else {
        window.showErrorMessage(`GitHub OIDC setup failed - ${err}`);
    }
}
