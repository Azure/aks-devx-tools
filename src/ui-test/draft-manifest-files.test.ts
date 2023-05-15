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
import { prototype } from 'events';
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
      // Open command palette
      let prompt = await new Workbench().openCommandPrompt();
      const picks = await prompt.getQuickPicks();
      assert.notStrictEqual(picks.length, 0);

      // Select quick pick to draft manifest files
      await prompt.selectQuickPick(
         'AKS Developer: Draft a Kubernetes Deployment and Service'
      );

      // Confirm default output folder
      await browser.driver.wait(
         until.elementIsVisible(
            await browser.driver.findElement(
               By.xpath(".//input[@aria-describedby='quickInput_message']")
            )
         )
      );
      await prompt.confirm();

      // Select deployment
      await browser.driver.wait(
         until.elementLocated(By.className('quick-input-list'))
      );
      await prompt.selectQuickPick('Manifests');

      // Set app name
      await browser.driver.wait(
         until.elementLocated(
            By.xpath(".//input[@aria-describedby='quickInput_message']")
         )
      );
      await prompt.setText('flask-hello-world');
      await prompt.confirm();

      // Set port
      await browser.driver.wait(
         until.elementTextContains(
            await browser.driver.findElement(By.css('div.quick-input-message')),
            'Port'
         )
      );
      await prompt.setText('8080');
      await prompt.confirm();

      // Select default namespace
      await browser.driver.wait(
         until.elementLocated(
            By.xpath(
               ".//input[@placeholder='Namespace' and @class='input empty']"
            )
         )
      );
      await prompt.selectQuickPick('default');

      // Select image option
      await browser.driver.wait(
         until.elementLocated(By.className('quick-input-list'))
      );
      await prompt.selectQuickPick('Other');

      // Set image name
      await browser.driver.wait(
         until.elementIsVisible(
            await browser.driver.findElement(
               By.xpath(".//input[@aria-describedby='quickInput_message']")
            )
         )
      );
      await prompt.setText('test-image');
      await prompt.confirm();

      // Confirm default image tag
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
      // Open command palette
      let prompt = await new Workbench().openCommandPrompt();
      const picks = await prompt.getQuickPicks();
      assert.notStrictEqual(picks.length, 0);

      // Select quick pick to draft manifest files
      await prompt.selectQuickPick(
         'AKS Developer: Draft a Kubernetes Deployment and Service'
      );

      // Confirm default output folder
      await browser.driver.wait(
         until.elementIsVisible(
            await browser.driver.findElement(
               By.xpath(".//input[@aria-describedby='quickInput_message']")
            )
         )
      );
      await prompt.confirm();

      // Select deployment
      await browser.driver.wait(
         until.elementLocated(By.className('quick-input-list'))
      );
      await prompt.selectQuickPick('Helm');

      // Set app name
      await browser.driver.wait(
         until.elementLocated(
            By.xpath(".//input[@aria-describedby='quickInput_message']")
         )
      );
      await prompt.setText('flask-hello-world');
      await prompt.confirm();

      // Set port
      await browser.driver.wait(
         until.elementTextContains(
            await browser.driver.findElement(By.css('div.quick-input-message')),
            'Port'
         )
      );
      await prompt.setText('8080');
      await prompt.confirm();

      // Select default namespace
      await browser.driver.wait(
         until.elementLocated(
            By.xpath(
               ".//input[@placeholder='Namespace' and @class='input empty']"
            )
         )
      );
      await prompt.selectQuickPick('default');

      // Select image option
      await browser.driver.wait(
         until.elementLocated(By.className('quick-input-list'))
      );
      await prompt.selectQuickPick('Other');

      // Set image name
      await browser.driver.wait(
         until.elementIsVisible(
            await browser.driver.findElement(
               By.xpath(".//input[@aria-describedby='quickInput_message']")
            )
         )
      );
      await prompt.setText('test-image');
      await prompt.confirm();

      // Confirm default image tag
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
      // Open command palette
      let prompt = await new Workbench().openCommandPrompt();
      const picks = await prompt.getQuickPicks();
      assert.notStrictEqual(picks.length, 0);

      // Select quick pick to draft manifest files
      await prompt.selectQuickPick(
         'AKS Developer: Draft a Kubernetes Deployment and Service'
      );

      // Confirm default output folder
      await browser.driver.wait(
         until.elementIsVisible(
            await browser.driver.findElement(
               By.xpath(".//input[@aria-describedby='quickInput_message']")
            )
         )
      );
      await prompt.confirm();

      // Select deployment
      await browser.driver.wait(
         until.elementLocated(By.className('quick-input-list'))
      );
      await prompt.selectQuickPick('Kustomize');

      // Set app name
      await browser.driver.wait(
         until.elementLocated(
            By.xpath(".//input[@aria-describedby='quickInput_message']")
         )
      );
      await prompt.setText('flask-hello-world');
      await prompt.confirm();

      // Set port
      await browser.driver.wait(
         until.elementTextContains(
            await browser.driver.findElement(By.css('div.quick-input-message')),
            'Port'
         )
      );
      await prompt.setText('8080');
      await prompt.confirm();

      // Select default namespace
      await browser.driver.wait(
         until.elementLocated(
            By.xpath(
               ".//input[@placeholder='Namespace' and @class='input empty']"
            )
         )
      );
      await prompt.selectQuickPick('default');

      // Select image option
      await browser.driver.wait(
         until.elementLocated(By.className('quick-input-list'))
      );
      await prompt.selectQuickPick('Other');

      // Set image name
      await browser.driver.wait(
         until.elementIsVisible(
            await browser.driver.findElement(
               By.xpath(".//input[@aria-describedby='quickInput_message']")
            )
         )
      );
      await prompt.setText('test-image');
      await prompt.confirm();

      // Confirm default image tag
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
