import * as assert from 'assert';
import {
   ValidateImage,
   ValidateImageTag,
   ValidatePort,
   ValidateRfc1123
} from '../../../utils/validation';

const passingTestRet = undefined;

suite('Validation Test Suite', () => {
   test('Port validations', async () => {
      // valid ports
      const validPorts = ['8080', '80', '90', '1', '65535'];
      const validatedValid = validPorts.map(ValidatePort);
      const invalidPorts = [
         '0',
         '65536',
         '-1',
         '-999999',
         '99999999999',
         'NaN',
         'dog',
         'Cat'
      ];
      const validatedInvalid = invalidPorts.map(ValidatePort);

      (await Promise.all(validatedValid)).forEach((res) => {
         assert.strictEqual(res, passingTestRet);
      });
      (await Promise.all(validatedInvalid)).forEach((res) => {
         assert.notStrictEqual(res, passingTestRet);
      });
   });

   test('Rfc 1123 validations', async () => {
      const valid = [
         'app-name',
         'frontend',
         'front-end-demo',
         'a'.repeat(63),
         '123',
         '1number'
      ];
      const validatedValid = valid.map(ValidateRfc1123);

      const invalid = [
         'Capitalized',
         'cApitalized',
         'CAPITALIZED',
         '-start',
         'end-',
         'a'.repeat(64),
         'special/chars',
         'other#chars'
      ];
      const validatedInvalid = invalid.map(ValidateRfc1123);

      (await Promise.all(validatedValid)).forEach((res) => {
         assert.strictEqual(res, passingTestRet);
      });
      (await Promise.all(validatedInvalid)).forEach((res) => {
         assert.notStrictEqual(res, passingTestRet);
      });
   });

   test('Image', async () => {
      // some test cases from https://regex101.com/r/a98UqN/1
      const validImages = [
         'alpine',
         'alpine',
         '_/alpine',
         '_/alpine',
         'alpine',
         'docker.example.com/gmr/alpine',
         'docker.example.com:5000/gmr/alpine',
         'acr/testing'
      ];
      const validatedValid = validImages.map(async (word: string) => {
         return [word, await ValidateImage(word)];
      });
      const invalidImages = [
         'invalid image',
         '$@%#$%#thisisinvalid',
         '/this/has/too/many/slashes',
         'no:tag'
      ];
      const validatedInvalid = invalidImages.map(async (word: string) => {
         return [word, await ValidateImage(word)];
      });

      (await Promise.all(validatedValid)).forEach(([word, res]) => {
         assert.strictEqual(
            res,
            passingTestRet,
            `Expected ${word} to be valid image`
         );
      });
      (await Promise.all(validatedInvalid)).forEach(([word, res]) => {
         assert.notStrictEqual(
            res,
            passingTestRet,
            `Expected ${word} to be invalid image`
         );
      });
   });
   test('ImageTag', async () => {
      // some test cases from https://regex101.com/r/a98UqN/1
      const validTags = [
         'latest',
         'my-tag',
         'my-tag-1.0',
         'allow_underscores',
         'allow--double--hyphens',
         'allow__double__underscores',
         'allow.periods'
      ];

      const validTagPromises = validTags.map(async (word) => [
         word,
         await ValidateImageTag(word)
      ]);
      (await Promise.all(validTagPromises)).forEach(([word, res]) => {
         assert.strictEqual(
            res,
            passingTestRet,
            `Expected ${word} to be valid tag`
         );
      });

      const invalidTags = [
         '_no-leading-underscore',
         'no-trailing-underscore_',
         '-no-leading-hyphen',
         '--no-leading-double-hyphen',
         'no-trailing-hyphen-',
         'no-trailing-double-hyphen--',
         '.no-leading-period',
         'no-trailing-period.',
         '$@%#$%#thisisinvalid',
         'no/slashes',
         'no spaces',
         'no:colons:here',
         'invalid..seperator',
         'another___invalid___seperator'
      ];

      const invalidTagPromises = invalidTags.map(async (word) => {
         return [word, await ValidateImageTag(word)];
      });
      (await Promise.all(invalidTagPromises)).forEach(([word, res]) => {
         assert.notStrictEqual(
            res,
            passingTestRet,
            `Expected ${word} to be invalid tag`
         );
      });
   });
});
