import k8s = require('@kubernetes/client-node');

function getk8sApiClient() {
    const kc = new k8s.KubeConfig();
    kc.loadFromDefault();
    const k8sApi = kc.makeApiClient(k8s.CoreV1Api);
    return k8sApi;
}

export async function listNamespaces(): Promise<k8s.V1Namespace[]> {
    return getk8sApiClient().listNamespace()
        .then((res: { body: k8s.V1NamespaceList; }) => res.body.items);
}

export async function createNamespace(namespace: string): Promise<void> {
    const ns: k8s.V1Namespace = {
        metadata: {
            name: namespace
        } 
    };
    await getk8sApiClient().createNamespace(ns);
}

export async function listNamespacedServices(namespace: string): Promise<k8s.V1Service[]> {
    return getk8sApiClient().listServiceForAllNamespaces()
        .then((res: { body: k8s.V1ServiceList; }) => res.body.items
            .filter(s => s.metadata?.namespace === namespace));
}

export async function listNamespacedPods(namespace: string): Promise<k8s.V1Pod[]> {
    return getk8sApiClient().listNamespacedPod(namespace)
        .then((res: { body: k8s.V1PodList; }) => res.body.items);
}
