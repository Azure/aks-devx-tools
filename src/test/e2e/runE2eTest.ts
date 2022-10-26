import * as path from 'path';
import {runTests} from '@vscode/test-electron';

async function main() {
   try {
      const extensionDevelopmentPath = path.resolve(__dirname, '../../../');
      const extensionTestsPath = path.resolve(__dirname, './index');

      // Download VS Code, unzip it and run the integration test
      const platform =
         process.platform === 'win32' ? 'win32-x64-archive' : undefined;
      await runTests({
         extensionDevelopmentPath,
         extensionTestsPath,
         platform,
         launchArgs: ['--verbose']
      });
   } catch (err) {
      console.error(err);
      process.exit(1);
   }
}

main();
