import * as vscode from 'vscode';
import { window, ExtensionContext } from 'vscode';
import { getExtensionPath, longRunning } from '../../utils/host';
import { failed } from '../../utils/errorable';
import { buildUpdateCommand } from './helper/draftCommandBuilder';
import { reporter } from '../../utils/reporter';
import { MultiStepInput, shouldResume } from './model/multiStep';
import { ensureDraftBinary, runDraftCommand } from './helper/runDraftHelper';

export default async function runDraftUpdate(
    _context: vscode.ExtensionContext,
    destination: string
): Promise<void> {

    const extensionPath = getExtensionPath();
    if (failed(extensionPath)) {
        vscode.window.showErrorMessage(extensionPath.error);
        return undefined;
    }

    // Download Binary first
    const downladResult = await longRunning(`Downloading Draft.`, () => ensureDraftBinary());
    if (!downladResult) {
        return undefined;
    }
    
    multiStepInput(_context, destination);
}


async function multiStepInput(context: ExtensionContext, destination: string) {
    const title = 'Draft Web App Routing Annotations';

	interface State {
		title: string;
		step: number;
		totalSteps: number;
		hostName: string;
        keyVaultCert: string;
	}

	async function collectInputs() {
		const state = {} as Partial<State>;
		await MultiStepInput.run(input => inputAppName(input, state, 1));
		return state as State;
	}

    const totalSteps = 2;
	async function inputAppName(input: MultiStepInput, state: Partial<State>, step: number) {
		state.hostName = await input.showInputBox({
			title,
			step: step,
			totalSteps: totalSteps,
			value: typeof state.hostName === 'string' ? state.hostName : '',
			prompt: 'Enter the host of the ingress resource',
			validate: async() => undefined,
			shouldResume: shouldResume
		});
        return (input: MultiStepInput) => inputKeyVaultCert(input, state, step + 1);
	}

    async function inputKeyVaultCert(input: MultiStepInput, state: Partial<State>, step: number) {
		state.keyVaultCert = await input.showInputBox({
			title,
			step: step,
			totalSteps: totalSteps,
			value: typeof state.keyVaultCert === 'string' ? state.keyVaultCert : '',
			prompt: 'Enter Azure resource group name',
			validate: async() => undefined,
			shouldResume: shouldResume
		});
	}
	const state = await collectInputs();

    const host = state.hostName;
    const certificate = state.keyVaultCert;

    const command = buildUpdateCommand(destination, host, certificate);

    const result = await runDraftCommand(command);
    const [success, err] = await longRunning(`Adding web app routing annotation.`, () => runDraftCommand(command));
    const isSuccess = err?.length === 0 && success?.length !== 0;

    if (reporter) {
        const resultSuccessOrFailure = result[1]?.length === 0 && result[0]?.length !== 0;
        reporter.sendTelemetryEvent("updateDraftResult", { updateDraftResult: `${resultSuccessOrFailure}` });
    }

    if (isSuccess) {
	    window.showInformationMessage("Web app routing annotation succeeded");
    } else {
        window.showErrorMessage(`Web app routing annotation succeeded failed - ${err}`);
    }
}
