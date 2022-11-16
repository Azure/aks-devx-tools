import type {Run} from '@azure/arm-containerregistry';
import * as vscode from 'vscode';
import * as semver from 'semver';

const REQUIRED_VERSION = '^1.23.0';
enum RootStrategy {
   Default = 'Default',
   DockerfileFolder = 'DockerfileFolder'
}

function ensureDockerExtension() {
   const extension = vscode.extensions.getExtension(
      'ms-azuretools.vscode-docker'
   );
   if (!extension) {
      // this should never occur since it's an extension dependency
      throw Error('Docker extension not installed');
   }

   const version = semver.coerce(extension.packageJSON.version) || '';
   if (!semver.satisfies(version, REQUIRED_VERSION)) {
      // ideally would like them to prompt to install
      throw Error(`Docker extension version ${REQUIRED_VERSION} needed`);
   }
}

export async function buildAcrImage(
   dockerfile?: vscode.Uri | undefined
): Promise<Run | undefined> {
   ensureDockerExtension();

   return await vscode.commands.executeCommand(
      'vscode-docker.registries.azure.buildImage',
      dockerfile,
      RootStrategy.DockerfileFolder
   );
}
