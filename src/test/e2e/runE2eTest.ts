import * as path from 'path';
import * as fs from 'fs';
import {runTests} from '@vscode/test-electron';

async function main() {
   try {
      const extensionDevelopmentPath = path.resolve(__dirname, '../../../');
      const extensionTestsPath = path.resolve(__dirname, './index');

      // create test output
      const tempDir = path.join(extensionDevelopmentPath, 'temp');
      if (!fs.existsSync(tempDir)) {
         fs.mkdirSync(tempDir);
      }
      const testFailedPath = path.join(tempDir, 'aks-devx-tools.e2e.failed');
      if (fs.existsSync(testFailedPath)) {
         fs.unlinkSync(testFailedPath);
      }

      // Download VS Code, unzip it and run the integration test
      await runTests({
         extensionDevelopmentPath,
         extensionTestsPath
      });

      // check if tests failed
      if (fs.existsSync(testFailedPath)) {
         console.error('Tests failed');
         process.exit(1);
      }
   } catch (err) {
      console.error('Failed to run tests:', err);
      process.exit(1);
   }
}

main();
