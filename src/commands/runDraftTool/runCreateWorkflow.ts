import * as vscode from "vscode";
import * as yaml from "yaml";
import * as wfTemplates from "./../../utils/workflowTemplates";
import { QuickPickItem, window, ExtensionContext } from "vscode";
import { reporter } from "./../../utils/reporter";
import {
  MultiStepInput,
  validationSleep,
  shouldResume,
} from "./model/multiStep";
import * as fs from "fs";
import * as path from "path";
import linguist = require("linguist-js");
import { Exception, template } from "handlebars";
import { AzApi } from "../../utils/az";
import { succeeded, failed } from "../../utils/errorable";

const wsPath = vscode.workspace.workspaceFolders![0].uri.fsPath;
const githubFolderName = ".github";
const workflowsFolderName = "workflows";
const workflowPath = path.join(wsPath, githubFolderName, workflowsFolderName);

const helmWorkflowType = "Helm";
const kubeWorkflowType = "Kube";
const basicDeploymentStrategy = "Basic";
const canaryDeploymentStrategy = "Canary";
const bgDeploymentStrategy = "Blue/green";

const containerRegistryPlaceholder = "your-azure-container-registry";
const containerImagePlaceholder = "your-container-image-name";
const rgPlaceholder = "your-resource-group";
const clusterPlaceholder = "your-cluster-name";
const manifestPathPlaceholder = "your-deployment-manifest-path";
const dockerfilePathPlaceholder = "your-dockerfile-folder-path";
const deploymentStrategyPlaceholder = "your-deployment-strategy";
const branchPlaceholder = "your-branch-name";
const helmCmdPlaceholder = "your-helm-command";

export default async function runCreateWorkflow(
  _context: vscode.ExtensionContext,
  destination: string,
  az: AzApi
): Promise<void> {
  // init - create workflows folder if it doesn't already exist

  if (
    !fs.existsSync(workflowPath) ||
    !fs.lstatSync(workflowPath).isDirectory()
  ) {
    fs.mkdirSync(workflowPath, { recursive: true });
  }

  multiStepInput(_context, destination, az);
}

