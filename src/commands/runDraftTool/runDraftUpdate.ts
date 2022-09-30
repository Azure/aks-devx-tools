import * as vscode from 'vscode';
import { window, ExtensionContext, QuickPickItem } from 'vscode';
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
    const title = 'Draft a Kubernetes Ingress';

	interface State {
		title: string;
		step: number;
		totalSteps: number;
		outputFolder: string;
		namespace: string;
		hostName: string;
		port: string;
		service: string;
		useOpenServiceMesh: string;
        keyVaultCert: string;
	}

	async function collectInputs() {
		const state = {} as Partial<State>;
		await MultiStepInput.run(input => inputOutputFolder(input, state, 1));
		return state as State;
	}

    const totalSteps = 7;
	async function inputOutputFolder(input: MultiStepInput, state: Partial<State>, step: number) {
		state.outputFolder = await input.showInputBox({
			title,
			step: step,
			totalSteps: totalSteps,
			value: typeof state.outputFolder === 'string' ? state.outputFolder : '',
			prompt: 'Select the output folder.',
			validate: async() => undefined,
			shouldResume: shouldResume
		});
        return (input: MultiStepInput) => inputNamespace(input, state, step + 1);
	}
	async function inputNamespace(input: MultiStepInput, state: Partial<State>, step: number) {
		state.namespace = await input.showInputBox({
			title,
			step: step,
			totalSteps: totalSteps,
			value: typeof state.namespace === 'string' ? state.namespace : '',
			prompt: 'Kubernetes namespace (e.g, myapp)',
			validate: async() => undefined,
			shouldResume: shouldResume
		});
        return (input: MultiStepInput) => inputAppName(input, state, step + 1);
	}
	async function inputAppName(input: MultiStepInput, state: Partial<State>, step: number) {
		state.hostName = await input.showInputBox({
			title,
			step: step,
			totalSteps: totalSteps,
			value: typeof state.hostName === 'string' ? state.hostName : '',
			prompt: 'Hostname (e.g, myapp.contoso.com)',
			validate: async() => undefined,
			shouldResume: shouldResume
		});
        return (input: MultiStepInput) => inputPort(input, state, step + 1);
	}

	async function inputPort(input: MultiStepInput, state: Partial<State>, step: number) {
		state.port = await input.showInputBox({
			title,
			step: step,
			totalSteps: totalSteps,
			value: typeof state.port === 'string' ? state.port : '',
			prompt: 'Port (e.g, 80)',
			validate: async() => undefined,
			shouldResume: shouldResume
		});
        return (input: MultiStepInput) => inputService(input, state, step + 1);
	}

	async function inputService(input: MultiStepInput, state: Partial<State>, step: number) {
		state.service = await input.showInputBox({
			title,
			step: step,
			totalSteps: totalSteps,
			value: typeof state.service === 'string' ? state.service : '',
			prompt: 'Service',
			validate: async() => undefined,
			shouldResume: shouldResume
		});
        return (input: MultiStepInput) => pickOpenServiceMesh(input, state, step + 1);
	}

	async function pickOpenServiceMesh(input: MultiStepInput, state: Partial<State>, step: number) {
		const options = ['Use Open Service Mesh for mTLS', 'No Open Service Mesh'];
		const optionsLabels: QuickPickItem[] = options.map(label => ({ label }));
		const pick = await input.showQuickPick({
			title,
			step: step,
			totalSteps: totalSteps,
			placeholder: 'Select an option',
			items: [...optionsLabels],
			activeItem: typeof state.useOpenServiceMesh !== 'string' ? state.useOpenServiceMesh : undefined,
			shouldResume: shouldResume
		});
		state.useOpenServiceMesh = pick.label;
        return (input: MultiStepInput) => pickKeyVaultCert(input, state, step + 1);
	}

    async function pickKeyVaultCert(input: MultiStepInput, state: Partial<State>, step: number) {
		const options = ['Azure Key Vault', 'Provide Azure Key Vault Certificate URI'];
		const optionsLabels: QuickPickItem[] = options.map(label => ({ label }));
		const pick = await input.showQuickPick({
			title,
			step: step,
			totalSteps: totalSteps,
			placeholder: 'Select a certificate',
			items: [...optionsLabels],
			activeItem: typeof state.keyVaultCert !== 'string' ? state.keyVaultCert : undefined,
			shouldResume: shouldResume
		});
		state.keyVaultCert = pick.label;
	}
	const state = await collectInputs();

    const host = state.hostName;
	const namespace = state.namespace;
	const outputFolder = state.outputFolder;
	const port = state. port;
    const certificate = state.keyVaultCert;
	const service = state.service;
	const useOpenServiceMesh = state.useOpenServiceMesh === 'Use Open Service Mesh for mTLS' ? true : false;
    const command = buildUpdateCommand(outputFolder, host, certificate, port, namespace, service, useOpenServiceMesh);

    const result = await runDraftCommand(command);
    const [success, err] = await longRunning(`Adding web app routing annotation.`, () => runDraftCommand(command));
    const isSuccess = err?.length === 0 && success?.length !== 0;

    if (reporter) {
        const resultSuccessOrFailure = result[1]?.length === 0 && result[0]?.length !== 0;
        reporter.sendTelemetryEvent("updateDraftResult", { updateDraftResult: `${resultSuccessOrFailure}` });
    }

    if (isSuccess) {
	    window.showInformationMessage("Web app routing annotation succeeded");
		window.showInformationMessage("Deploy using the draft generated files");
    } else {
        window.showErrorMessage(`Web app routing annotation succeeded failed - ${err}`);
    }
}
