import * as vscode from 'vscode';
import { longRunning } from './../../utils/host';
import { ensureDraftBinary } from './helper/runDraftHelper';
import { QuickPickItem, window, ExtensionContext } from 'vscode';
import { buildCreateCommand, buildCreateConfig } from './helper/draftCommandBuilder';
import { runDraftCommand } from './helper/runDraftHelper';
import { reporter } from './../../utils/reporter';
import { MultiStepInput, validationSleep, shouldResume } from './model/multiStep';
import * as fs from 'fs';
import * as path from 'path';
import linguist = require('linguist-js');
import { validatePort } from '../../utils/validation';
import { Errorable, failed } from '../../utils/errorable';
import { Context, ContextApi } from '../../utils/context';

export default async function runDraftDockerfile(
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
    const title = 'Draft a Dockerfile from source code';
    const languages = ['clojure', 'c#', 'erlang', 'go', 'gomodule', "java", "gradle", "javascript", "php", "python", "rust", "swift"];
	const languageLabels: QuickPickItem[] = languages.map(label => ({ label }));

	interface State {
		title: string;
		step: number;
		totalSteps: number;
        language: string;
        portNumber: string;
        sourceFolder: string;
        version: string;
		runtime: QuickPickItem;
	}

	async function collectInputs() {
		const state = {
            sourceFolder: destination, 
            portNumber: `80`,
        } as Partial<State>;
		await MultiStepInput.run(input => inputSourceCodeFolder(input, state, 1));
		return state as State;
	}

    const totalSteps = 4;
    async function inputSourceCodeFolder(input: MultiStepInput, state: Partial<State>, step: number) {
		state.sourceFolder = await input.showInputBox({
			title,
			step: step,
			totalSteps: totalSteps,
			value: typeof state.sourceFolder === 'string' ? state.sourceFolder : '',
			prompt: 'Folder with your source code (e.g. ./src)',
            validate: async (file: string) => {
                await validationSleep();
                const errMsg = "Input must be an existing directory";

                if (!fs.existsSync(file)) {return errMsg;}
                if (!fs.lstatSync(file).isDirectory()) {return errMsg;}

                return undefined;
            },
			shouldResume: shouldResume
		});
        return (input: MultiStepInput) => selectLanguage(input, state, step + 1);
	}

    // @ts-ignore recursive function
	async function selectLanguage(input: MultiStepInput, state: Partial<State>, step: number) {
        async function guessLanguage(): Promise<Errorable<string>> {
            const results = (await linguist(state.sourceFolder, { keepVendored: false, quick: true })).languages.results;
            const topLanguage = Object.keys(results).reduce((prev, key) => {
                if (prev === "") {return key;};

                const prevVal = results[prev].bytes;
                const currVal = results[key].bytes;
                return prevVal > currVal ? prev : key;
            }, "");

            // convert to expected language form
            // https://github.com/github/linguist/blob/master/lib/linguist/languages.yml for keys
            const convert: {[key: string]: string} = {
                "Clojure": "clojure",
                "C#": "c#",
                "Erlang": "erlang",
                "Go": "go",
                "Java": "java",
                "Gradle": "gradle",
                "TypeScript": "javascript",
                "JavaScript": "javascript",
                "PHP": "php",
                "Python": "python",
                "Rust": "rust",
                "Swift": "swift"
            };

            const converted = topLanguage in convert ? convert[topLanguage] : "";
            if (!languages.includes(converted)) return { succeeded: false, error: "failed to detect language" };

            return { succeeded: true, result: converted };
        };

        const autoDetectLabel = "Auto-detect";
        const items = [{label: autoDetectLabel}, ...languageLabels];

		const pick = await input.showQuickPick({
			title,
			step: step,
			totalSteps: totalSteps,
			placeholder: 'Select the programming language',
			items: items,
			activeItem: typeof state.language !== 'string' ? state.language : undefined,
			shouldResume: shouldResume
		});

        if (pick.label === autoDetectLabel) {
            const guessResult = await input.wait(() => guessLanguage());
            if (failed(guessResult)) {
                window.showErrorMessage("Language can't be auto-detected");
                // @ts-ignore recursive function
                return (input: MultiStepInput) => selectLanguage(input, state, step);
            }

            const guess = guessResult.result;
            state.language = guess;
        } else {
		    state.language = pick.label;
        }

        return (input: MultiStepInput) => inputVersion(input, state, step + 1);
	}

    async function inputVersion(input: MultiStepInput, state: Partial<State>, step: number) {
        const versions : {[key: string]: string[]} = {
            "clojure": ["8-jdk-alpine"],
            "c#": ["6.0","5.0","4.0","3.1"],
            "erlang": ["3.15"],
            "go": ["1.19","1.18","1.17","1.16"],
            "java": ["11-jre-slim"],
            "gradle": ["11-jre-slim"],
            "javascript": ["14.15.4", "12.16.3", "10.16.3"],
            "php": ["7.4-apache", "7.4-fpm", "7.4-cli", "7.3-apache", "7.3-fpm", "7.3-cli", "7.2-apache", "7.2-fpm", "7.2-cli",],
            "python": ["3.8", "3.7", "3.6"],
            "rust": ["1.42.0"],
            "swift": ["5.5","5.4","5.3","5.2"]
        };
        const selectedLanguage = state.language as string;
        const defaultVersion = versions[selectedLanguage][0];
        const items = versions[selectedLanguage].map((version) => {return {label: version};});
        items.push({label: "Custom"});
        
        state.version = defaultVersion;
        const pick = await input.showQuickPick({
			title,
			step: step,
			totalSteps: totalSteps,
			placeholder: `Select ${state.language} version`,
			items: items,
			activeItem: typeof state.version !== 'string' ? state.version : undefined,
			shouldResume: shouldResume
		});
        
        if (pick.label === "Custom") {
            state.version= await input.showInputBox({
                title,
                step: step,
                totalSteps: totalSteps,
                value: typeof state.version === 'string' ? state.version: '',
                prompt: `Enter a custom version of ${state.language}`,
                validate: async () => undefined,
                shouldResume: shouldResume
            });
        }else{
            state.version = pick.label;
        }

        return (input: MultiStepInput) => inputPortNumber(input, state, step + 1);
    }

    async function inputPortNumber(input: MultiStepInput, state: Partial<State>, step: number) {
		state.portNumber = await input.showInputBox({
			title,
			step: step,
			totalSteps: totalSteps,
			value: typeof state.portNumber === 'string' ? state.portNumber : '',
			prompt: 'Port (e.g.8080)',
			validate: validatePort,
			shouldResume: shouldResume
		});
	}

	const state = await collectInputs();
    const source = state.sourceFolder;
    const language = state.language;
    const version = state.version;
    const port = state.portNumber;

    const configPath = buildCreateConfig(language, port, "", "", version);
    const command = buildCreateCommand(source, "dockerfile", configPath);

    const [success, err] = await runDraftCommand(command);
    const isSuccess = err?.length === 0 && success?.length !== 0;
    if (reporter) {
      reporter.sendTelemetryEvent("dockerfileDraftResult", { dockerfileDraftResult: `${isSuccess}` });
    }

    if (isSuccess) {
        const ctx: ContextApi = new Context(context);
        ctx.setPort(port);

        const buildContainer = "Build container";
        const outputPath = path.join(source, "Dockerfile");
        const vsPath = vscode.Uri.file(outputPath);
        vscode.workspace.openTextDocument(vsPath).then(doc => vscode.window.showTextDocument(doc));
	    window.showInformationMessage(`Draft Dockerfile Succeeded`, buildContainer)
            .then(option => {
                if (option === buildContainer) {
                    vscode.commands.executeCommand("aks-draft-extension.runBuildContainer");
                }
            });
    } else {
        window.showErrorMessage(`Draft Dockerfile Failed - '${err}'`);
    }
}
