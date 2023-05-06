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
describe('Draft Dockerfile Test', () => {

    const pathToWorkspace =
        path.resolve(__dirname, '../../src/ui-test/test-repo/flask-hello-world') +
        '/';
    let browser: VSBrowser;

    before(async function () {
        this.timeout(100000);
        browser = VSBrowser.instance;
        await setWorkspace(pathToWorkspace);
    });

    it('drafts a dockerfile', async function () {
        this.timeout(200000);
        //open command palette
        console.log('Opening command palette');
        let prompt = await new Workbench().openCommandPrompt();
        console.log('Getting all quickpicks');
        const picks = await prompt.getQuickPicks();
        assert.notStrictEqual(picks.length, 0);

        //select quick pick to draft dockerfile
        console.log("Selecting quick pick: 'AKS Developer: Draft a Dockerfile'");
        await prompt.selectQuickPick('AKS Developer: Draft a Dockerfile');
        await browser.driver.sleep(3000);
        console.log('Confirming source code folder');
        await prompt.confirm();
        await browser.driver.sleep(3000);
        await prompt.selectQuickPick('Python');
        await browser.driver.sleep(3000);
        await prompt.selectQuickPick('3.9');
        await browser.driver.sleep(3000);
        await prompt.setText('8080');
        await browser.driver.sleep(3000);
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
