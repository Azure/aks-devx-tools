//import { beforeEach, describe } from "mocha";
import path = require("path");
import { InputBox, VSBrowser, Workbench } from "vscode-extension-tester";
describe('Draft Dockerfile Test', () => {
    let input: InputBox;
    beforeEach(async function () {
        this.timeout(10000);
        await new Workbench().openCommandPrompt();
        input = await InputBox.create();
    });

    // it('tests draft dockerfile executeCommand', async function () {
    //     this.timeout(10000);
    //     await new Workbench().executeCommand('aks-draft-extension.runDraftDockerfile');
    // });

    it('tests quick picks', async function () {
        this.timeout(10000);
        let browser = VSBrowser.instance;
        await browser.openResources(path.resolve(__dirname, '..', '..', 'src', 'ui-test', 'flask-hello-world'));
        await input.selectQuickPick('AKS Developer: Draft a Dockerfile').then(() => {
            input.selectQuickPick('aks-projects');
        });


    });
});