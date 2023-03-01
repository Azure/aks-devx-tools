import * as assert from 'assert';
import {
   ValidateImage,
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
      const validatedValid = validImages.map(ValidateImage);
      const invalidImages = [
         'invalid image',
         '$@%#$%#thisisinvalid',
         '/this/has/too/many/slashes'
      ];
      const validatedInvalid = invalidImages.map(ValidateImage);

      (await Promise.all(validatedValid)).forEach((res) => {
         assert.strictEqual(res, passingTestRet);
      });
      (await Promise.all(validatedInvalid)).forEach((res) => {
         assert.notStrictEqual(res, passingTestRet);
      });
   });
   test('ImageTag', async () => {
      // some test cases from https://regex101.com/r/a98UqN/1
      const validTag = [
         'latest',
         'my-tag',
         'my-tag-1.0',
         'allow_underscores',
         'allow--double--hyphens',
         'allow__double__underscores',
         'allow.periods'
      ];
      const validatedValid = validTag.map(ValidateImage);
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
         'no:colons:here'
      ];
      const validatedInvalid = invalidTags.map(ValidateImage);

      (await Promise.all(validatedValid)).forEach((res) => {
         assert.strictEqual(res, passingTestRet);
      });
      (await Promise.all(validatedInvalid)).forEach((res) => {
         assert.notStrictEqual(res, passingTestRet);
      });
   });
});
