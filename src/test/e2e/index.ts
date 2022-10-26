import * as jest from 'jest';
import {AggregatedResult} from '@jest/test-result';
import * as path from 'path';
import * as fs from 'fs';

const extensionRoot = path.join(__dirname, '..', '..', '..');
type Output = {results: AggregatedResult};

export async function run(): Promise<void> {
   // hack from https://github.com/DonJayamanne/gitHistoryVSCode/blob/75575aa03d03a06a2b901944d65a0f58f4875e02/test/extension/testRunner.ts#L15
   // because Jest doesn't let you inject global imports
   (process as any).__VSCODE = require('vscode');

   // load Jest config
   const jestConfigFile = path.join(extensionRoot, 'jest.e2e.config.js');
   const jestConfig = require(jestConfigFile);

   return new Promise<void>((resolve, reject) => {
      jest
         .runCLI(jestConfig, [extensionRoot])
         .catch((err) => {
            delete (process as any).__VSCODE;
            console.log('FAILING IN RUNNING');
            return reject(err);
         })
         .then((out) => {
            delete (process as any).__VSCODE;
            if (!out) {
               return resolve();
            }

            const {results} = out;
            if (results.numFailedTestSuites || results.numFailedTests) {
               // If we reject, VS Code doesn't exit gracefully
               const extensionDevelopmentPath = path.resolve(
                  __dirname,
                  '../../../'
               );
               const tempDir = path.join(extensionDevelopmentPath, 'temp');
               if (!fs.existsSync(tempDir)) {
                  fs.mkdirSync(tempDir);
               }
               const testFailedPath = path.join(
                  tempDir,
                  'aks-devx-tools.e2e.failed'
               );

               fs.appendFileSync(testFailedPath, 'failed');
            }

            return resolve();
         });
   });
}
