import {KubeConfig, CoreV1Api, V1Namespace} from '@kubernetes/client-node';

export interface KubernetesApi {}

export class Kubernetes implements KubernetesApi {
   private getKubeconfig(): KubeConfig {
      const kc = new KubeConfig();
      kc.loadFromDefault();
      return kc;
   }

   async listNamespaces(): Promise<V1Namespace[]> {
      const kc = this.getKubeconfig();
      const api = kc.makeApiClient(CoreV1Api);
      const {body} = await api.listNamespace();
      return body.items;
   }

   async createNamespace(name: string) {
      const kc = this.getKubeconfig();
      const api = kc.makeApiClient(CoreV1Api);
      await api.createNamespace({metadata: {name}});
   }

   async deployManifests() {}

   async deployHelm() {}

   async deployKustomize() {}
}
