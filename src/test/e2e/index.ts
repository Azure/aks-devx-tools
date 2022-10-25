import * as jest from 'jest';
import {AggregatedResult} from '@jest/test-result';
import * as path from 'path';

const extensionRoot = path.join(__dirname, '..', '..', '..');
type Output = {results: AggregatedResult};

export function run(
   testsRoot: string,
   reportTestResults: (error?: Error, failures?: number) => void
): void {
   // hack from https://github.com/DonJayamanne/gitHistoryVSCode/blob/75575aa03d03a06a2b901944d65a0f58f4875e02/test/extension/testRunner.ts#L15
   // because Jest doesn't let you inject global imports
   (process as any).__VSCODE = require('vscode');

   // load Jest config
   const jestConfigFile = path.join(extensionRoot, 'jest.e2e.config.js');
   const jestConfig = require(jestConfigFile);

   jest
      .runCLI(jestConfig, [extensionRoot])
      .catch((err) => {
         reportTestResults(err, 1);
      })
      .then((out) => {
         const {results} = out as Output;
         reportTestResults(
            undefined,
            results.numFailedTestSuites + results.numFailedTests
         );
      })
      .finally(() => {
         delete (process as any).__VSCODE;
      });
}
