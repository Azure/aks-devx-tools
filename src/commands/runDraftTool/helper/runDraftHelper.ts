import * as vscode from 'vscode';
import { InstallationResponse } from '../model/installationResponse';
import { getRenderedContent, getResourceUri } from '../../../utils/webview';
import * as fs from 'fs';
import fetch from 'node-fetch';
import * as os from "os";
import * as download from '../../../component/download';
import { baseInstallFolder } from '../../../utils/commandHelper';
import * as path from 'path';
import { combine, Errorable, failed, succeeded } from '../../../utils/errorable';
import { shell } from '../../../utils/shell';
import internal = require('stream');
import { DraftConfig } from '../model/DraftConfig';

interface InstallResult {
    succeeded?: boolean;
    mainMessage?: string;
    output?: string;
    logs?: LogSection[];
}

interface LogSection {
    title?: string;
    messages?: string;
}

export function createDraftWebView(
    command: string,
    webview: vscode.Webview,
    extensionPath: string,
    installationResponse: InstallationResponse,
    getUserInput = false
) {
    // For the case of successful run of the tool we render webview with the output information.
    webview.html = getWebviewContent(
        command,
        installationResponse.name,
        extensionPath,
        installationResponse,
        getUserInput);
}

function getWebviewContent(
    command: string,
    clustername: string,
    aksExtensionPath: string,
    installationResponse: InstallationResponse,
    getUserInput: boolean
): string {
    const styleUri = getResourceUri(aksExtensionPath, 'rundrafttool', 'draft_style.css');
    const templateUri = getResourceUri(aksExtensionPath, 'rundrafttool', `draft_${command}.html`);

    const installHtmlResult = getOrganisedInstallResult(clustername, installationResponse);
    const data = {
        cssuri: styleUri,
        name: clustername,
        mainMessage: installHtmlResult.mainMessage,
        resultLogs: installHtmlResult.logs,
        isSuccess: installHtmlResult.succeeded,
        output: installHtmlResult.output,
        getUserInput: getUserInput
    };

    return getRenderedContent(templateUri, data);
}

function getOrganisedInstallResult(
    clustername: string,
    installationResponse: InstallationResponse
) {
    const stdout = installationResponse.stdout || '';
    const stderr = installationResponse.stderr || '';
    const succeeded = stderr?.length === 0 && stdout?.length !== 0;
    const output = succeeded ? stdout : stderr;

    let logs: LogSection[] = [];
    const mainMessage = succeeded ? 'Draft was executed successfully!' : 'Draft was not executed successfully.';
    const logsText = output?.split('\n');
    for (let i = 0; i < logsText.length; i++) {
        if (logsText[i].length > 0) {
            const log: LogSection = { messages: logsText[i] };
            logs.push(log);    
        }
    }

    const installResults: InstallResult = {
        mainMessage: mainMessage,
        logs: logs,
        succeeded: succeeded,
        output
    };

    return installResults;
}

async function getLatestDraftReleaseTag() {
    const draftConfig = getDraftConfig();
    if (failed(draftConfig)) {
        vscode.window.showErrorMessage(draftConfig.error);
        return undefined;
    }

    return draftConfig.result.releaseTag;
}

function checkIfDraftBinaryExist(destinationFile: string) : boolean {
    return fs.existsSync(destinationFile);
}

export async function downloadDraftBinary() {
    // 0. Get latest release tag.
    // 1: check if file already exist.
    // 2: if not Download latest.
    const latestReleaseTag = await getLatestDraftReleaseTag();

    if (!latestReleaseTag) {
        return;
    }

    const draftBinaryFile = getBinaryFileName();

    // example latest release location: https://github.com/Azure/draft/releases/tag/v0.0.20
    // Note: We need to carefully revisit this, because the way release files are named vs how frequent release will be.
    // How do we know that the existing binary is latest or not?
    let destinationFile = path.join(baseInstallFolder(), latestReleaseTag, draftBinaryFile);
    if (shell.isWindows()) {
        destinationFile = `${destinationFile}.exe`;
    }

    if (checkIfDraftBinaryExist(destinationFile)) {
        return { succeeded: true };
    }

    const draftDownloadUrl = `https://github.com/Azure/draft/releases/download/${latestReleaseTag}/${draftBinaryFile}`;
    const downloadResult = await download.once(draftDownloadUrl, destinationFile);

    if (failed(downloadResult)) {
        return { succeeded: false, error: [`Failed to download draft binary: ${downloadResult.error[0]}`] };
    }
    //If linux check -- make chmod 0755 
    fs.chmodSync(destinationFile, "0755");
    return succeeded(downloadResult);
}

function getBinaryFileName() {
    let architecture = os.arch();
    let operatingSystem = os.platform().toLocaleLowerCase();

    if (architecture === 'x64') {
        architecture = 'amd64';
    }

    if (operatingSystem === 'win32') {
        operatingSystem = 'windows';
    }

    const draftBinaryFile = `draft-${operatingSystem}-${architecture}`;
    return draftBinaryFile;
}

export async function runDraftCommand(
    command: string
) : Promise<[string, string]> {
    const latestReleaseTag = await getLatestDraftReleaseTag();
    if (!latestReleaseTag) {
        return [ "", ""];
    }
    const draftBinaryFile = getBinaryFileName();
    const destinationBinaryFile = path.join(baseInstallFolder(), latestReleaseTag, draftBinaryFile);
    const runCommandOutput = await shell.exec(`${destinationBinaryFile} ${command}`);

    if (failed(runCommandOutput)) {
        return[ "", ""];
    }

    return [runCommandOutput.result.stdout, runCommandOutput.result.stderr];
}

export function getDraftConfig(): Errorable<DraftConfig> {
    const periscopeConfig = vscode.workspace.getConfiguration('aks.draft');
    const props = combine([
        getConfigValue(periscopeConfig, 'releaseTag')
    ]);

    if (failed(props)) {
        return { succeeded: false, error: `Failed to read aks.draft configuration: ${props.error}` };
    }

    const config = {
        releaseTag: props.result[0]
    }

    return { succeeded: true, result: config };
}

function getConfigValue(config: vscode.WorkspaceConfiguration, key: string): Errorable<string> {
    const value = config.get(key);
    if (value === undefined) {
        return { succeeded: false, error: `${key} not defined.` }
    }
    const result = value as string;
    if (result === undefined) {
        return { succeeded: false, error: `${key} value has type: ${typeof value}; expected string.` }
    }
    return { succeeded: true, result: result };
}
