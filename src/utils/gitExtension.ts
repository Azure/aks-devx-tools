import * as vscode from 'vscode';
import * as semver from 'semver';
import {API, GitExtension, Ref, Repository} from './git';

function getGitExtensionAPI(): API {
   try {
      return (<GitExtension>(
         vscode.extensions.getExtension('vscode.git')!.exports
      )).getAPI(1);
   } catch (error) {
      console.error('error getting git extension', error);
      throw Error('Git extension is disabled or not found');
   }
}

export async function getBranches(repository: vscode.Uri): Promise<Ref[]> {
   const gitAPI = getGitExtensionAPI();
   const repo = gitAPI.getRepository(repository);
   if (repo === null) {
      throw Error('Repo is null');
   }

   return await repo.getBranches({
      remote: true
   });
}

export async function getRemotes(repository: vscode.Uri): Promise<Ref[]> {
   const gitAPI = getGitExtensionAPI();
   const repo = gitAPI.getRepository(repository);
   if (repo === null) {
      throw Error('Repo is null');
   }

   return await repo.getBranches({
      remote: true
   });
}
