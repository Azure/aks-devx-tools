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
import {sleep} from '../../utils/sleep';
import {timeout} from '../../utils/timeout';

const EXTERNAL_IP_WAIT_MS = 4000;
const EXTERNAL_IP_WAIT_TIMEOUT_MS = 300_000; // 5 minutes

export async function runDeploy(
   {actionContext, extensionContext}: Context,
   completedSteps: CompletedSteps,
   outputChannel: IAzExtOutputChannel
) {
   if (!(completedSteps.draftDeployment || completedSteps.draftIngress)) {
      throw Error('Deploy can only be run after generating files with Draft');
   }

   const state: StateApi = State.construct(extensionContext);
   const format = state.getDeploymentFormat();
   const path = state.getDeploymentPath();
   const namespace = state.getNamespace();
   const applicationName = state.getApplicationName();
   if (format === undefined) {
      throw Error('Format is undefined');
   }
   if (path === undefined) {
      throw Error('Path is undefined');
   }
   if (namespace === undefined) {
      throw Error('Namespace is undefined');
   }
   if (applicationName === undefined) {
      throw Error('Application name is undefined');
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
            k8s.applyKustomize(path, namespace, applicationName)
         );
         break;
      case DraftFormat.Manifests:
         resp = await longRunning('Running Kubectl', () =>
            k8s.applyManifests(path, namespace, applicationName)
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

   outputChannel.appendLine('Waiting for external IP');
   const getExternalIp = async (): Promise<string> => {
      const fetchExternalIp = async (): Promise<string | undefined> => {
         const serviceResp = await k8s.getService(applicationName, namespace);
         if (failed(serviceResp)) {
            throw Error(serviceResp.error);
         }

         const service = serviceResp.result;
         const ingresses = service.status?.loadBalancer?.ingress;
         if (ingresses === undefined || ingresses.length === 0) {
            return undefined;
         }
         const ip = ingresses[0].ip;

         const ports = service.spec?.ports;
         if (ports === undefined || ports.length === 0) {
            throw Error('Port not defined');
         }
         const port = ports[0].port;

         return `${ip}:${port}`;
      };
      let externalIp = await fetchExternalIp();
      while (externalIp === undefined) {
         await sleep(EXTERNAL_IP_WAIT_MS);
         externalIp = await fetchExternalIp();
      }
      return externalIp;
   };
   const externalIp = await longRunning('Waiting for external IP', () =>
      timeout(EXTERNAL_IP_WAIT_TIMEOUT_MS, getExternalIp())
   ).catch((err) => {
      throw Error(`Failed to fetch external IP: ${err}`);
   });
   outputChannel.appendLine(`External IP ${externalIp} found`);

   const openExternalIpButton = 'Open External IP';
   vscode.window
      .showInformationMessage(`Deployed successfully`, openExternalIpButton)
      .then((input) => {
         if (input === openExternalIpButton) {
            vscode.commands.executeCommand(
               'vscode.open',
               vscode.Uri.parse(`http://${externalIp}`)
            );
         }
      });
}
