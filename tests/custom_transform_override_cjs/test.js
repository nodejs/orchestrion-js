const { fetch } = require('./instrumented.js')
const assert = require('node:assert')

assert.strictEqual(global.__importOverridden, true)
assert.strictEqual(fetch('https://example.com'), 42)
