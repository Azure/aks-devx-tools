import * as vscode from "vscode";
import { longRunning } from "./../../utils/host";
import { ensureDraftBinary } from "./helper/runDraftHelper";
import { QuickPickItem, window, ExtensionContext } from "vscode";
import {
  buildCreateCommand,
  buildCreateConfig,
} from "./helper/draftCommandBuilder";
import { runDraftCommand } from "./helper/runDraftHelper";
import { reporter } from "./../../utils/reporter";
import {
  MultiStepInput,
  validationSleep,
  shouldResume,
} from "./model/multiStep";
import { validatePort } from "../../utils/validation";
import { AzApi } from "../../utils/az";
import { failed } from "../../utils/errorable";
import { ResourceGroup } from "@azure/arm-resources";
import { Context, ContextApi } from "../../utils/context";
import { Subscription } from "@azure/arm-subscriptions";
import * as fs from "fs";
import { join, basename } from "path";
import k8s = require("@kubernetes/client-node");
import { createNamespace, listNamespaces } from "../../utils/k8Helper";

export default async function runDraftDeployment(
  _context: vscode.ExtensionContext,
  destination: string,
  az: AzApi
): Promise<void> {
  const downloadResult = await longRunning(`Downloading Draft.`, () =>
    ensureDraftBinary()
  );
  if (!downloadResult) {
    return undefined;
  }

  multiStepInput(_context, destination, az);
}

