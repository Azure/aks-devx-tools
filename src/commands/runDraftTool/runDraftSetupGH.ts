import * as vscode from 'vscode';
import { QuickPickItem } from 'vscode';
import { longRunning } from '../../utils/host';
import { ensureDraftBinary } from './helper/runDraftHelper';
import { window, ExtensionContext } from 'vscode';
import { buildSetupGHCommand } from './helper/draftCommandBuilder';
import { runDraftCommand } from './helper/runDraftHelper';
import { reporter } from './../../utils/reporter';
import { MultiStepInput, shouldResume } from './model/multiStep';
import { AzApi } from '../../utils/az';
import { SubscriptionClient, Subscription } from "@azure/arm-subscriptions";
import { ResourceGroup } from '@azure/arm-resources';
import { basename } from 'path';
import { API as GitAPI } from '../../utils/git';
import { failed } from '../../utils/errorable';

export default async function runDraftSetupGH(
    _context: vscode.ExtensionContext,
    destination: string,
	az: AzApi,
	git: GitAPI
): Promise<void> {
    const downladResult = await longRunning(`Downloading Draft.`, () => ensureDraftBinary());
    if (!downladResult) {
        return undefined;
    }

    multiStepInput(_context, destination,az,git);
}

async function multiStepInput(context: ExtensionContext, destination: string, az: AzApi, git: GitAPI) {
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

    const defaultAppName = basename(destination);

	const filteredRepositories = git.repositories.filter(r => r.rootUri.fsPath === destination);
	const firstFiltered = filteredRepositories[0];
	const firstRemote = firstFiltered && firstFiltered.state.remotes[0];
	const firstPushUrl = firstRemote && firstRemote.pushUrl;
	const defaultRepo = firstPushUrl || 'https://github.com/username/repo';

	async function collectInputs() {
		const state = {
			appName: defaultAppName,
			ghRepo: defaultRepo,
		} as Partial<State>;
		await MultiStepInput.run(input => inputResourceGroup(input, state, 1, az));
		return state as State;
	}

    const totalSteps = 3;

	async function inputResourceGroup(input: MultiStepInput, state: Partial<State>, step: number,az: AzApi) {
		const subResult = await az.getSubscriptions();
		if (failed(subResult)) {
		  window.showErrorMessage(
			`Failed to get Subscriptions: ${subResult.error}`
		  );
		  return;
		}
		const subs = subResult.result;


		const getResourceGroupResult = await az.getResourceGroups(...subs.map(sub => sub.subscriptionId as string));
		if (!getResourceGroupResult.succeeded) {
			window.showErrorMessage(`Failed to get ResourceGroups: ${getResourceGroupResult}`);
			return;
		}
		const resourceGroups: ResourceGroup[] = getResourceGroupResult.result;
		
		const items: QuickPickItem[] = resourceGroups.map((resourceGroup: ResourceGroup) => {
			const sub = subs.find((sub) =>
			resourceGroup.id?.startsWith(sub.id as string)
		  );
			return {
				label: `${resourceGroup.name}`,
				description: `${sub?.displayName}`,
			};
		});

		const selectedItem = await input.showQuickPick({
			title,
			step,
			totalSteps,
			placeholder: 'Select an Azure Resource Group',
			items,
			activeItem: typeof state.resourceGroup !== 'string' ? state.resourceGroup : undefined,
			shouldResume
		});
		const rgOptions = resourceGroups.filter((rg) => rg.name === selectedItem.label);
		const subscription = subs.find(
		  (sub) => sub.displayName === selectedItem.description
		);
		const rg = rgOptions.find((rg) =>
		  rg.id?.startsWith(subscription?.id as string)
		);
		state.subscriptionId = subscription?.subscriptionId;
		state.resourceGroup = rg?.name;

        return (input: MultiStepInput) => inputAppName(input, state, step + 1);
	}

	async function inputAppName(input: MultiStepInput, state: Partial<State>, step: number) {
		state.appName = await input.showInputBox({
			title,
			step: step,
			totalSteps: totalSteps,
			value: typeof state.appName === 'string' ? state.appName : '',
			prompt: 'Azure Active Directory application name (e.g. myapp-github-actions)',
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
			prompt: 'Enter GitHub repository (e.g. https://github.com/contoso/myapp)',
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

    const [success, err] = await longRunning(`Setting up GitHub OIDC`, () => runDraftCommand(command));
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
