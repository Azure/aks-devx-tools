import * as fs from 'fs';

import { fileSync } from 'tmp';
import { stringify } from 'yaml';


export function buildCreateCommand(
    destination: string,
    fileType: string,
    configPath: string
): string {
    let args: string[] = [];
    args.push(`create --skip-file-detection`);
    args.push(`--destination=${destination}`);

    let createType = '';
    if (fileType === 'dockerfile') {
        createType = '--dockerfile-only';
    } else if (fileType === 'deployment') {
        createType = '--deployment-only';
    }
    if (createType.length > 0) {
        args.push(createType);
    }

    args.push(`--create-config=${configPath}`);

    return args.join(' ');
}

export function buildCreateConfig(
    language: string,
    port: string,
    appName: string,
    workflow: string,
    languageVersion: string
): string {
    let data = {
        deployType: workflow,
        languageType: language,
        deployVariables: [ // for deployment files
            {
                name: "PORT",
                value: port
            }
        ],
        languageVariables: [ // for dockerfile
            {
                name: "PORT",
                value: port
            }
        ]
    };

    if (appName?.length > 0) {
        data.deployVariables.push({
            name: "APPNAME",
            value: appName
        });
    }

    if (languageVersion?.length > 0) {
        data.languageVariables.push({
            name: "VERSION",
            value: languageVersion
        });
    }

    const tempFile = fileSync({ postfix: '.yaml' });
    fs.writeFileSync(tempFile.name, stringify(data));

    return tempFile.name;
}

export function buildSetupGHCommand(
    appName: string,
    subscriptionId: string,
    resourceGroup: string,
    ghRepo: string
): string {
    return `setup-gh -p azure -a ${appName} -s ${subscriptionId} -r ${resourceGroup} -g ${ghRepo}`;
}

export function buildGenerateWorkflowCommand(
    destination: string,
    clusterName: string,
    resourceGroup: string,
    registryName: string,
    containerName: string,
    branch: string
): string {
    return `generate-workflow -c ${clusterName} -r ${registryName} --container-name ${containerName} -g ${resourceGroup} -d ${destination} -b ${branch}`;
}

export function buildUpdateCommand(
    outputFolder: string,
    host: string,
    certificate: string,
    port: string,
    namespace: string,
    service: string,
    useOpenServiceMesh: boolean
): string {
    return `update -d ${outputFolder} -a webapp_routing --variable ingress-use-osm-mtls=${useOpenServiceMesh} --variable ingress-host=${host} --variable ingress-tls-cert-keyvault-uri=${certificate} --variable ingress-port=${port} --variable ingress-service=${service} --variable ingress-namespace=${namespace}`;
}