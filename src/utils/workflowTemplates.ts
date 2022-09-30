export function getBasicTemplate(
  azureContainerRegistry: string,
  containerImageName: string,
  resourceGroup: string,
  clusterName: string,
  deploymentManifestPath: string,
  branchName: string,
  dockerfileLocation: string
): any {
  const basicTemplate = {
    name: "Build and deploy an app to AKS",
    on: {
      workflow_dispatch: null,
    },
    env: {
      AZURE_CONTAINER_REGISTRY: azureContainerRegistry,
      CONTAINER_NAME: containerImageName,
      RESOURCE_GROUP: resourceGroup,
      CLUSTER_NAME: clusterName,
      DEPLOYMENT_MANIFEST_PATH: deploymentManifestPath,
      BRANCH_NAME: branchName,
      DOCKERFILE_LOCATION: dockerfileLocation,
    },
    jobs: {
      buildImage: {
        permissions: {
          contents: "read",
          "id-token": "write",
        },
        "runs-on": "ubuntu-latest",
        steps: [
          {
            uses: "actions/checkout@v3",
            with: {
              ref: "${{ env.BRANCH_NAME }}",
            },
          },
          {
            name: "Azure login",
            uses: "azure/login@v1.4.3",
            with: {
              "client-id": "${{ secrets.AZURE_CLIENT_ID }}",
              "tenant-id": "${{ secrets.AZURE_TENANT_ID }}",
              "subscription-id": "${{ secrets.AZURE_SUBSCRIPTION_ID }}",
            },
          },
          {
            name: "Build and push image to ACR",
            run: "az acr build --image ${{ env.AZURE_CONTAINER_REGISTRY }}.azurecr.io/${{ env.CONTAINER_NAME }}:${{ github.sha }} --registry ${{ env.AZURE_CONTAINER_REGISTRY }} -g ${{ env.RESOURCE_GROUP }} ${{ env.DOCKERFILE_LOCATION }}\n",
          },
        ],
      },
      deploy: {
        permissions: {
          actions: "read",
          contents: "read",
          "id-token": "write",
        },
        "runs-on": "ubuntu-latest",
        needs: ["buildImage"],
        steps: [
          {
            uses: "actions/checkout@v3",
          },
          {
            name: "Azure login",
            uses: "azure/login@v1.4.3",
            with: {
              "client-id": "${{ secrets.AZURE_CLIENT_ID }}",
              "tenant-id": "${{ secrets.AZURE_TENANT_ID }}",
              "subscription-id": "${{ secrets.AZURE_SUBSCRIPTION_ID }}",
            },
          },
          {
            name: "Get K8s context",
            uses: "azure/aks-set-context@v3",
            with: {
              "resource-group": "${{ env.RESOURCE_GROUP }}",
              "cluster-name": "${{ env.CLUSTER_NAME }}",
            },
          },
          {
            name: "Deploys application",
            uses: "Azure/k8s-deploy@v4",
            with: {
              action: "deploy",
              manifests: "${{ env.DEPLOYMENT_MANIFEST_PATH }}\n",
              images:
                "${{ env.AZURE_CONTAINER_REGISTRY }}.azurecr.io/${{ env.CONTAINER_NAME }}:${{ github.sha }}\n",
            },
          },
        ],
      },
    },
  };

  return basicTemplate;
}
export function getBgcTemplate(
  azureContainerRegistry: string,
  containerImageName: string,
  resourceGroup: string,
  clusterName: string,
  deploymentManifestPath: string,
  branchName: string,
  dockerfileLocation: string,
  deploymentStrategy: string
): any {
  const bgcTemplate = {
    name: "Build and deploy an app to AKS",
    on: {
      workflow_dispatch: null,
    },
    env: {
      AZURE_CONTAINER_REGISTRY: azureContainerRegistry,
      CONTAINER_NAME: containerImageName,
      RESOURCE_GROUP: resourceGroup,
      CLUSTER_NAME: clusterName,
      DEPLOYMENT_MANIFEST_PATH: deploymentManifestPath,
      DEPLOYMENT_STRATEGY: deploymentStrategy,
      BRANCH_NAME: branchName,
      DOCKERFILE_LOCATION: dockerfileLocation,
    },
    jobs: {
      buildImage: {
        permissions: {
          contents: "read",
          "id-token": "write",
        },
        "runs-on": "ubuntu-latest",
        steps: [
          {
            uses: "actions/checkout@v3",
            with: {
              ref: "${{ env.BRANCH_NAME }}",
            },
          },
          {
            name: "Azure login",
            uses: "azure/login@v1.4.3",
            with: {
              "client-id": "${{ secrets.AZURE_CLIENT_ID }}",
              "tenant-id": "${{ secrets.AZURE_TENANT_ID }}",
              "subscription-id": "${{ secrets.AZURE_SUBSCRIPTION_ID }}",
            },
          },
          {
            name: "Build and push image to ACR",
            run: "az acr build --image ${{ env.AZURE_CONTAINER_REGISTRY }}.azurecr.io/${{ env.CONTAINER_NAME }}:${{ github.sha }} --registry ${{ env.AZURE_CONTAINER_REGISTRY }} -g ${{ env.RESOURCE_GROUP }} ${{ env.DOCKERFILE_LOCATION }}\n",
          },
        ],
      },
      deploy: {
        permissions: {
          actions: "read",
          contents: "read",
          "id-token": "write",
        },
        "runs-on": "ubuntu-latest",
        needs: ["buildImage"],
        steps: [
          {
            uses: "actions/checkout@v3",
          },
          {
            name: "Azure login",
            uses: "azure/login@v1.4.3",
            with: {
              "client-id": "${{ secrets.AZURE_CLIENT_ID }}",
              "tenant-id": "${{ secrets.AZURE_TENANT_ID }}",
              "subscription-id": "${{ secrets.AZURE_SUBSCRIPTION_ID }}",
            },
          },
          {
            name: "Get K8s context",
            uses: "azure/aks-set-context@v3",
            with: {
              "resource-group": "${{ env.RESOURCE_GROUP }}",
              "cluster-name": "${{ env.CLUSTER_NAME }}",
            },
          },
          {
            name: "Deploys application",
            uses: "Azure/k8s-deploy@v4",
            with: {
              strategy: "${{ env.DEPLOYMENT_STRATEGY }}",
              "traffic-split-method": "pod",
              action: "deploy",
              manifests: "${{ env.DEPLOYMENT_MANIFEST_PATH }}\n",
              images:
                "${{ env.AZURE_CONTAINER_REGISTRY }}.azurecr.io/${{ env.CONTAINER_NAME }}:${{ github.sha }}",
            },
          },
        ],
      },
      shouldPromote: {
        "runs-on": "ubuntu-latest",
        needs: "deploy",
        environment: "promote",
        steps: [
          {
            run: "echo 'requested approval (approve to promote, deny to reject)'",
          },
        ],
      },
      promote: {
        permissions: {
          actions: "read",
          contents: "read",
          "id-token": "write",
        },
        "runs-on": "ubuntu-latest",
        needs: ["shouldPromote"],
        if: "${{ contains(join(needs.*.result, ','), 'success') }}",
        steps: [
          {
            uses: "actions/checkout@v3",
          },
          {
            name: "Azure login",
            uses: "azure/login@v1.4.3",
            with: {
              "client-id": "${{ secrets.AZURE_CLIENT_ID }}",
              "tenant-id": "${{ secrets.AZURE_TENANT_ID }}",
              "subscription-id": "${{ secrets.AZURE_SUBSCRIPTION_ID }}",
            },
          },
          {
            name: "Get K8s context",
            uses: "azure/aks-set-context@v3",
            with: {
              "resource-group": "${{ env.RESOURCE_GROUP }}",
              "cluster-name": "${{ env.CLUSTER_NAME }}",
            },
          },
          {
            name: "Deploys application",
            uses: "Azure/k8s-deploy@v4",
            with: {
              strategy: "${{ env.DEPLOYMENT_STRATEGY }}",
              "traffic-split-method": "pod",
              action: "promote",
              manifests: "${{ env.DEPLOYMENT_MANIFEST_PATH }}\n",
              images:
                "${{ env.AZURE_CONTAINER_REGISTRY }}.azurecr.io/${{ env.CONTAINER_NAME }}:${{ github.sha }}",
            },
          },
        ],
      },
      reject: {
        permissions: {
          actions: "read",
          contents: "read",
          "id-token": "write",
        },
        "runs-on": "ubuntu-latest",
        needs: ["shouldPromote"],
        if: "${{ always() && !contains(join(needs.*.result, ','), 'skipped') && contains(join(needs.*.result, ','), 'failure') }}",
        steps: [
          {
            uses: "actions/checkout@v3",
          },
          {
            name: "Azure login",
            uses: "azure/login@v1.4.3",
            with: {
              "client-id": "${{ secrets.AZURE_CLIENT_ID }}",
              "tenant-id": "${{ secrets.AZURE_TENANT_ID }}",
              "subscription-id": "${{ secrets.AZURE_SUBSCRIPTION_ID }}",
            },
          },
          {
            name: "Get K8s context",
            uses: "azure/aks-set-context@v3",
            with: {
              "resource-group": "${{ env.RESOURCE_GROUP }}",
              "cluster-name": "${{ env.CLUSTER_NAME }}",
            },
          },
          {
            name: "Deploys application",
            uses: "Azure/k8s-deploy@v4",
            with: {
              strategy: "${{ env.DEPLOYMENT_STRATEGY }}",
              "traffic-split-method": "pod",
              action: "reject",
              manifests: "${{ env.DEPLOYMENT_MANIFEST_PATH }}\n",
              images:
                "${{ env.AZURE_CONTAINER_REGISTRY }}.azurecr.io/${{ env.CONTAINER_NAME }}:${{ github.sha }}",
            },
          },
        ],
      },
    },
  };

  return bgcTemplate;
}

