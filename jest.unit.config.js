const path = require('path');

module.exports = {
   roots: [path.join(__dirname, 'src', 'test', 'unit')],
   preset: 'ts-jest',
   testEnvironment: 'node',
   testMatch: [path.join(__dirname, 'src/test/unit/**/*.test.ts')],
   collectCoverage: true
};
