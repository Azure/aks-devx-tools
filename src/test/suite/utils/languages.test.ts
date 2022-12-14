import {ESLint} from 'eslint';
import {
   DraftLanguage,
   getDraftLanguages
} from '../../../commands/runDraftTool/helper/languages';
import * as assert from 'assert';

suite('Languages Test Suite', () => {
   test('languages are retrieve from draft info without error', async () => {
      const languages: DraftLanguage[] = await getDraftLanguages();

      assert.doesNotThrow(getDraftLanguages);
      assert(languages.length > 0);
   });

   test('each retrieved language contains a version', async () => {
      const languages: DraftLanguage[] = await getDraftLanguages();

      languages.forEach((lang: DraftLanguage) => {
         assert(lang.versions.length > 0);
      });
   });
});
