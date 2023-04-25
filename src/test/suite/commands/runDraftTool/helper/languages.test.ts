import {ESLint} from 'eslint';
import {
   DraftLanguage,
   getDraftLanguages
} from '../../../../../commands/runDraftTool/helper/languages';
import * as assert from 'assert';
import {failed, getAsyncResult} from '../../../../../utils/errorable';
import {before} from 'mocha';
import {ensureDraftBinary} from '../../../../../commands/runDraftTool/helper/runDraftHelper';

suite('Languages Test Suite', () => {
   before(async function () {
      this.timeout(10000);
      if (failed(await ensureDraftBinary())) {
         throw new Error('Failed to ensure draft binary');
      }
   });

   test('languages are retrieved from draft info without error', async () => {
      const languages = await getAsyncResult(getDraftLanguages());

      assert.doesNotThrow(getDraftLanguages);
      assert(languages.length > 0);
   });

   test('each retrieved language contains a version', async () => {
      const languages = await getAsyncResult(getDraftLanguages());

      languages.forEach((lang: DraftLanguage) => {
         assert(lang.versions.length > 0);
      });
   });
});
