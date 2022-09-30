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
		await MultiStepInput.run(input => inputSubscriptionID(input, state, 1));
		return state as State;
	}

    const totalSteps = 4;

	async function inputSubscriptionID(input: MultiStepInput, state: Partial<State>, step: number) {
		const getSubscriptionsResult = await az.getSubscriptions();
		if (!getSubscriptionsResult.succeeded) {
			window.showErrorMessage(`Failed to get Subscriptions: ${getSubscriptionsResult}`);
			return;
		}
		const subscriptions: Subscription[] = getSubscriptionsResult.result;

		console.log(subscriptions);
		
		const items = subscriptions.map((subscription) => {
			return {
				label: `${subscription.displayName}`,
				description: subscription.subscriptionId,
			};
		});
		
		const selectedItem = await input.showQuickPick({
			title,
			step,
			totalSteps,
			placeholder: 'Select an Azure Subscription',
			items,
			activeItem: typeof state.subscriptionId !== 'string' ? state.subscriptionId : undefined,
			shouldResume
		});

		const selectedSubscription = subscriptions.find((subscription) => subscription.subscriptionId === selectedItem.description) as Subscription;
		state.subscriptionId = selectedSubscription.subscriptionId;

		return (input: MultiStepInput) => inputResourceGroup(input, state, step + 1, az);
	}
	
	async function inputResourceGroup(input: MultiStepInput, state: Partial<State>, step: number,az: AzApi) {
		const getResourceGroupResult = await az.getResourceGroups(state.subscriptionId as string);
		if (!getResourceGroupResult.succeeded) {
			window.showErrorMessage(`Failed to get ResourceGroups: ${getResourceGroupResult}`);
			return;
		}
		const resourceGroups: ResourceGroup[] = getResourceGroupResult.result;
		
		const items: QuickPickItem[] = resourceGroups.map((resourceGroup: ResourceGroup) => {
			return {
				label: `${resourceGroup.name}`,
				description: resourceGroup.location,
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
		state.resourceGroup = selectedItem.label;
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