async function multiStepInput(
  context: ExtensionContext,
  destination: string,
  az: AzApi
) {
  const title = "Generate Github Actions workflow";

  interface State {
    resourceGroup: string;
    aksClusterName: string;
    containerRegistry: string;
    containerImageName: string;
    deploymentStrategy: string;
    branch: string;
    dockerfileLocation: string;
    manifestsLocation: string;
    workflowType: string;
    chartPath: string;
    chartsOverridePaths: string;
    chartOverrideValues: string;
  }

  async function collectInputs() {
    const state = { sourceFolder: destination } as Partial<State>;
    await MultiStepInput.run((input) => selectResourceGroup(input, state, 1));
    return state as State;
  }

  var totalSteps = 9;

  // @ts-ignore recursive function
  async function selectResourceGroup(
    input: MultiStepInput,
    state: Partial<State>,
    step: number
  ) {
    // const rgList = getResourceGroups();
    let items: QuickPickItem[] = [];
    const rgList = await az.getResourceGroups();
    if (succeeded(rgList)) {
      items = rgList.result.map((rg) => ({ label: rg.name as string }));
    } else {
      window.showErrorMessage(
        `Failed to retrieve resource groups: ${rgList.error}`
      );
    }

    const pick = await input.showQuickPick({
      title,
      step: step,
      totalSteps: totalSteps,
      placeholder: "Select Azure Resource Group",
      items: items,
      activeItem:
        typeof state.resourceGroup !== "string"
          ? state.resourceGroup
          : undefined,
      shouldResume: shouldResume,
    });

    state.resourceGroup = pick.label;

    return (input: MultiStepInput) => selectAksCluster(input, state, step + 1);
  }

  // @ts-ignore recursive function
  async function selectAksCluster(
    input: MultiStepInput,
    state: Partial<State>,
    step: number
  ) {
    const clusterList = getAKSClusters();
    const items: QuickPickItem[] = clusterList.map((label) => ({ label }));

    const pick = await input.showQuickPick({
      title,
      step: step,
      totalSteps: totalSteps,
      placeholder: "Select Azure Kubernetes Service (AKS) cluster",
      items: items,
      activeItem:
        typeof state.aksClusterName !== "string"
          ? state.aksClusterName
          : undefined,
      shouldResume: shouldResume,
    });

    state.aksClusterName = pick.label;

    return (input: MultiStepInput) => selectAcrRegistry(input, state, step + 1);
  }

  // @ts-ignore recursive function
  async function selectAcrRegistry(
    input: MultiStepInput,
    state: Partial<State>,
    step: number
  ) {
    const registryList = getContainerRegistries();
    const items: QuickPickItem[] = registryList.map((label) => ({ label }));

    const pick = await input.showQuickPick({
      title,
      step: step,
      totalSteps: totalSteps,
      placeholder: "Select Azure Container Registry",
      items: items,
      activeItem:
        typeof state.containerRegistry !== "string"
          ? state.containerRegistry
          : undefined,
      shouldResume: shouldResume,
    });

    state.containerRegistry = pick.label;

    return (input: MultiStepInput) =>
      inputContainerImageName(input, state, step + 1);
  }

  async function inputContainerImageName(
    input: MultiStepInput,
    state: Partial<State>,
    step: number
  ) {
    state.containerImageName = await input.showInputBox({
      title,
      step: step,
      totalSteps: totalSteps,
      value:
        typeof state.containerImageName === "string"
          ? state.containerImageName
          : "",
      prompt: "Container image name",
      validate: async (imageName: string) => {
        await validationSleep();
        const imgNameErr =
          "Invalid container image name. Must be lowercase alphanumeric and start with a letter or number, with following parts separated by one period, one or two underscores and multiple dashes";
        if (imageName === "") {
          return imgNameErr;
        }
        if (imageName.toLowerCase() !== imageName) {
          return imgNameErr;
        }
        if (
          !/^[a-z0-9]+(?:(?:(?:[._]|__|[-]|__|[/_]*)[a-z0-9]+)+)?$/gi.test(
            imageName
          )
        ) {
          return imgNameErr;
        }

        return undefined;
      },
      shouldResume: shouldResume,
    });
    return (input: MultiStepInput) => inputBranch(input, state, step + 1);
  }

  async function inputBranch(
    input: MultiStepInput,
    state: Partial<State>,
    step: number
  ) {
    state.branch = await input.showInputBox({
      title,
      step: step,
      totalSteps: totalSteps,
      value: typeof state.branch === "string" ? state.branch : "",
      prompt: "GitHub branch (e.g. main)",
      validate: async (branch: string) => {
        await validationSleep();
        const branchNameErr = "GitHub branch name must not be blank";
        if (branch === "") return branchNameErr;

        return undefined;
      },
      shouldResume: shouldResume,
    });

    return (input: MultiStepInput) =>
      inputDockerfileLocation(input, state, step + 1);
  }

  async function inputDockerfileLocation(
    input: MultiStepInput,
    state: Partial<State>,
    step: number
  ) {
    state.dockerfileLocation = await input.showInputBox({
      title,
      step: step,
      totalSteps: totalSteps,
      value:
        typeof state.dockerfileLocation === "string"
          ? state.dockerfileLocation
          : "",
      prompt: "Path to folder with your Dockerfile (e.g. src/docker)",
      validate: async (file: string) => {
        await validationSleep();
        const errMsg = "Input must be an existing directory";
        const fullWsPath = path.join(wsPath, file);
        if (!fs.existsSync(fullWsPath)) return errMsg;
        if (!fs.lstatSync(fullWsPath).isDirectory()) return errMsg;

        return undefined;
      },
      shouldResume: shouldResume,
    });

    return (input: MultiStepInput) =>
      selectWorkflowType(input, state, step + 1);
  }

  // @ts-ignore recursive function
  async function selectWorkflowType(
    input: MultiStepInput,
    state: Partial<State>,
    step: number
  ) {
    const workflowTypes = [kubeWorkflowType, helmWorkflowType];
    const items: QuickPickItem[] = workflowTypes.map((label) => ({ label }));

    const pick = await input.showQuickPick({
      title,
      step: step,
      totalSteps: totalSteps,
      placeholder: "Workflow type",
      items: items,
      activeItem:
        typeof state.workflowType !== "string" ? state.workflowType : undefined,
      shouldResume: shouldResume,
    });

    state.workflowType = pick.label;

    if (state.workflowType === helmWorkflowType) {
      totalSteps = 10;
      return (input: MultiStepInput) => inputChartPath(input, state, step + 1);
    } else {
      return (input: MultiStepInput) => selectStrategy(input, state, step + 1);
    }
  }

  async function inputChartPath(
    input: MultiStepInput,
    state: Partial<State>,
    step: number
  ) {
    state.chartPath = await input.showInputBox({
      title,
      step: step,
      totalSteps: totalSteps,
      value: typeof state.chartPath === "string" ? state.chartPath : "",
      prompt: "Path to your Helm chart (e.g. src/chart.yaml)",
      validate: async (file: string) => {
        await validationSleep();
        const errMsg =
          "Input must be an existing YAML file (ending in .yml or .yaml)";
        const fullWsPath = path.join(wsPath, file);
        if (!fs.existsSync(fullWsPath)) return errMsg;
        if (!file.endsWith(".yaml") && !file.endsWith(".yml")) return errMsg;

        return undefined;
      },
      shouldResume: shouldResume,
    });

    return (input: MultiStepInput) =>
      inputChartOverridePath(input, state, step + 1);
  }

  async function inputChartOverridePath(
    input: MultiStepInput,
    state: Partial<State>,
    step: number
  ) {
    state.chartsOverridePaths = await input.showInputBox({
      title,
      step: step,
      totalSteps: totalSteps,
      value:
        typeof state.chartsOverridePaths === "string"
          ? state.chartsOverridePaths
          : "",
      prompt:
        "Optional: Helm override file paths separated by a space (e.g. src/a.yaml src/b.yaml)",
      validate: async (paths: string) => {
        await validationSleep();

        if (paths === "") return undefined;

        const errMsg =
          "All files in input must exist or be valid URLs (leave blank if none)";
        const files = paths.split(" ");
        var isValid = true;
        files.forEach((file) => {
          isValid =
            isValid &&
            (file.startsWith("http://") ||
              file.startsWith("https://") ||
              fs.existsSync(path.join(wsPath, file)));
        });
        if (!isValid) return errMsg;

        return undefined;
      },
      shouldResume: shouldResume,
    });
    return (input: MultiStepInput) =>
      inputChartOverrideValues(input, state, step + 1);
  }

  async function inputChartOverrideValues(
    input: MultiStepInput,
    state: Partial<State>,
    step: number
  ) {
    state.chartOverrideValues = await input.showInputBox({
      title,
      step: step,
      totalSteps: totalSteps,
      value:
        typeof state.chartOverrideValues === "string"
          ? state.chartOverrideValues
          : "",
      prompt:
        "Optional: Helm override value strings separated by a space (e.g. a=b c=d)",
      validate: async (values: string) => {
        await validationSleep();
        if (values === "") return undefined;
        var isValid = true;
        values.split(" ").forEach((value) => {
          isValid = isValid && value.split("=").length === 2;
        });
        const valuesErr = "Override values must be formatted as a=b c=d etc.";
        if (!isValid) return valuesErr;

        return undefined;
      },
      shouldResume: shouldResume,
    });
  }

  // @ts-ignore recursive function
  async function selectStrategy(
    input: MultiStepInput,
    state: Partial<State>,
    step: number
  ) {
    const strategies = [
      basicDeploymentStrategy,
      canaryDeploymentStrategy,
      bgDeploymentStrategy,
    ];
    const items: QuickPickItem[] = strategies.map((label) => ({ label }));

    const pick = await input.showQuickPick({
      title,
      step: step,
      totalSteps: totalSteps,
      placeholder: "Strategy",
      items: items,
      activeItem:
        typeof state.deploymentStrategy !== "string"
          ? state.deploymentStrategy
          : undefined,
      shouldResume: shouldResume,
    });

    state.deploymentStrategy = pick.label;

    return (input: MultiStepInput) =>
      inputManifestsLocation(input, state, step + 1);
  }

  async function inputManifestsLocation(
    input: MultiStepInput,
    state: Partial<State>,
    step: number
  ) {
    state.manifestsLocation = await input.showInputBox({
      title,
      step: step,
      totalSteps: totalSteps,
      value:
        typeof state.manifestsLocation === "string"
          ? state.manifestsLocation
          : "",
      prompt: "Folder with your deployment manifests (e.g. src/manifests)",
      validate: async (file: string) => {
        await validationSleep();
        const errMsg = "Input must be an existing directory";
        const fullWsPath = path.join(wsPath, file);
        if (!fs.existsSync(fullWsPath)) return errMsg;
        if (!fs.lstatSync(fullWsPath).isDirectory()) return errMsg;

        return undefined;
      },
      shouldResume: shouldResume,
    });
  }

  try {
    if (!vscode.workspace.workspaceFolders) {
      throw new Error(
        "unable to locate Workspace file system, please ensure you have your project open in VS Code"
      );
    }
    const state = await collectInputs();
    const resourceGroup = state.resourceGroup;
    const aksClusterName = state.aksClusterName;
    const containerRegistry = state.containerRegistry;
    const containerImageName = state.containerImageName;
    let deploymentStrategy = state.deploymentStrategy;
    const branch = state.branch;
    const manifestsLocation = state.manifestsLocation;
    const workflowType = state.workflowType;
    const dockerfileLocation = state.dockerfileLocation;

    var templateObj: any;
    var withValues: string;
    var helmCommand = "helm upgrade --wait -i";
    var comment = "";
    if (workflowType === helmWorkflowType) {
      deploymentStrategy = "helm";
      if (state.chartsOverridePaths !== "") {
        state.chartsOverridePaths.split(" ").forEach((arg) => {
          helmCommand += " -f " + arg + " ";
        });
      }
      if (state.chartOverrideValues !== "") {
        state.chartOverrideValues.split(" ").forEach((value) => {
          helmCommand += " --set " + value + " ";
        });
      }
      helmCommand += "automated-deployment " + state.chartPath;

      templateObj = wfTemplates.getHelmTemplate(
        containerRegistry,
        containerImageName,
        resourceGroup,
        aksClusterName,
        branch,
        helmCommand,
        dockerfileLocation
      );
    } else {
      if (
        deploymentStrategy === canaryDeploymentStrategy ||
        deploymentStrategy === bgDeploymentStrategy
      ) {
        comment =
          "# add a required approval to the promote environment https://docs.github.com/en/actions/managing-workflow-runs/reviewing-deployments \n";
        templateObj = wfTemplates.getBgcTemplate(
          containerRegistry,
          containerImageName,
          resourceGroup,
          aksClusterName,
          manifestsLocation,
          branch,
          dockerfileLocation,
          deploymentStrategy
        );
      } else {
        templateObj = wfTemplates.getBasicTemplate(
          containerRegistry,
          containerImageName,
          resourceGroup,
          aksClusterName,
          manifestsLocation,
          branch,
          dockerfileLocation
        );
      }
    }
    deploymentStrategy = deploymentStrategy.replace("/", "-");
    const asYaml = new yaml.Document();
    asYaml.contents = templateObj;
    asYaml.commentBefore = comment + wfTemplates.comment;
    const yamlString = asYaml.toString({ lineWidth: 0 });

    const outputFilename = `${deploymentStrategy}.yaml`;
    const outputFilepath = path.join(workflowPath, outputFilename);
    fs.writeFileSync(outputFilepath, yamlString);

    reporter.sendTelemetryEvent("generateworkflowResult", {
      generateworkflowResult: `${true}`,
    });

    window.showInformationMessage(
      `Generate Github Actions workflow succeeded - output to '${outputFilepath}'`
    );
  } catch (err) {
    reporter.sendTelemetryEvent("generateworkflowResult", {
      generateworkflowResult: `${err}`,
    });
    window.showInformationMessage(`Encountered error: '${err}'`);
  }
}

function getResourceGroups(): string[] {
  return ["resourceGroup1", "resourceGroup2", "resourceGroup3"];
}

function getAKSClusters(): string[] {
  return ["cluster1", "cluster2", "cluster3"];
}

function getContainerRegistries(): string[] {
  return ["registry1", "registry2", "registry3"];
}
