import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as download from '../../../component/download';
import {baseInstallFolder} from '../../../utils/commandHelper';
import * as path from 'path';
import {combine, Errorable, failed, succeeded} from '../../../utils/errorable';
import {shell} from '../../../utils/shell';
import {DraftConfig} from '../model/DraftConfig';

async function getLatestDraftReleaseTag() {
   const draftConfig = getDraftConfig();
   if (failed(draftConfig)) {
      vscode.window.showErrorMessage(draftConfig.error);
      return undefined;
   }

   return draftConfig.result.releaseTag;
}

function checkIfDraftBinaryExist(destinationFile: string): boolean {
   return fs.existsSync(destinationFile);
}

export async function ensureDraftBinary(): Promise<Errorable<null>> {
   // 0. Get latest release tag.
   // 1: check if file already exist.
   // 2: if not Download latest.
   const latestReleaseTag = await getLatestDraftReleaseTag();

   if (!latestReleaseTag) {
      return {
         succeeded: false,
         error: `failed to get latest release tag`
      };
   }

   const draftBinaryFile = getBinaryFileName();

   // example latest release location: https://github.com/Azure/draft/releases/tag/v0.0.20
   // Note: We need to carefully revisit this, because the way release files are named vs how frequent release will be.
   // How do we know that the existing binary is latest or not?
   let destinationFile = path.join(
      baseInstallFolder(),
      latestReleaseTag,
      draftBinaryFile
   );
   if (shell.isWindows()) {
      destinationFile = `${destinationFile}.exe`;
   }

   if (checkIfDraftBinaryExist(destinationFile)) {
      return {succeeded: true, result: null};
   }

   const draftDownloadUrl = `https://github.com/Azure/draft/releases/download/${latestReleaseTag}/${draftBinaryFile}`;
   const downloadResult = await download.once(
      draftDownloadUrl,
      destinationFile
   );

   if (failed(downloadResult)) {
      return {
         succeeded: false,
         error: `Failed to download draft binary: ${downloadResult.error[0]}`
      };
   }
   //If linux check -- make chmod 0755
   fs.chmodSync(destinationFile, '0755');
   return {
      succeeded: true,
      result: null
   };
}

function getBinaryFileName() {
   let architecture = os.arch();
   let operatingSystem = os.platform().toLocaleLowerCase();

   if (architecture === 'x64') {
      architecture = 'amd64';
   }
   let draftBinaryFile = `draft-${operatingSystem}-${architecture}`;

   if (operatingSystem === 'win32') {
      operatingSystem = 'windows';
      // Draft release v0.0.22 the file name has exe associated with it.
      draftBinaryFile = `draft-${operatingSystem}-${architecture}.exe`;
   }

   return draftBinaryFile;
}

export async function runDraftCommand(
   command: string
): Promise<[string, string]> {
   const latestReleaseTag = await getLatestDraftReleaseTag();
   if (!latestReleaseTag) {
      return ['', ''];
   }
   const draftBinaryFile = getBinaryFileName();
   const destinationBinaryFile = path.join(
      baseInstallFolder(),
      latestReleaseTag,
      draftBinaryFile
   );
   const runCommandOutput = await shell.exec(
      `${destinationBinaryFile} ${command}`
   );

   if (failed(runCommandOutput)) {
      return ['', ''];
   }

   return [runCommandOutput.result.stdout, runCommandOutput.result.stderr];
}

export function getDraftConfig(): Errorable<DraftConfig> {
   const draftConfig = vscode.workspace.getConfiguration('aks.draft');
   const props = combine([getConfigValue(draftConfig, 'releaseTag')]);

   if (failed(props)) {
      return {
         succeeded: false,
         error: `Failed to read aks.draft configuration: ${props.error}`
      };
   }

   const config = {
      releaseTag: props.result[0]
   };

   return {succeeded: true, result: config};
}

function getConfigValue(
   config: vscode.WorkspaceConfiguration,
   key: string
): Errorable<string> {
   const value = config.get(key);
   if (value === undefined) {
      return {succeeded: false, error: `${key} not defined.`};
   }
   const result = value as string;
   if (result === undefined) {
      return {
         succeeded: false,
         error: `${key} value has type: ${typeof value}; expected string.`
      };
   }
   return {succeeded: true, result: result};
}
