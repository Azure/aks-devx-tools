import * as vscode from 'vscode';
import { window, ExtensionContext, QuickPickItem } from 'vscode';
import { getExtensionPath, longRunning } from '../../utils/host';
import { failed } from '../../utils/errorable';
import { buildUpdateCommand } from './helper/draftCommandBuilder';
import { reporter } from '../../utils/reporter';
import { MultiStepInput, shouldResume } from './model/multiStep';
import { ensureDraftBinary, runDraftCommand } from './helper/runDraftHelper';
import { listNamespaces, listNamespacedServices } from '../../utils/k8Helper';
import k8s = require('@kubernetes/client-node');
import { AzApi } from '../../utils/az';
import { ResourceGroup } from '@azure/arm-resources';
import { Subscription } from '@azure/arm-subscriptions';
import * as path from 'path';
import { Context } from '../../utils/context';

export default async function runDraftUpdate(
	_context: vscode.ExtensionContext,
	destination: string,
	az: AzApi
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

	multiStepInput(_context, destination, az);
}


async function multiStepInput(context: ExtensionContext, destination: string, az: AzApi) {
	const title = 'Draft a Kubernetes Ingress';
	const ctx = new Context(context);

	interface State {
		title: string;
		step: number;
		totalSteps: number;
		outputFolder: string;
		namespace: string;
		subscription: string;
		resourceGroup: string;
		hostName: string;
		port: string;
		service: string;
		useOpenServiceMesh: string;
		keyVaultUri :string;
		keyVaultCert: string;
	}

	async function collectInputs() {
		const state = {
			outputFolder: destination,
			port: ctx.getPort()
		} as Partial<State>;
		await MultiStepInput.run(input => inputOutputFolder(input, state, 1));
		return state as State;
	}

	const totalSteps = 9;
	async function inputOutputFolder(input: MultiStepInput, state: Partial<State>, step: number) {
		state.outputFolder = await input.showInputBox({
			title,
			step: step,
			totalSteps: totalSteps,
			value: typeof state.outputFolder === 'string' ? state.outputFolder : '',
			prompt: 'Select the output folder.',
			validate: async () => undefined,
			shouldResume: shouldResume
		});
		return (input: MultiStepInput) => getPort(input, state, step + 1);
	}

	async function getPort(input: MultiStepInput, state: Partial<State>, step: number) {
		state.port = await input.showInputBox({
			title,
			step,
			totalSteps,
			value: typeof state.port === "string" ? state.port : "",
			prompt: "Port", 
			validate: async () => undefined,
			shouldResume: shouldResume
		});
		return (input: MultiStepInput) => getNamespace(input, state, step + 1);
	}

	async function getNamespace(input: MultiStepInput, state: Partial<State>, step: number) {
		const resp = await listNamespaces(); 
		const nsLabels: QuickPickItem[] = resp.map(ns => ({label: ns.metadata?.name as string}));
		const pick = await input.showQuickPick({
			title,
			step,
			totalSteps,
			placeholder: 'Namespace',
			items: nsLabels,
			activeItem: undefined,
			shouldResume: shouldResume
		});
		state.namespace = pick.label;
		return (input: MultiStepInput) => getService(input, state, step + 1);
	}

	async function getService(input: MultiStepInput, state: Partial<State>, step: number) {
		const services = await listNamespacedServices(state.namespace as string);
		const serviceLabels: QuickPickItem[] = services.map(s => ({label: s.metadata?.name as string}));
		const pick = await input.showQuickPick({
			title,
			step,
			totalSteps,
			placeholder: 'Service',
			items: serviceLabels,
			activeItem: undefined,
			shouldResume: shouldResume
		});
		state.service = pick.label;
		return (input: MultiStepInput) => inputAppName(input, state, step + 1);
	}
	
	async function inputAppName(input: MultiStepInput, state: Partial<State>, step: number) {
		state.hostName = await input.showInputBox({
			title,
			step: step,
			totalSteps: totalSteps,
			value: typeof state.hostName === 'string' ? state.hostName : '',
			prompt: 'Hostname (e.g, myapp.contoso.com)',
			validate: async () => undefined,
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
		return (input: MultiStepInput) => pickResourceGroup(input, state, step + 1);
	}

	async function pickResourceGroup(input: MultiStepInput, state: Partial<State>, step: number) {
		const subResult = await az.getSubscriptions();
		if (failed(subResult)) {
		  window.showErrorMessage(
			`Failed to get Subscriptions: ${subResult.error}`
		  );
		  return;
		}
		const subs = subResult.result;

		const rgResult = await az.getResourceGroups(
			...subs.map((sub) => sub.subscriptionId as string)
		  );
		  if (failed(rgResult)) {
			window.showErrorMessage(
			  `Failed to get ResourceGroups: ${rgResult.error}`
			);
			return;
		  }
		  const rgs = rgResult.result;
		  const rgItems: QuickPickItem[] = rgs.map((resourceGroup: ResourceGroup) => {
			const sub = subs.find((sub) =>
			  resourceGroup.id?.startsWith(sub.id as string)
			);
			return {
			  label: `${resourceGroup.name}`,
			  description: `${sub?.displayName}`,
			};
		  });

		  const activeSub = subs.find(
			(sub) => sub.subscriptionId === state.subscription
		  ) as Subscription;
		  const selectedRg = await input.showQuickPick({
			title,
			step,
			totalSteps,
			placeholder: "Select an Azure Resource Group",
			items: rgItems,
			activeItem:
			  typeof state.resourceGroup === "string"
				? { label: state.resourceGroup, description: activeSub.displayName }
				: undefined,
			shouldResume,
		  });

		  const rgOptions = rgs.filter((rg) => rg.name === selectedRg.label);
		  const subscription = subs.find(
			(sub) => sub.displayName === selectedRg.description
		  );
		  const rg = rgOptions.find((rg) =>
			rg.id?.startsWith(subscription?.id as string)
		  );
		  state.subscription = subscription?.subscriptionId;
		  state.resourceGroup = rg?.name;


		return (input: MultiStepInput) => pickKeyVault(input, state, step + 1);
	}

	async function pickKeyVault(input: MultiStepInput, state: Partial<State>, step: number) {
		const vaultResp = await az.getKeyVaults(state.subscription as string, state.resourceGroup as string);
		if (failed(vaultResp)) {
			window.showErrorMessage(`Failed to get Key Vaults: ${vaultResp.error}`);
			return;
		}
		const vaults = vaultResp.result;

		const optionsLabels: QuickPickItem[] = vaults.map(vault => ({ label: vault.name as string, description: vault.properties.vaultUri as string }));
		const pick = await input.showQuickPick({
			title,
			step: step,
			totalSteps: totalSteps,
			placeholder: 'Select a vault',
			items: optionsLabels,
			activeItem: typeof state.keyVaultCert !== 'string' ? state.keyVaultCert : undefined,
			shouldResume: shouldResume
		});
		state.keyVaultUri = pick.description;

		return (input: MultiStepInput) => pickCert(input, state, step + 1);
	}

	async function pickCert(input: MultiStepInput, state: Partial<State>, step: number) {
		state.keyVaultCert = await input.showInputBox({
			title,
			step: step,
			totalSteps: totalSteps,
			prompt: 'Certificate name',
			value: typeof state.keyVaultCert === 'string' ? state.keyVaultCert : "",
			validate: async() => undefined,
			shouldResume: shouldResume
		});
	}

	const state = await collectInputs();

	const host = state.hostName;
	const outputFolder = state.outputFolder;
	const certificate = state.keyVaultCert;
	const useOpenServiceMesh = state.useOpenServiceMesh === 'Use Open Service Mesh for mTLS' ? true : false;

	const output = path.join(outputFolder, "ingress.yaml");
	const uri = vscode.Uri.file(output);
	const ws = new vscode.WorkspaceEdit();
	const ingress = `apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  annotations:
    kubernetes.azure.com/tls-cert-keyvault-uri: "${state.keyVaultUri}"
    kubernetes.azure.com/use-osm-mtls: "${useOpenServiceMesh}"
    nginx.ingress.kubernetes.io/backend-protocol: HTTPS
    nginx.ingress.kubernetes.io/configuration-snippet: |2-
      proxy_ssl_name "default.{{service-namespace}}.cluster.local";
    nginx.ingress.kubernetes.io/proxy-ssl-secret: kube-system/osm-ingress-client-cert
    nginx.ingress.kubernetes.io/proxy-ssl-verify: "on"
  name: ${state.service}
  namespace: ${state.namespace}
spec:
  ingressClassName: webapprouting.kubernetes.azure.com
  rules:
  - host: ${state.hostName}
    http:
      paths:
      - backend:
          service:
            name: ${state.service}
            port:
              number: ${state.port}
        path: /
        pathType: Prefix
  tls:
  - hosts:
    - ${state.hostName}
    secretName: keyvault-${state.service}
`;
	ws.createFile(uri);
	ws.insert(uri, new vscode.Position(0, 0), ingress);
	vscode.workspace.applyEdit(ws).then(() => {
			vscode.workspace.openTextDocument(uri)
				.then((doc) => vscode.window.showTextDocument(doc, { preview: false }));
		}
	);

	/**
	const command = buildUpdateCommand(outputFolder, host, certificate, useOpenServiceMesh);

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
		window.showErrorMessage(`Web app routing annotation failed - ${err}`);
	}*/
	window.showInformationMessage("Ingress set up");
}
