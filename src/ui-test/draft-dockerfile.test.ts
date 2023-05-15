import * as assert from 'assert';
import * as fs from 'fs';
import path = require('path');

import {
   VSBrowser,
   Workbench,
   until,
   By,
} from 'vscode-extension-tester';
import { setWorkspace } from './common';
describe('Draft Dockerfile Test', () => {
   const pathToWorkspace =
      path.resolve(__dirname, '../../src/ui-test/test-repo/flask-hello-world') +
      '/';
   let browser: VSBrowser;

   before(async function () {
      this.timeout(100000);
      browser = VSBrowser.instance;
      await setWorkspace(pathToWorkspace, browser);
   });

   it('drafts a dockerfile', async function () {
      this.timeout(200000);
      // Open command palette
      let prompt = await new Workbench().openCommandPrompt();
      const picks = await prompt.getQuickPicks();
      assert.notStrictEqual(picks.length, 0);

      // Select quick pick to draft dockerfile
      await prompt.selectQuickPick('AKS Developer: Draft a Dockerfile');

      // Confirm default source code folder
      await browser.driver.wait(
         until.elementIsVisible(
            await browser.driver.findElement(By.css('input.input'))
         )
      );
      await prompt.confirm();

      // Select language
      await browser.driver.wait(
         until.elementLocated(By.className('quick-input-list'))
      );
      await prompt.selectQuickPick('Python');

      // Select language version
      await browser.driver.wait(
         until.elementLocated(By.className('quick-input-list'))
      );
      await prompt.selectQuickPick('3.9');

      // Set port
      await browser.driver.wait(
         until.elementIsVisible(
            await browser.driver.findElement(By.css('input.input'))
         )
      );
      await prompt.setText('8080');
      await browser.driver.wait(
         until.elementIsVisible(
            await browser.driver.findElement(By.css('input.input'))
         )
      );
      await prompt.confirm();
      await browser.driver.sleep(3000);

      assert.strictEqual(
         fs.existsSync(
            path.resolve(
               __dirname,
               '../../src/ui-test/test-repo/flask-hello-world/.dockerignore'
            )
         ),
         true
      );
      assert.strictEqual(
         fs.existsSync(
            path.resolve(
               __dirname,
               '../../src/ui-test/test-repo/flask-hello-world/Dockerfile'
            )
         ),
         true
      );

      if (
         fs.existsSync(
            path.resolve(
               __dirname,
               '../../src/ui-test/test-repo/flask-hello-world/.dockerignore'
            )
         )
      ) {
         fs.rmSync(
            path.resolve(
               __dirname,
               '../../src/ui-test/test-repo/flask-hello-world/.dockerignore'
            )
         );
      }

      if (
         fs.existsSync(
            path.resolve(
               __dirname,
               '../../src/ui-test/test-repo/flask-hello-world/Dockerfile'
            )
         )
      ) {
         fs.rmSync(
            path.resolve(
               __dirname,
               '../../src/ui-test/test-repo/flask-hello-world/Dockerfile'
            )
         );
      }
   });
});
