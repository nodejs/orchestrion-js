const { fetch } = require('./instrumented.js')
const assert = require('node:assert')

fetch('https://example.com')
assert.strictEqual(global.__customCalled, true)
