import {
   CoreV1Api,
   KubeConfig,
   V1Namespace,
   V1NamespaceList
} from '@kubernetes/client-node';
import {instance, mock, when, anything, anyString, verify} from 'ts-mockito';
import {Matcher} from 'ts-mockito/lib/matcher/type/Matcher';
import {HelmV1, KubectlV1} from 'vscode-kubernetes-tools-api';
import {Kubernetes} from '../../../utils/kubernetes';
import * as http from 'http';
import * as assert from 'assert';
import {failed, succeeded} from '../../../utils/errorable';

const ns = 'namespace1';

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

   test('it can apply manifests', async () => {
      const helmMock = mock<HelmV1>();
      const helm = instance(helmMock);
      const kubeconfigMock = mock<KubeConfig>();
      when(kubeconfigMock.exportConfig()).thenReturn('kubeconfig string');
      const kubeconfig = instance(kubeconfigMock);

      // success case
      const files = '/path/to/file3';
      const stdout = 'output from command';
      const successKubectlMock = mock<KubectlV1>();
      when(successKubectlMock.invokeCommand(anyString())).thenResolve({
         code: 0,
         stderr: '',
         stdout
      });
      const successKubectl = instance(successKubectlMock);

      const successK8s = new Kubernetes(kubeconfig, successKubectl, helm);
      const successResponse = await successK8s.applyManifests(files, ns);
      if (failed(successResponse)) {
         assert.fail(`Apply manifests failed: ${successResponse.error}`);
      }
      assert.strictEqual(successResponse.result, `${stdout}\n${stdout}`);
      verify(kubeconfigMock.exportConfig()).twice();
      verify(
         successKubectlMock.invokeCommand(
            new ContainsStr(`apply -f "${files}"`) as any
         )
      ).once();

      // fail case
      const failKubectlMock = mock<KubectlV1>();
      when(failKubectlMock.invokeCommand(anyString())).thenResolve({
         code: 1,
         stderr: 'error',
         stdout: ''
      });
      const failKubectl = instance(failKubectlMock);

      const failK8s = new Kubernetes(kubeconfig, failKubectl, helm);
      const failedResponse = await failK8s.applyManifests(files, ns);
      if (succeeded(failedResponse)) {
         assert.fail(`Apply manifests succeeded`);
      }
      assert.notStrictEqual(failedResponse.error, '');
   });

   test('it can apply kustomize', async () => {
      const helmMock = mock<HelmV1>();
      const helm = instance(helmMock);
      const kubeconfigMock = mock<KubeConfig>();
      when(kubeconfigMock.exportConfig()).thenReturn('kubeconfig string');
      const kubeconfig = instance(kubeconfigMock);

      // success case
      const directory = '/path/to/directory';
      const stdout = 'output from command';
      const successKubectlMock = mock<KubectlV1>();
      when(successKubectlMock.invokeCommand(anyString())).thenResolve({
         code: 0,
         stderr: '',
         stdout
      });
      const successKubectl = instance(successKubectlMock);

      const successK8s = new Kubernetes(kubeconfig, successKubectl, helm);
      const successResponse = await successK8s.applyKustomize(directory, ns);
      if (failed(successResponse)) {
         assert.fail(`Apply Kustomize failed: ${successResponse.error}`);
      }
      assert.strictEqual(successResponse.result, `${stdout}\n${stdout}`);
      verify(kubeconfigMock.exportConfig()).thrice();
      verify(
         successKubectlMock.invokeCommand(
            new ContainsStr(`apply -k "${directory}"`) as any
         )
      ).once();

      // fail case
      const failKubectlMock = mock<KubectlV1>();
      when(failKubectlMock.invokeCommand(anyString())).thenResolve({
         code: 1,
         stderr: 'error',
         stdout: ''
      });
      const failKubectl = instance(failKubectlMock);

      const failK8s = new Kubernetes(kubeconfig, failKubectl, helm);
      const failedResponse = await failK8s.applyKustomize(directory, ns);
      if (succeeded(failedResponse)) {
         assert.fail('Apply Kustomize succeeded');
      }
      assert.notStrictEqual(failedResponse.error, '');
   });

   test('it can install helm', async () => {
      const kubectlMock = mock<KubectlV1>();
      const kubectl = instance(kubectlMock);
      const kubeconfigMock = mock<KubeConfig>();
      when(kubeconfigMock.exportConfig()).thenReturn('kubeconfig string');
      const kubeconfig = instance(kubeconfigMock);

      // success case
      const directory = '/path/to/directory';
      const stdout = 'output from command';
      const successHelmMock = mock<HelmV1>();
      when(successHelmMock.invokeCommand(anyString())).thenResolve({
         code: 0,
         stderr: '',
         stdout
      });
      const successHelm = instance(successHelmMock);

      const successK8s = new Kubernetes(kubeconfig, kubectl, successHelm);
      const successResponse = await successK8s.installHelm(directory);
      if (failed(successResponse)) {
         assert.fail(`Install Helm failed: ${successResponse.error}`);
      }
      assert.strictEqual(successResponse.result, stdout);
      verify(kubeconfigMock.exportConfig()).once();
      verify(
         successHelmMock.invokeCommand(
            new ContainsStr(`install "${directory}" --generate-name`) as any
         )
      ).once();

      const failHelmMock = mock<HelmV1>();
      when(failHelmMock.invokeCommand(anyString())).thenResolve({
         code: 1,
         stderr: 'error',
         stdout: ''
      });
      const failHelm = instance(failHelmMock);

      const failK8s = new Kubernetes(kubeconfig, kubectl, failHelm);
      const failedResponse = await failK8s.installHelm(directory);
      if (succeeded(failedResponse)) {
         assert.fail('Install Helm succeeded');
      }
      assert.notStrictEqual(failedResponse.error, '');
   });
});

class ContainsStr extends Matcher {
   constructor(private expected: string) {
      super();
   }

   match(value: any): boolean {
      if (typeof value !== 'string') {
         return false;
      }

      return value.includes(this.expected);
   }

   toString(): string {
      return `Did not contain ${this.expected}`;
   }
}
