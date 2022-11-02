import {CoreV1Api, KubeConfig, V1NamespaceList} from '@kubernetes/client-node';
import {instance, mock, when} from 'ts-mockito';
import {HelmV1, KubectlV1} from 'vscode-kubernetes-tools-api';
import {Kubernetes} from '../../../utils/kubernetes';
import * as http from 'http';
import * as assert from 'assert';
import {failed, succeeded} from '../../../utils/errorable';

suite('Kubernetes Utility Test Suite', () => {
   test('it can list namespaces', async () => {
      const kubeconfigMock = mock<KubeConfig>();
      const coreV1ApiMock = mock<CoreV1Api>();
      const incomingMessageMock = mock<http.IncomingMessage>();
      const incomingMessage = instance(incomingMessageMock);
      const namespaces: {
         response: http.IncomingMessage;
         body: V1NamespaceList;
      } = {
         body: {
            items: ['name1', 'name2', 'name3'].map((name) => ({
               metadata: {name}
            }))
         },
         response: incomingMessage
      };
      when(coreV1ApiMock.listNamespace()).thenResolve(namespaces);
      const coreV1Api = instance(coreV1ApiMock);
      when(kubeconfigMock.makeApiClient(CoreV1Api)).thenReturn(coreV1Api);

      const kubectlMock = mock<KubectlV1>();
      const helmMock = mock<HelmV1>();
      const kubeconfig = instance(kubeconfigMock);
      const kubectl = instance(kubectlMock);
      const helm = instance(helmMock);
      const k8s = new Kubernetes(kubeconfig, kubectl, helm);

      const response = await k8s.listNamespaces();
      if (failed(response)) {
         assert.fail(`List namespaces failed: ${response.error}`);
      }
      assert.deepStrictEqual(response.result, namespaces.body.items);
   });
});
