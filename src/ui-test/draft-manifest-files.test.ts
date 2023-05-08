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
import { setWorkspace } from './common';
describe('Draft Kubernetes Deployment Test', () => {
    const pathToWorkspace =
        path.resolve(__dirname, '../../src/ui-test/test-repo/flask-hello-world') +
        '/';
    let browser: VSBrowser;

    before(async function () {
        this.timeout(100000);
        browser = VSBrowser.instance;
        await setWorkspace(pathToWorkspace);
    });

    it('drafts manifest files', async function () {
        this.timeout(200000);
        //open command palette
        console.log('Opening command palette');
        let prompt = await new Workbench().openCommandPrompt();
        console.log('Getting all quickpicks');
        const picks = await prompt.getQuickPicks();
        assert.notStrictEqual(picks.length, 0);

        //select quick pick to draft manifest files
        console.log(
            "Selecting quick pick: 'AKS Developer: Draft a Kubernetes Deployment and Service'"
        );
        await prompt.selectQuickPick(
            'AKS Developer: Draft a Kubernetes Deployment and Service'
        );
        await browser.driver.sleep(3000);
        console.log('Confirming output folder');
        await prompt.confirm();
        await browser.driver.sleep(3000);
        await prompt.selectQuickPick('Manifests');
        await browser.driver.sleep(3000);
        await prompt.setText('flask-hello-world');
        await prompt.confirm();
        await browser.driver.sleep(3000);
        await prompt.confirm();
        await browser.driver.sleep(3000);
        await prompt.selectQuickPick('default');
        await browser.driver.sleep(3000);
        await prompt.selectQuickPick('Other');
        await browser.driver.sleep(3000);
        await prompt.setText('test-image');
        await browser.driver.sleep(3000);
        await prompt.confirm();
        await browser.driver.sleep(3000);
        await prompt.confirm();
        await browser.driver.sleep(3000);
        assert.strictEqual(
            fs.existsSync(
                path.resolve(
                    __dirname,
                    '../../src/ui-test/test-repo/flask-hello-world/manifests/deployment.yaml'
                )
            ),
            true
        );
        assert.strictEqual(
            fs.existsSync(
                path.resolve(
                    __dirname,
                    '../../src/ui-test/test-repo/flask-hello-world/manifests/service.yaml'
                )
            ),
            true
        );
        fs.rmSync(path.resolve(
            __dirname,
            '../../src/ui-test/test-repo/flask-hello-world/manifests/deployment.yaml'
        ));
        fs.rmSync(path.resolve(
            __dirname,
            '../../src/ui-test/test-repo/flask-hello-world/manifests/service.yaml'
        ));

        fs.rmdirSync(
            path.resolve(
                __dirname,
                '../../src/ui-test/test-repo/flask-hello-world/manifests/'
            )
        );
    });
});
