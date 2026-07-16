const { fetch } = require('./instrumented.js')
const assert = require('node:assert')

assert.strictEqual(global.__defaultTransformCalled, true)
assert.strictEqual(fetch('https://example.com'), 42)
