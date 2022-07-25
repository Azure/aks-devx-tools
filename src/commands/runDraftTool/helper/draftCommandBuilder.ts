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
    dotnetVersion: string
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

    if (appName.length > 0) {
        data.deployVariables.push({
            name: "APPNAME",
            value: appName
        });
    }

    if (dotnetVersion.length > 0) {
        data.languageVariables.push({
            name: "VERSION",
            value: dotnetVersion
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
    destination: string,
    host: string,
    certificate: string
): string {
    return `update -a ${host} -s ${certificate} -d ${destination}`;
}