export function getHelmTemplate(
  azureContainerRegistry: string,
  containerImageName: string,
  resourceGroup: string,
  clusterName: string,
  branchName: string,
  helmDeployCommand: string,
  dockerfileLocation: string
): any {
  const helmTemplate = {
    name: "Build and deploy an app to AKS with Helm",
    on: {
      workflow_dispatch: null,
    },
    env: {
      AZURE_CONTAINER_REGISTRY: azureContainerRegistry,
      CONTAINER_NAME: containerImageName,
      RESOURCE_GROUP: resourceGroup,
      CLUSTER_NAME: clusterName,
      BRANCH_NAME: branchName,
      HELM_DEPLOY_COMMAND: helmDeployCommand,
      DOCKERFILE_LOCATION: dockerfileLocation,
    },
    jobs: {
      buildImage: {
        permissions: {
          contents: "read",
          "id-token": "write",
        },
        "runs-on": "ubuntu-latest",
        steps: [
          {
            uses: "actions/checkout@v3",
            with: {
              ref: "${{ env.BRANCH_NAME }}",
            },
          },
          {
            name: "Azure login",
            uses: "azure/login@v1.4.3",
            with: {
              "client-id": "${{ secrets.AZURE_CLIENT_ID }}",
              "tenant-id": "${{ secrets.AZURE_TENANT_ID }}",
              "subscription-id": "${{ secrets.AZURE_SUBSCRIPTION_ID }}",
            },
          },
          {
            name: "Build and push image to ACR",
            run: "az acr build --image ${{ env.AZURE_CONTAINER_REGISTRY }}.azurecr.io/${{ env.CONTAINER_NAME }}:${{ github.sha }} --registry ${{ env.AZURE_CONTAINER_REGISTRY }} -g ${{ env.RESOURCE_GROUP }} ${{ env.DOCKERFILE_LOCATION }}\n",
          },
        ],
      },
      deploy: {
        permissions: {
          actions: "read",
          contents: "read",
          "id-token": "write",
        },
        "runs-on": "ubuntu-latest",
        needs: ["buildImage"],
        steps: [
          {
            uses: "actions/checkout@v3",
          },
          {
            name: "Azure login",
            uses: "azure/login@v1.4.3",
            with: {
              "client-id": "${{ secrets.AZURE_CLIENT_ID }}",
              "tenant-id": "${{ secrets.AZURE_TENANT_ID }}",
              "subscription-id": "${{ secrets.AZURE_SUBSCRIPTION_ID }}",
            },
          },
          {
            name: "Get K8s context",
            uses: "azure/aks-set-context@v3",
            with: {
              "resource-group": "${{ env.RESOURCE_GROUP }}",
              "cluster-name": "${{ env.CLUSTER_NAME }}",
            },
          },
          {
            name: "Deploy application",
            run: "${{ env.HELM_DEPLOY_COMMAND }}",
          },
        ],
      },
    },
  };

  return helmTemplate;
}

