import {
   CoreV1Api,
   KubeConfig,
   V1Namespace,
   V1NamespaceList
} from '@kubernetes/client-node';
import {instance, mock, when, anything} from 'ts-mockito';
import {HelmV1, KubectlV1} from 'vscode-kubernetes-tools-api';
import {Kubernetes} from '../../../utils/kubernetes';
import * as http from 'http';
import * as assert from 'assert';
import {failed, succeeded} from '../../../utils/errorable';

suite('Kubernetes Utility Test Suite', () => {
   test('it can list namespaces', async () => {
      const kubectlMock = mock<KubectlV1>();
      const helmMock = mock<HelmV1>();
      const kubectl = instance(kubectlMock);
      const helm = instance(helmMock);

      // success case
      const successKubeconfigMock = mock<KubeConfig>();
      const successCoreV1ApiMock = mock<CoreV1Api>();
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
      when(successCoreV1ApiMock.listNamespace()).thenResolve(namespaces);
      const successCoreV1Api = instance(successCoreV1ApiMock);
      when(successKubeconfigMock.makeApiClient(CoreV1Api)).thenReturn(
         successCoreV1Api
      );
      const successKubeconfig = instance(successKubeconfigMock);

      const successK8s = new Kubernetes(successKubeconfig, kubectl, helm);
      const succeededResponse = await successK8s.listNamespaces();
      if (failed(succeededResponse)) {
         assert.fail(`List namespaces failed: ${succeededResponse.error}`);
      }
      assert.deepStrictEqual(succeededResponse.result, namespaces.body.items);

      // fail case
      const failCoreV1ApiMock = mock<CoreV1Api>();
      when(failCoreV1ApiMock.listNamespace()).thenReject(new Error());
      const failCoreV1Api = instance(failCoreV1ApiMock);
      const failKubeconfigMock = mock<KubeConfig>();
      when(failKubeconfigMock.makeApiClient(CoreV1Api)).thenReturn(
         failCoreV1Api
      );
      const failKubeconfig = instance(failKubeconfigMock);

      const failK8s = new Kubernetes(failKubeconfig, kubectl, helm);
      const failedResponse = await failK8s.listNamespaces();
      if (succeeded(failedResponse)) {
         assert.fail('List namespaces succeeded');
      }
      assert.notStrictEqual(failedResponse.error, '');
   });

   test('it can create a namespace', async () => {
      const kubectlMock = mock<KubectlV1>();
      const helmMock = mock<HelmV1>();
      const kubectl = instance(kubectlMock);
      const helm = instance(helmMock);
      const namespaceName = 'examplens';

      // success case
      const successKubeconfigMock = mock<KubeConfig>();
      const successCoreV1ApiMock = mock<CoreV1Api>();
      const incomingMessageMock = mock<http.IncomingMessage>();
      const incomingMessage = instance(incomingMessageMock);
      const namespace: {
         response: http.IncomingMessage;
         body: V1Namespace;
      } = {
         body: {metadata: {name: namespaceName}},
         response: incomingMessage
      };
      when(
         successCoreV1ApiMock.createNamespace({metadata: {name: namespaceName}})
      ).thenResolve(namespace);
      const successCoreV1Api = instance(successCoreV1ApiMock);
      when(successKubeconfigMock.makeApiClient(CoreV1Api)).thenReturn(
         successCoreV1Api
      );
      const successKubeconfig = instance(successKubeconfigMock);

      const successK8s = new Kubernetes(successKubeconfig, kubectl, helm);
      const succeededResponse = await successK8s.createNamespace(namespaceName);
      if (failed(succeededResponse)) {
         assert.fail(`Create namespace failed: ${succeededResponse.error}`);
      }

      // fail case
      const failCoreV1ApiMock = mock<CoreV1Api>();
      when(failCoreV1ApiMock.createNamespace(anything())).thenReject(
         new Error()
      );
      const failCoreV1Api = instance(failCoreV1ApiMock);
      const failKubeconfigMock = mock<KubeConfig>();
      when(failKubeconfigMock.makeApiClient(CoreV1Api)).thenReturn(
         failCoreV1Api
      );
      const failKubeconfig = instance(failKubeconfigMock);

      const failK8s = new Kubernetes(failKubeconfig, kubectl, helm);
      const failedResponse = await failK8s.createNamespace(namespaceName);
      if (succeeded(failedResponse)) {
         assert.fail('Create namespace succeeded');
      }
      assert.notStrictEqual(failedResponse.error, '');
   });
});
