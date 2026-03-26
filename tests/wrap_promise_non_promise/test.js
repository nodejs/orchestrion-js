const { fetch } = require('./instrumented.js')
const { assert, getContext } = require('../common/preamble.js')
const context = getContext('orchestrion:undici:fetch_nonpromise')
const result = fetch('https://example.com')
assert.equal(result, 42)
assert.deepStrictEqual(context, {
  start: true,
  end: 42
})
