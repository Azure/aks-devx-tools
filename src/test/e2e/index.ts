import * as jest from 'jest';
import {AggregatedResult} from '@jest/test-result';
import * as path from 'path';

const extensionRoot = path.join(__dirname, '..', '..', '..');
type Output = {results: AggregatedResult};

export function run(): Promise<void> {
   // hack from https://github.com/DonJayamanne/gitHistoryVSCode/blob/75575aa03d03a06a2b901944d65a0f58f4875e02/test/extension/testRunner.ts#L15
   // Jest doesn't let you inject global imports
   (process as any).__VSCODE = require('vscode');

   // load Jest config
   const jestConfigFile = path.join(extensionRoot, 'jest.e2e.config.js');
   const jestConfig = require(jestConfigFile);

   return new Promise((resolve, reject) => {
      // run Jest
      jest
         .runCLI(jestConfig, [extensionRoot])
         .catch((err) => {
            console.error('Calling jest.runCLI failed', err);
            reject(err);
         })
         .then((out) => {
            if (!out) {
               return resolve();
            }

            // if there's any failed tests we should fail
            const {results} = out as Output;
            if (results.numFailedTestSuites || results.numFailedTests) {
               return reject();
            }

            resolve();
         })
         .finally(() => {
            delete (process as any).__VSCODE;
         });
   });
}
