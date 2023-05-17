import * as assert from 'assert';
import * as fs from 'fs';
import path = require('path');

import {
   VSBrowser,
   Workbench,
   until,
   By,
   EditorView
} from 'vscode-extension-tester';
import {clearAllNotifications, notificationFound, setWorkspace} from './common';
import {after} from 'mocha';
describe('Draft Dockerfile Test', () => {
   const pathToWorkspace =
      path.resolve(__dirname, '../../src/ui-test/test-repo/flask-hello-world') +
      '/';
   const notificationMessage =
      'The Dockerfile was created. Next, build the image on Azure Container Registry.';
   let browser: VSBrowser;
   let editorView: EditorView;

   before(async function () {
      this.timeout(10000);
      browser = VSBrowser.instance;
      editorView = new EditorView();
      await editorView.closeAllEditors();
      await setWorkspace(pathToWorkspace, browser);
   });

   after(async function () {
      this.timeout(10000);
      await new EditorView().closeAllEditors();
      await clearAllNotifications();
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

      await browser.driver.wait(
         until.elementLocated(
            By.xpath(".//a[@class='label-name' and text()='.dockerignore']")
         )
      );
      await browser.driver.wait(
         until.elementLocated(
            By.xpath(".//a[@class='label-name' and text()='Dockerfile']")
         )
      );

      assert(notificationFound(notificationMessage));

      const generatedFiles = ['.dockerignore', 'Dockerfile'];

      for (let file of generatedFiles) {
         const filepath = path.resolve(
            __dirname,
            '../../src/ui-test/test-repo/flask-hello-world',
            file
         );
         assert.strictEqual(fs.existsSync(filepath), true);

         fs.rmSync(filepath);
      }
   });
});
