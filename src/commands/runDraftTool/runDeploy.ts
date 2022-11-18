import {Errorable, failed} from '../../utils/errorable';
import {
   getDefaultKubeconfig,
   getHelm,
   getKubectl,
   Kubernetes,
   KubernetesApi
} from '../../utils/kubernetes';
import {StateApi, State} from '../../utils/state';
import {Context} from './model/context';
import {DraftFormat} from './model/format';
import {CompletedSteps} from './model/guidedExperience';
import * as vscode from 'vscode';
import {IAzExtOutputChannel} from '@microsoft/vscode-azext-utils';
import {longRunning} from '../../utils/host';

export async function runDeploy(
   {actionContext, extensionContext}: Context,
   completedSteps: CompletedSteps,
   outputChannel: IAzExtOutputChannel
) {
   if (!completedSteps.draftDeployment) {
      throw Error(
         'Deploy can only be run after Drafting Kubernetes Deployments and Services'
      );
   }

   const state: StateApi = State.construct(extensionContext);
   const format = state.getDeploymentFormat();
   const path = state.getDeploymentPath();
   const namespace = state.getNamespace();
   if (format === undefined) {
      throw Error('Format is undefined');
   }
   if (path === undefined) {
      throw Error('Path is undefined');
   }
   if (namespace === undefined) {
      throw Error('Namespace is undefined');
   }

   const kubeconfig = getDefaultKubeconfig();
   const kubectlReturn = await getKubectl();
   if (failed(kubectlReturn)) {
      throw Error(kubectlReturn.error);
   }
   const helmReturn = await getHelm();
   if (failed(helmReturn)) {
      throw Error(helmReturn.error);
   }
   const k8s: KubernetesApi = new Kubernetes(
      kubeconfig,
      kubectlReturn.result,
      helmReturn.result
   );

   const draftFormat = <DraftFormat>format;
   outputChannel.appendLine(
      `Running deploy for format ${draftFormat} on path ${path}`
   );
   let resp: Errorable<string>;
   switch (draftFormat) {
      case DraftFormat.Helm:
         resp = await longRunning('Running Helm', () => k8s.installHelm(path));
         break;
      case DraftFormat.Kustomize:
         resp = await longRunning('Running Kustomize', () =>
            k8s.applyKustomize(path, namespace)
         );
         break;
      case DraftFormat.Manifests:
         resp = await longRunning('Running Kubectl', () =>
            k8s.applyManifests(path, namespace)
         );
         break;
      default:
         throw Error(`Format '${draftFormat}' not recognized`);
   }

   outputChannel.show();
   if (failed(resp)) {
      outputChannel.appendLine(resp.error);
      throw Error(`Failed to deploy`);
   }
   outputChannel.appendLine(resp.result);

   outputChannel.appendLine('Deployed successfully');
   vscode.window.showInformationMessage(`Deployed successfully`);

   // show external IP link if one exists after web app routing is complete

   // is your cluster attached to your acr?
   // if no, attach it
}
