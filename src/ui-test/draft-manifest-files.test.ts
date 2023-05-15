import * as assert from 'assert';
import * as fs from 'fs';
import path = require('path');
import {
   TitleBar,
   VSBrowser,
   InputBox,
   ActivityBar,
   Workbench,
   Key,
   until,
   QuickPickItem,
   By
} from 'vscode-extension-tester';
import {setWorkspace} from './common';
describe('Draft Kubernetes Deployment Test', () => {
   const pathToWorkspace =
      path.resolve(__dirname, '../../src/ui-test/test-repo/flask-hello-world') +
      '/';
   let browser: VSBrowser;

   before(async function () {
      this.timeout(100000);
      browser = VSBrowser.instance;
      await setWorkspace(pathToWorkspace, browser);
   });

   it('drafts manifest files', async function () {
      this.timeout(200000);
      //open command palette
      let prompt = await new Workbench().openCommandPrompt();
      const picks = await prompt.getQuickPicks();
      assert.notStrictEqual(picks.length, 0);

      //select quick pick to draft manifest files
      await prompt.selectQuickPick(
         'AKS Developer: Draft a Kubernetes Deployment and Service'
      );
      await browser.driver.wait(
         until.elementIsVisible(
            await browser.driver.findElement(
               By.xpath(".//input[@aria-describedby='quickInput_message']")
            )
         )
      );
      await prompt.confirm();
      await browser.driver.wait(
         until.elementLocated(By.className('quick-input-list'))
      );
      await prompt.selectQuickPick('Manifests');
      await browser.driver.wait(
         until.elementLocated(
            By.xpath(".//input[@aria-describedby='quickInput_message']")
         )
      );
      await prompt.setText('flask-hello-world');
      await prompt.confirm();
      await browser.driver.wait(
         until.elementTextContains(
            await browser.driver.findElement(By.css('div.quick-input-message')),
            'Port'
         )
      );
      await browser.driver.wait(
         until.elementLocated(
            By.xpath(".//input[@aria-describedby='quickInput_message']")
         )
      );
      await prompt.setText('8080');
      await browser.driver.sleep(3000);

      await prompt.confirm();

      await browser.driver.wait(
         until.elementLocated(By.className('quick-input-list'))
      );
      await prompt.selectQuickPick('default');
      await browser.driver.wait(
         until.elementLocated(By.className('quick-input-list'))
      );
      await prompt.selectQuickPick('Other');
      await browser.driver.wait(
         until.elementIsVisible(
            await browser.driver.findElement(
               By.xpath(".//input[@aria-describedby='quickInput_message']")
            )
         )
      );
      await prompt.setText('test-image');
      await browser.driver.wait(
         until.elementIsVisible(
            await browser.driver.findElement(
               By.xpath(".//input[@aria-describedby='quickInput_message']")
            )
         )
      );
      await prompt.confirm();
      await browser.driver.wait(
         until.elementTextContains(
            await browser.driver.findElement(By.css('div.quick-input-message')),
            'Image Tag'
         )
      );
      await prompt.confirm();
      await browser.driver.sleep(3000);

      const generatedFiles = [
         'manifests/deployment.yaml',
         'manifests/service.yaml'
      ];

      for (let file of generatedFiles) {
         let filepath = path.resolve(
            __dirname,
            '../../src/ui-test/test-repo/flask-hello-world',
            file
         );

         assert.strictEqual(fs.existsSync(filepath), true);

         fs.rmSync(filepath);
      }

      fs.rmdirSync(
         path.resolve(
            __dirname,
            '../../src/ui-test/test-repo/flask-hello-world/manifests/'
         )
      );
   });

   it('drafts helm charts', async function () {
      this.timeout(200000);
      //open command palette
      let prompt = await new Workbench().openCommandPrompt();
      const picks = await prompt.getQuickPicks();
      assert.notStrictEqual(picks.length, 0);

      //select quick pick to draft manifest files
      await prompt.selectQuickPick(
         'AKS Developer: Draft a Kubernetes Deployment and Service'
      );
      await browser.driver.wait(
         until.elementIsVisible(
            await browser.driver.findElement(
               By.xpath(".//input[@aria-describedby='quickInput_message']")
            )
         )
      );
      await prompt.confirm();
      await browser.driver.wait(
         until.elementLocated(By.className('quick-input-list'))
      );
      await prompt.selectQuickPick('Helm');
      await browser.driver.wait(
         until.elementLocated(
            By.xpath(".//input[@aria-describedby='quickInput_message']")
         )
      );
      await prompt.setText('flask-hello-world');
      await prompt.confirm();
      await browser.driver.wait(
         until.elementTextContains(
            await browser.driver.findElement(By.css('div.quick-input-message')),
            'Port'
         )
      );
      await browser.driver.wait(
         until.elementLocated(
            By.xpath(".//input[@aria-describedby='quickInput_message']")
         )
      );
      await prompt.setText('8080');
      await browser.driver.sleep(3000);

      await prompt.confirm();

      await browser.driver.wait(
         until.elementLocated(By.className('quick-input-list'))
      );
      await prompt.selectQuickPick('default');
      await browser.driver.wait(
         until.elementLocated(By.className('quick-input-list'))
      );
      await prompt.selectQuickPick('Other');
      await browser.driver.wait(
         until.elementIsVisible(
            await browser.driver.findElement(
               By.xpath(".//input[@aria-describedby='quickInput_message']")
            )
         )
      );
      await prompt.setText('test-image');
      await browser.driver.wait(
         until.elementIsVisible(
            await browser.driver.findElement(
               By.xpath(".//input[@aria-describedby='quickInput_message']")
            )
         )
      );
      await prompt.confirm();
      await browser.driver.wait(
         until.elementTextContains(
            await browser.driver.findElement(By.css('div.quick-input-message')),
            'Image Tag'
         )
      );
      await prompt.confirm();
      await browser.driver.sleep(3000);

      const generatedFiles = [
         '.helmignore',
         'Chart.yaml',
         'production.yaml',
         'values.yaml',
         'templates/_helpers.tpl',
         'templates/deployment.yaml',
         'templates/namespace.yaml',
         'templates/service.yaml'
      ];
      for (let file of generatedFiles) {
         let filepath = path.resolve(
            __dirname,
            '../../src/ui-test/test-repo/flask-hello-world/charts',
            file
         );
         assert.strictEqual(fs.existsSync(filepath), true);

         fs.rmSync(filepath);
      }

      fs.rmdirSync(
         path.resolve(
            __dirname,
            '../../src/ui-test/test-repo/flask-hello-world/charts/templates/'
         )
      );

      fs.rmdirSync(
         path.resolve(
            __dirname,
            '../../src/ui-test/test-repo/flask-hello-world/charts/'
         )
      );
   });

   it('drafts kustomize files', async function () {
      this.timeout(200000);
      //open command palette
      let prompt = await new Workbench().openCommandPrompt();
      const picks = await prompt.getQuickPicks();
      assert.notStrictEqual(picks.length, 0);

      //select quick pick to draft manifest files
      await prompt.selectQuickPick(
         'AKS Developer: Draft a Kubernetes Deployment and Service'
      );
      await browser.driver.wait(
         until.elementIsVisible(
            await browser.driver.findElement(
               By.xpath(".//input[@aria-describedby='quickInput_message']")
            )
         )
      );
      await prompt.confirm();
      await browser.driver.wait(
         until.elementLocated(By.className('quick-input-list'))
      );
      await prompt.selectQuickPick('Kustomize');
      await browser.driver.wait(
         until.elementLocated(
            By.xpath(".//input[@aria-describedby='quickInput_message']")
         )
      );
      await prompt.setText('flask-hello-world');
      await prompt.confirm();
      await browser.driver.wait(
         until.elementTextContains(
            await browser.driver.findElement(By.css('div.quick-input-message')),
            'Port'
         )
      );
      await browser.driver.wait(
         until.elementLocated(
            By.xpath(".//input[@aria-describedby='quickInput_message']")
         )
      );
      await prompt.setText('8080');
      await browser.driver.sleep(3000);

      await prompt.confirm();

      await browser.driver.wait(
         until.elementLocated(By.className('quick-input-list'))
      );
      await prompt.selectQuickPick('default');
      await browser.driver.wait(
         until.elementLocated(By.className('quick-input-list'))
      );
      await prompt.selectQuickPick('Other');
      await browser.driver.wait(
         until.elementIsVisible(
            await browser.driver.findElement(
               By.xpath(".//input[@aria-describedby='quickInput_message']")
            )
         )
      );
      await prompt.setText('test-image');
      await browser.driver.wait(
         until.elementIsVisible(
            await browser.driver.findElement(
               By.xpath(".//input[@aria-describedby='quickInput_message']")
            )
         )
      );
      await prompt.confirm();
      await browser.driver.wait(
         until.elementTextContains(
            await browser.driver.findElement(By.css('div.quick-input-message')),
            'Image Tag'
         )
      );
      await prompt.confirm();
      await browser.driver.sleep(3000);

      const generatedFiles = [
         'overlays/production/deployment.yaml',
         'overlays/production/kustomization.yaml',
         'overlays/production/service.yaml',
         'base/kustomization.yaml',
         'base/deployment.yaml',
         'base/namespace.yaml',
         'base/service.yaml'
      ];
      for (let file of generatedFiles) {
         let filepath = path.resolve(
            __dirname,
            '../../src/ui-test/test-repo/flask-hello-world/',
            file
         );
         assert.strictEqual(fs.existsSync(filepath), true);

         fs.rmSync(filepath);
      }

      fs.rmdirSync(
         path.resolve(
            __dirname,
            '../../src/ui-test/test-repo/flask-hello-world/overlays/production'
         )
      );

      fs.rmdirSync(
         path.resolve(
            __dirname,
            '../../src/ui-test/test-repo/flask-hello-world/base/'
         )
      );

      fs.rmdirSync(
         path.resolve(
            __dirname,
            '../../src/ui-test/test-repo/flask-hello-world/overlays/'
         )
      );
   });
});
