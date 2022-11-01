import {KubeConfig, CoreV1Api, V1Namespace} from '@kubernetes/client-node';
import {
   extension as kubernetesExtension,
   HelmV1,
   KubectlV1
} from 'vscode-kubernetes-tools-api';
import {Errorable} from './errorable';
import {withTempFile} from './temp';

kubernetesExtension.kubectl.v1;

export interface KubernetesApi {}

export function getDefaultKubeconfig(): KubeConfig {
   const kc = new KubeConfig();
   kc.loadFromDefault();
   return kc;
}

export class Kubernetes implements KubernetesApi {
   constructor(
      private kubeconfig: KubeConfig,
      private kubectl: KubectlV1,
      private helm: HelmV1
   ) {}

   async listNamespaces(): Promise<V1Namespace[]> {
      const api = this.kubeconfig.makeApiClient(CoreV1Api);
      const {body} = await api.listNamespace();
      return body.items;
   }

   async createNamespace(name: string) {
      const api = this.kubeconfig.makeApiClient(CoreV1Api);
      await api.createNamespace({metadata: {name}});
   }

   async applyManifests(manifestPaths: string[]): Promise<Errorable<string>> {
      const command = `apply -f ${manifestPaths.join(' ')}`;
      return await this.invokeKubectl(command);
   }

   async applyKustomize(
      kustomizationDirectory: string
   ): Promise<Errorable<string>> {
      const command = `apply -k ${kustomizationDirectory}`;
      return await this.invokeKubectl(command);
   }

   async deployHelm(chartDirectory: string): Promise<Errorable<string>> {
      const command = `install ${chartDirectory} --generate-name`;
      return await this.invokeHelm(command);
   }

   // this should only be used when the JavaScript Kubernetes client doesn't support something
   private async invokeKubectl(command: string): Promise<Errorable<string>> {
      return withTempFile(
         this.kubeconfig.exportConfig(),
         async (kubeconfigPath) => {
            const result = await this.kubectl.invokeCommand(
               `${command} --kubeconfig="${kubeconfigPath}"`
            );
            if (result === undefined) {
               return {
                  succeeded: false,
                  error: `Kubectl command '${command}' failed to run`
               };
            }

            if (result.code !== 0) {
               return {
                  succeeded: false,
                  error: `Kubectl command '${command}' failed with exit code ${result.code} and error '${result.stderr}'`
               };
            }

            return {succeeded: true, result: result.stdout};
         }
      );
   }

   private async invokeHelm(command: string): Promise<Errorable<string>> {
      return withTempFile(
         this.kubeconfig.exportConfig(),
         async (kubeconfigPath) => {
            const result = await this.helm.invokeCommand(
               `${command} --kubeconfig="${kubeconfigPath}"`
            );
            if (result === undefined) {
               return {
                  succeeded: false,
                  error: `Helm command '${command}' failed to run`
               };
            }

            if (result.code !== 0) {
               return {
                  succeeded: false,
                  error: `Helm command '${command}' failed with exit code ${result.code} and error '${result.stderr}'`
               };
            }

            return {succeeded: true, result: result.stdout};
         }
      );
   }
}
