import {KubeConfig, CoreV1Api, V1Namespace} from '@kubernetes/client-node';
import {ActionOnInvalid} from '@kubernetes/client-node/dist/config_types';
import {
   extension as kubernetesExtension,
   HelmV1,
   KubectlV1
} from 'vscode-kubernetes-tools-api';
import {Errorable, failed} from './errorable';
import {withTempFile} from './temp';

kubernetesExtension.kubectl.v1;

export interface KubernetesApi {
   listNamespaces(): Promise<Errorable<V1Namespace[]>>;
   createNamespace(name: string): Promise<Errorable<void>>;
   applyManifests(
      manifestPaths: string,
      namespace: string
   ): Promise<Errorable<string>>;
   applyKustomize(kustomizationDirectory: string): Promise<Errorable<string>>;
   installHelm(chartDirectory: string): Promise<Errorable<string>>;
}

export function getDefaultKubeconfig(): KubeConfig {
   const kc = new KubeConfig();
   try {
      kc.loadFromDefault({onInvalidEntry: ActionOnInvalid.FILTER});
   } catch (err) {
      throw Error(`Failed to load default Kubeconfig: ${err}`);
   }
   return kc;
}

export async function getKubectl(): Promise<Errorable<KubectlV1>> {
   const result = await kubernetesExtension.kubectl.v1;
   if (!result.available) {
      return {succeeded: false, error: 'Kubectl not available'};
   }

   return {succeeded: true, result: result.api};
}

export async function getHelm(): Promise<Errorable<HelmV1>> {
   const result = await kubernetesExtension.helm.v1;
   if (!result.available) {
      return {succeeded: false, error: 'Helm not available'};
   }

   return {succeeded: true, result: result.api};
}

export class Kubernetes implements KubernetesApi {
   constructor(
      private kubeconfig: KubeConfig,
      private kubectl: KubectlV1,
      private helm: HelmV1
   ) {}

   async listNamespaces(): Promise<Errorable<V1Namespace[]>> {
      const api = this.kubeconfig.makeApiClient(CoreV1Api);

      try {
         const {body} = await api.listNamespace();
         return {succeeded: true, result: body.items};
      } catch (error) {
         return {
            succeeded: false,
            error: `Failed to list namespaces: ${error}`
         };
      }
   }

   async createNamespace(name: string): Promise<Errorable<void>> {
      const api = this.kubeconfig.makeApiClient(CoreV1Api);

      try {
         await api.createNamespace({metadata: {name}});
         return {succeeded: true, result: undefined};
      } catch (error) {
         return {
            succeeded: false,
            error: `Failed to create namespace "${name}": ${error}`
         };
      }
   }

   async applyManifests(
      manifestPath: string,
      namespace: string
   ): Promise<Errorable<string>> {
      const command = `apply -f "${manifestPath}"`;
      const invokeResp = await this.invokeKubectl(command);
      if (failed(invokeResp)) {
         return invokeResp;
      }

      const waitResp = await this.waitManifests(manifestPath, namespace);
      if (failed(waitResp)) {
         return {
            error: `${invokeResp.result}\n${waitResp.error}`,
            succeeded: false
         };
      }

      return {
         succeeded: true,
         result: `${invokeResp.result}\n${waitResp.result}`
      };
   }

   private async waitManifests(
      manifestsPath: string,
      namespace: string
   ): Promise<Errorable<string>> {
      const command = `wait --for=condition=Ready -f "${manifestsPath}" -R --namespace ${namespace}`;
      return await this.invokeKubectl(command);
   }

   async applyKustomize(
      kustomizationDirectory: string
   ): Promise<Errorable<string>> {
      const command = `apply -k "${kustomizationDirectory}"`;
      return await this.invokeKubectl(command);
   }

   async installHelm(chartDirectory: string): Promise<Errorable<string>> {
      const command = `install "${chartDirectory}" --generate-name --wait --timeout 3m`;
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
