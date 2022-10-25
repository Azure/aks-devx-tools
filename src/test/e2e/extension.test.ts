import {extensions} from 'vscode';

describe('Extension', () => {
   it('can be installed', () => {
      const extension = extensions.getExtension(
         'ms-kubernetes-tools.aks-devx-tools'
      );
      expect(extension).toBeTruthy();
   });
});