export const comment = `
# This workflow will build and push an application to a Azure Kubernetes Service (AKS) cluster when you push your code
#
# This workflow assumes you have already created the target AKS cluster and have created an Azure Container Registry (ACR)
# For instructions see:
#   - https://docs.microsoft.com/en-us/azure/aks/kubernetes-walkthrough-portal
#   - https://docs.microsoft.com/en-us/azure/container-registry/container-registry-get-started-portal
#   - https://github.com/Azure/aks-create-action
#
# To configure this workflow:
#
# 1. Set the following secrets in your repository (instructions for getting these can be found at https://docs.microsoft.com/en-us/azure/developer/github/connect-from-azure?tabs=azure-cli%2Clinux):
#    - AZURE_CLIENT_ID
#    - AZURE_TENANT_ID
#    - AZURE_SUBSCRIPTION_ID
#
# 2. Set the following environment variables (or replace the values below):
#    - AZURE_CONTAINER_REGISTRY (name of your container registry / ACR)
#    - RESOURCE_GROUP (where your cluster is deployed)
#    - CLUSTER_NAME (name of your AKS cluster)
#    - CONTAINER_NAME (name of the container image you would like to push up to your ACR)
#    - IMAGE_PULL_SECRET_NAME (name of the ImagePullSecret that will be created to pull your ACR image)
#    - DEPLOYMENT_MANIFEST_PATH (path to the manifest yaml for your deployment)
#
# For more information on GitHub Actions for Azure, refer to https://github.com/Azure/Actions
# For more samples to get started with GitHub Action workflows to deploy to Azure, refer to https://github.com/Azure/actions-workflow-samples
# For more options with the actions used below please refer to https://github.com/Azure/login
`;
