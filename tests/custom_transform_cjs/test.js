const { fetch } = require('./instrumented.js');
const assert = require('assert');

fetch('https://example.com');
assert.strictEqual(global.__customCalled, true);
