import * as vscode from "vscode";
import { longRunning } from "./../../utils/host";
import { downloadDraftBinary } from "./helper/runDraftHelper";
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
import * as fs from "fs";
import * as path from "path";
import linguist = require("linguist-js");

export default async function runDraftDockerfile(
  _context: vscode.ExtensionContext,
  destination: string
): Promise<void> {
  const downloadResult = await longRunning(`Downloading Draft.`, () =>
    downloadDraftBinary()
  );
  if (!downloadResult) {
    return undefined;
  }

  multiStepInput(_context, destination);
}

async function multiStepInput(context: ExtensionContext, destination: string) {
  const title = "Draft a Dockerfile from source code";
  const languages = [
    "clojure",
    "c#",
    "erlang",
    "go",
    "gomodule",
    "java",
    "gradle",
    "javascript",
    "php",
    "python",
    "rust",
    "swift",
  ];
  const languageLabels: QuickPickItem[] = languages.map((label) => ({ label }));

  interface State {
    title: string;
    step: number;
    totalSteps: number;
    language: string;
    portNumber: string;
    outputFile: string;
    sourceFolder: string;
    version: string;
    runtime: QuickPickItem;
  }

  async function collectInputs() {
    const state = { sourceFolder: destination } as Partial<State>;
    await MultiStepInput.run((input) => inputSourceCodeFolder(input, state, 1));
    return state as State;
  }

  const totalSteps = 5;
  async function inputSourceCodeFolder(
    input: MultiStepInput,
    state: Partial<State>,
    step: number
  ) {
    state.sourceFolder = await input.showInputBox({
      title,
      step: step,
      totalSteps: totalSteps,
      value: typeof state.sourceFolder === "string" ? state.sourceFolder : "",
      prompt: "Folder with your source code e.g. ./src)",
      validate: async (file: string) => {
        await validationSleep();
        const errMsg = "Input must be an existing directory";

        if (!fs.existsSync(file)) return errMsg;
        if (!fs.lstatSync(file).isDirectory()) return errMsg;

        return undefined;
      },
      shouldResume: shouldResume,
    });
    return (input: MultiStepInput) => inputOutputFile(input, state, step + 1);
  }

  async function inputOutputFile(
    input: MultiStepInput,
    state: Partial<State>,
    step: number
  ) {
    state.outputFile = await input.showInputBox({
      title,
      step: step,
      totalSteps: totalSteps,
      value: typeof state.outputFile === "string" ? state.outputFile : "",
      prompt: "Output file destination (e.g. ./Dockerfile)",
      validate: async (path: string) => {
        await validationSleep();
        const pathErr = "Destination must be a valid file path";
        if (path === "") return pathErr;

        return undefined;
      },
      shouldResume: shouldResume,
    });
    return (input: MultiStepInput) => selectLanguage(input, state, step + 1);
  }

  // @ts-ignore recursive function
  async function selectLanguage(
    input: MultiStepInput,
    state: Partial<State>,
    step: number
  ) {
    const guessLanguage = async () => {
      const results = (
        await linguist(state.sourceFolder, { keepVendored: false, quick: true })
      ).languages.results;
      const topLanguage = Object.keys(results).reduce((prev, key) => {
        if (prev === "") return key;

        const prevVal = results[prev].bytes;
        const currVal = results[key].bytes;
        return prevVal > currVal ? prev : key;
      }, "");

      // convert to expected language form
      // https://github.com/github/linguist/blob/master/lib/linguist/languages.yml for keys
      const convert: { [key: string]: string } = {
        Clojure: "clojure",
        "C#": "c#",
        Erlang: "erlang",
        Go: "go",
        Java: "java",
        Gradle: "gradle",
        TypeScript: "javascript",
        JavaScript: "javascript",
        PHP: "php",
        Python: "python",
        Rust: "rust",
        Swift: "swift",
      };

      const converted = topLanguage in convert ? convert[topLanguage] : "";
      return languages.includes(converted) ? converted : undefined;
    };

    const autoDetectLabel = "Auto-detect";
    const items = [{ label: autoDetectLabel }, ...languageLabels];

    const pick = await input.showQuickPick({
      title,
      step: step,
      totalSteps: totalSteps,
      placeholder: "Select the programming language",
      items: items,
      activeItem:
        typeof state.language !== "string" ? state.language : undefined,
      shouldResume: shouldResume,
    });

    if (pick.label === autoDetectLabel) {
      const guess = await guessLanguage();
      console.log(guess);
      if (guess === undefined) {
        window.showErrorMessage("Language can't be auto-detected");
        // @ts-ignore recursive function
        return (input: MultiStepInput) => selectLanguage(input, state, step);
      }
      state.language = guess;
    } else {
      state.language = pick.label;
    }

    return (input: MultiStepInput) => inputVersion(input, state, step + 1);
  }

  async function inputVersion(
    input: MultiStepInput,
    state: Partial<State>,
    step: number
  ) {
    if (state.language === "c#") {
      state.version = await input.showInputBox({
        title,
        step: step,
        totalSteps: totalSteps,
        value: typeof state.version === "string" ? state.version : "",
        prompt: `Version of ${state.language}`,
        validate: async () => undefined,
        shouldResume: shouldResume,
      });
    }

    return (input: MultiStepInput) => inputPortNumber(input, state, step + 1);
  }

  async function inputPortNumber(
    input: MultiStepInput,
    state: Partial<State>,
    step: number
  ) {
    state.portNumber = await input.showInputBox({
      title,
      step: step,
      totalSteps: totalSteps,
      value: typeof state.portNumber === "string" ? state.portNumber : "",
      prompt: "Port (e.g.8080)",
      validate: validatePort,
      shouldResume: shouldResume,
    });
  }

  const state = await collectInputs();
  const source = state.sourceFolder;
  const output = state.outputFile; // TODO: make output actually do something or remove
  const language = state.language;
  const dotnetVersion = state.version;
  const port = state.portNumber;

  const configPath = buildCreateConfig(language, port, "", "", dotnetVersion);
  const command = buildCreateCommand(source, "dockerfile", configPath);

  const [success, err] = await runDraftCommand(command);
  const isSuccess = err?.length === 0 && success?.length !== 0;
  if (reporter) {
    reporter.sendTelemetryEvent("dockerfileDraftResult", {
      dockerfileDraftResult: `${isSuccess}`,
    });
  }

  const outputPath = path.join(source, "Dockerfile");
  if (isSuccess) {
    window.showInformationMessage(
      `Draft Dockerfile Succeeded - Output to '${outputPath}'`
    );
  } else {
    window.showErrorMessage(`Draft Dockerfile Failed - ${err}`);
  }
}

async function validatePort(port: string) {
  await validationSleep();

  const portNum = parseInt(port);
  const portMin = 1;
  const portMax = 65535;
  const portErr = `Port must be in range ${portMin} to ${portMax}`;

  if (Number.isNaN(portNum)) return portErr;
  if (portNum < portMin) return portErr;
  if (portNum > portMax) return portErr;

  return undefined;
}
