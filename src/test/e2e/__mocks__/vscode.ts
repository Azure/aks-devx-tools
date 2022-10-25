// hack to inject global import
// https://github.com/DonJayamanne/gitHistoryVSCode/blob/cfcc98fd47eaab2d0dfaf2abbabd1457fb2f8910/test/extension/__mocks__/vscode.ts
module.exports = (process as any).__VSCODE as typeof import('vscode');
