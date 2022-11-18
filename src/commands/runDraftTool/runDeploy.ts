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

export async function runDeploy(
   {actionContext, extensionContext}: Context,
   completedSteps: CompletedSteps
) {
   if (!completedSteps.draftDeployment) {
      throw Error(
         'Deploy can only be run after Drafting Kubernetes Deployments and Services'
      );
   }

   const state: StateApi = State.construct(extensionContext);
   const format = state.getDeploymentFormat();
   const path = state.getDeploymentPath();
   if (format === undefined) {
      throw Error('Format is undefined');
   }
   if (path === undefined) {
      throw Error('Path is undefined');
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
   let resp: Errorable<string>;
   switch (draftFormat) {
      case DraftFormat.Helm:
         resp = await k8s.installHelm(path);
         break;
      case DraftFormat.Kustomize:
         resp = await k8s.applyKustomize(path);
         break;
      case DraftFormat.Manifests:
         resp = await k8s.applyManifests([path]);
         break;
      default:
         throw Error(`Format '${draftFormat}' not recognized`);
   }

   if (failed(resp)) {
      throw Error(`Failed to deploy: ${resp.error}`);
   }

   vscode.window.showInformationMessage(
      `Deployed successfully: ${resp.result}`
   );
   // show service link if one exists

   // is your cluster attached to your acr?
   // if no, attach it
}
