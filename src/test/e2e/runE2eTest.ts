import * as path from 'path';
import {runTests} from '@vscode/test-electron';

async function main() {
   try {
      const extensionDevelopmentPath = path.resolve(__dirname, '../../../');
      const extensionTestsPath = path.resolve(__dirname, './index');

      // Download VS Code, unzip it and run the integration test
      await runTests({
         extensionDevelopmentPath,
         extensionTestsPath
      });
   } catch (err) {
      console.error('Failed to run tests');
      console.error(err);
      process.exit(1);
   }
}

main();
