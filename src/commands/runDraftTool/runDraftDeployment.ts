import * as vscode from 'vscode';
import { longRunning } from './../../utils/host';
import { ensureDraftBinary } from './helper/runDraftHelper';
import { QuickPickItem, window, ExtensionContext } from 'vscode';
import { buildCreateCommand, buildCreateConfig } from './helper/draftCommandBuilder';
import { runDraftCommand } from './helper/runDraftHelper';
import { reporter } from './../../utils/reporter';
import { MultiStepInput, validationSleep, shouldResume } from './model/multiStep';
import { validatePort } from '../../utils/validation';

export default async function runDraftDeployment(
    _context: vscode.ExtensionContext,
    destination: string
): Promise<void> {
    const downloadResult = await longRunning(`Downloading Draft.`, () => ensureDraftBinary());
    if (!downloadResult) {
        return undefined;
    }

    multiStepInput(_context, destination);
}

async function multiStepInput(context: ExtensionContext, destination: string) {
    const title = 'Draft a Kubernetes Deployment and Service';
    const formats = ['Manifests', 'Helm', 'Kustomize'];
	const formatLabels: QuickPickItem[] = formats.map(label => ({ label }));

	interface State {
        outputFolder: string;
        format: string;
        namespace: string;
        name: string;
        image: string;
        port: string;
		runtime: QuickPickItem;
	}

	async function collectInputs() {
		const state = {outputFolder: destination} as Partial<State>;
		await MultiStepInput.run(input => inputOutputFolder(input, state, 1));
		return state as State;
	}

    const totalSteps = 6;
    async function inputOutputFolder(input: MultiStepInput, state: Partial<State>, step: number) {
		state.outputFolder = await input.showInputBox({
			title,
			step: step,
			totalSteps: totalSteps,
			value: typeof state.outputFolder === 'string' ? state.outputFolder : '',
			prompt: 'Output directory destination (e.g. ./manifests)',
            validate: async () => undefined,
			shouldResume: shouldResume
		});
        return (input: MultiStepInput) => inputFormat(input, state, step + 1);
	}

    async function inputFormat(input: MultiStepInput, state: Partial<State>, step: number) {
		const pick = await input.showQuickPick({
			title,
			step: step,
			totalSteps: totalSteps,
			placeholder: 'Format',
            items: formatLabels,
            activeItem: typeof state.format !== 'string' ? state.format : undefined,
			shouldResume: shouldResume
		});
        state.format = pick.label;
        
        return (input: MultiStepInput) => selectNamespace(input, state, step + 1);
	}

	async function selectNamespace(input: MultiStepInput, state: Partial<State>, step: number) {
		state.namespace = await input.showInputBox({
			title,
			step: step,
			totalSteps: totalSteps,
            value: typeof state.namespace === 'string' ? state.namespace : '',
            prompt: "Kubernetes namespace (e.g. myapp)",
            validate: async() => undefined,
			shouldResume: shouldResume
		});

        return (input: MultiStepInput) => inputName(input, state, step + 1);
	}

    async function inputName(input: MultiStepInput, state: Partial<State>, step: number) {
        state.name = await input.showInputBox({
            title,
            step: step,
            totalSteps: totalSteps,
            value: typeof state.name === 'string' ? state.name: '',
            prompt: 'Application name (e.g. myapp-frontend)',
            validate: async (name: string) => {
                await validationSleep();
                const alphanumDash = /^[0-9a-z-]+$/;
                const maxLen = 63;

                if (!name.match(alphanumDash)) 
                    return "Application name must be lowercase alphanumeric plus '-'";
                if (name.length > maxLen)
                    return `Application name length must be less than ${maxLen}`
                if (name.charAt(0) === '-' || name.charAt(name.length - 1) === '-')
                    return "Application name must start and end with a lowercase alphanumeric character"

                return undefined;
            },
            shouldResume: shouldResume
        });

        return (input: MultiStepInput) => inputImage(input, state, step + 1);
    }

    async function inputImage(input: MultiStepInput, state: Partial<State>, step: number) {
		state.image = await input.showInputBox({
			title,
			step: step,
			totalSteps: totalSteps,
			value: typeof state.image === 'string' ? state.image : '',
			prompt: 'Select a container registry',
			validate: async() => undefined,
			shouldResume: shouldResume
		});

        return (input: MultiStepInput) => inputPortNumber(input, state, step + 1);
	}

    async function inputPortNumber(input: MultiStepInput, state: Partial<State>, step: number) {
		state.port= await input.showInputBox({
			title,
			step: step,
			totalSteps: totalSteps,
			value: typeof state.port === 'string' ? state.port : '',
			prompt: 'Port (e.g.8080)',
			validate: validatePort,
			shouldResume: shouldResume
		});
	}

	const state = await collectInputs();
    const outputFolder = state.outputFolder;
    const format = state.format;
    const namespace = state.namespace;
    const name = state.name;
    const image = state.image;
    const port = state.port;

    // TODO: use namespace and image

    const configPath = buildCreateConfig("", port, name, format, "");
    const command = buildCreateCommand(outputFolder, "deployment", configPath);

    const [success, err] = await runDraftCommand(command);
    const isSuccess = err?.length === 0 && success?.length !== 0;
    if (reporter) {
      reporter.sendTelemetryEvent("deploymentDraftResult", { deploymentDraftResult: `${isSuccess}` });
    }

    if (isSuccess) {
	    window.showInformationMessage(`Draft Deployment and Services Succeeded - Output to '${outputFolder}'`);
    } else {
        window.showErrorMessage(`Draft Deployment and Services Failed - ${err}`);
    } 
}