async function multiStepInput(
  context: ExtensionContext,
  destination: string,
  az: AzApi
) {
  const title = "Draft a Kubernetes Deployment and Service";
  const formats = ["Manifests", "Helm", "Kustomize"];
  const formatLabels: QuickPickItem[] = formats.map((label) => ({ label }));
  const azureContainerRegistry = "Azure Container Registry";
  const imageTypes = [azureContainerRegistry, "Other"];
  const imageTypeLabels: QuickPickItem[] = imageTypes.map((label) => ({
    label,
  }));

  interface State {
    outputFolder: string;
    format: string;
    namespace: string;
    name: string;
    imageType: string;
    subscription: string;
    resourceGroup: string;
    repository: string;
    tag: string;
    acr: string;
    image: string;
    port: string;
    runtime: QuickPickItem;
  }

  const ctx: ContextApi = new Context(context);

  async function collectInputs() {
    const state = {
      outputFolder: destination,
      name: basename(destination).toLowerCase().replace(/[^a-zA-Z0-9-]+/g,""),
      port: ctx.getPort(),
      image: ctx.getImage(),
      acr: ctx.getAcrName(),
      subscription: ctx.getSubscription(),
      repository: ctx.getAcrRepository(),
      resourceGroup: ctx.getAcrResourceGroup(),
      tag: ctx.getAcrTag() || "latest",
    } as Partial<State>;
    await MultiStepInput.run((input) => inputOutputFolder(input, state, 1));
    return state as State;
  }

  const totalSteps = 6;
  async function inputOutputFolder(
    input: MultiStepInput,
    state: Partial<State>,
    step: number
  ) {
    state.outputFolder = await input.showInputBox({
      title,
      step: step,
      totalSteps: totalSteps,
      value: typeof state.outputFolder === "string" ? state.outputFolder : "",
      prompt: "Output directory destination (e.g. ./manifests)",
      validate: async () => undefined,
      shouldResume: shouldResume,
    });
    return (input: MultiStepInput) => inputFormat(input, state, step + 1);
  }

  async function inputFormat(
    input: MultiStepInput,
    state: Partial<State>,
    step: number
  ) {
    const pick = await input.showQuickPick({
      title,
      step: step,
      totalSteps: totalSteps,
      placeholder: "Format",
      items: formatLabels,
      activeItem: typeof state.format !== "string" ? state.format : undefined,
      shouldResume: shouldResume,
    });
    state.format = pick.label;

    return (input: MultiStepInput) => selectNamespace(input, state, step + 1);
  }

  async function selectNamespace(
    input: MultiStepInput,
    state: Partial<State>,
    step: number
  ): Promise<(input: MultiStepInput) => any> {
    async function listNamespacesWithTimeout(): Promise<k8s.V1Namespace[]> {
      return new Promise<k8s.V1Namespace[]>((resolve, reject) => {
        setTimeout(() => {
          const noNamespaces: k8s.V1Namespace[] = [];
          window.showInformationMessage("No namespaces found in the current kubeconfig");
          resolve(noNamespaces);
        }, 3000);
        listNamespaces().then((namespaces) => {
          resolve(namespaces);
        });
      });
    }

    const namespaces: k8s.V1Namespace[] = await longRunning("Getting k8s namespaces", listNamespacesWithTimeout);
    const items = namespaces.map((namespace) => {
      return {
        label: `${namespace.metadata?.name}`,
      };
    });
    const newNamespace = "New Namespace";
    const itemsWithNew: vscode.QuickPickItem[] = [
      { label: newNamespace },
      ...items,
    ];

    const pick = await input.showQuickPick({
      title,
      step: step,
      totalSteps: totalSteps,
      placeholder: "Kubernetes namespace",
      items: itemsWithNew,
      activeItem: undefined,
      shouldResume: shouldResume,
    });

    if (pick.label === newNamespace) {
      return (input: MultiStepInput) => inputNewNamespace(input, state, step);
    }

    state.namespace = pick.label;
    return (input: MultiStepInput) => inputName(input, state, step + 1);
  }

  async function inputNewNamespace(
    input: MultiStepInput,
    state: Partial<State>,
    step: number
  ) {
    const ns = await input.showInputBox({
      title,
      step: step,
      totalSteps: totalSteps,
      validate: async () => undefined,
      value: "",
      prompt: "Namespace",
      shouldResume: shouldResume,
    });
    await createNamespace(ns);
    state.namespace = ns;
    return (input: MultiStepInput) => selectNamespace(input, state, step);
  }

  async function inputName(
    input: MultiStepInput,
    state: Partial<State>,
    step: number
  ) {
    state.name = await input.showInputBox({
      title,
      step: step,
      totalSteps: totalSteps,
      value: typeof state.name === "string" ? state.name : "",
      prompt: "Application name (e.g. myapp-frontend)",
      validate: async (name: string) => {
        await validationSleep();
        const alphanumDash = /^[0-9a-z-]+$/;
        const maxLen = 63;

        if (!name.match(alphanumDash)) {
          return "Application name must be lowercase alphanumeric plus '-'";
        }
        if (name.length > maxLen) {
          return `Application name length must be less than ${maxLen}`;
        }
        if (name.charAt(0) === "-" || name.charAt(name.length - 1) === "-") {
          return "Application name must start and end with a lowercase alphanumeric character";
        }

        return undefined;
      },
      shouldResume: shouldResume,
    });

    return (input: MultiStepInput) => inputImageType(input, state, step + 1);
  }

  async function inputImageType(
    input: MultiStepInput,
    state: Partial<State>,
    step: number
  ) {
    const pick = await input.showQuickPick({
      title,
      step: step,
      totalSteps: totalSteps,
      placeholder: "Image type",
      items: imageTypeLabels,
      activeItem:
        typeof state.imageType !== "string" ? state.imageType : undefined,
      shouldResume: shouldResume,
    });
    state.imageType = pick.label;

    if (state.imageType === azureContainerRegistry) {
      return (input: MultiStepInput) => inputAcrImage(input, state, step);
    }

    return (input: MultiStepInput) => inputImage(input, state, step);
  }

  async function inputAcrImage(
    input: MultiStepInput,
    state: Partial<State>,
    step: number
  ) {
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

    const acrResult = await az.getAcrs(
      state.subscription as string,
      state.resourceGroup as string
    );
    if (failed(acrResult)) {
      window.showErrorMessage(
        `Failed to get Azure Container Registries: ${acrResult.error}`
      );
      return;
    }
    const acrs = acrResult.result;
    const acrItems: QuickPickItem[] = acrs.map((acr) => ({
      label: acr.name as string,
    }));
    const selectedAcr = await input.showQuickPick({
      title,
      step,
      totalSteps,
      placeholder: "Select an Azure Container Registry",
      items: acrItems,
      activeItem: typeof state.acr !== "string" ? state.acr : undefined,
      shouldResume,
    });
    state.acr = selectedAcr.label;

    state.repository = await input.showInputBox({
      title,
      step: step,
      totalSteps: totalSteps,
      value: typeof state.repository === "string" ? state.repository : "",
      prompt: "Repository",
      validate: async (repo: string) => {
        await validationSleep();

        const re = /^[a-z0-9]+((?:[._/]|__|[-]{0,10})[a-z0-9]+)*$/;
        if (!repo.match(re)) {
          return "Repository can only include lowercase alphanumeric characters, periods, dashes, underscores, and forward slashes";
        }

        return undefined;
      },
      shouldResume: shouldResume,
    });

    state.tag = await input.showInputBox({
      title,
      step: step,
      totalSteps: totalSteps,
      value: typeof state.tag === "string" ? state.tag : "",
      prompt: "Tag",
      validate: async (tag: string) => {
        await validationSleep();

        // TODO: verify and change error message
        if (!tag.match(/^[\w.\-_]{1,127}$/)) {
          return "Tag is invalid";
        }

        return undefined;
      },
      shouldResume: shouldResume,
    });

    // construct image
    state.image = `${state.acr}.azurecr.io/${state.repository}:${state.tag}`;

    return (input: MultiStepInput) => inputPortNumber(input, state, step + 1);
  }

  async function inputImage(
    input: MultiStepInput,
    state: Partial<State>,
    step: number
  ) {
    state.image = await input.showInputBox({
      title,
      step: step,
      totalSteps: totalSteps,
      value: typeof state.image === "string" ? state.image : "",
      prompt: "Image",
      // TODO: add image validation
      validate: async () => undefined,
      shouldResume: shouldResume,
    });

    return (input: MultiStepInput) => inputPortNumber(input, state, step + 1);
  }

  async function inputPortNumber(
    input: MultiStepInput,
    state: Partial<State>,
    step: number
  ) {
    state.port = await input.showInputBox({
      title,
      step: step,
      totalSteps: totalSteps,
      value: typeof state.port === "string" ? state.port : "",
      prompt: "Port (e.g. 80)",
      validate: validatePort,
      shouldResume: shouldResume,
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

  const configPath = buildCreateConfig(
    "",
    port,
    name,
    format,
    "",
    namespace,
    image
  );
  const command = buildCreateCommand(outputFolder, "deployment", configPath);

  const [success, err] = await runDraftCommand(command);
  const isSuccess = err?.length === 0 && success?.length !== 0;
  if (reporter) {
    reporter.sendTelemetryEvent("deploymentDraftResult", {
      deploymentDraftResult: `${isSuccess}`,
    });
  }

  if (isSuccess) {
    // TODO: refactor this stuff to be cleaner (use an enum)
    const folder = () => {
      if (format === "Manifests") {
        return "manifests";
      }
      if (format === "Helm") {
        return "charts";
      }
      return "base";
    };
    const outputPath = join(outputFolder, folder());
    const files = fs
      .readdirSync(outputPath)
      .map((file) => join(outputPath, file))
      .filter((file) => !fs.statSync(file).isDirectory());
    for (const file of files) {
      const vscodeFile = vscode.Uri.file(file);
      await vscode.workspace
        .openTextDocument(vscodeFile)
        .then((doc) => vscode.window.showTextDocument(doc, { preview: false }));
    }

    if (format === "Manifests") {
      ctx.setDeploymentType("Manifests");
      ctx.setManifestsPath(outputPath);
    }
    if (format === "Helm") {
      ctx.setDeploymentType("Helm");
      ctx.setChartPath(outputPath);
    }

    const deploy = "Deploy";
    window
      .showInformationMessage("Draft Deployment and Services Succeeded", deploy)
      .then((option) => {
        if (option === deploy) {
          // TODO: use k8s wrapper instead of this
          // TODO: we should check if their cluster is connected to their acr?
          const terminal = vscode.window.createTerminal("AKS DevX");
          terminal.sendText(`kubectl apply -f ${outputPath}`);
          terminal.show();
        }
      });
  } else {
    window.showErrorMessage(`Draft Deployment and Services Failed - ${err}`);
  }
}
