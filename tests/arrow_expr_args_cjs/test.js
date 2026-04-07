'use strict'

const { fetch } = require('./instrumented.js')
const { assert, getContext } = require('../common/preamble.js')
const context = getContext('orchestrion:undici:fetch_arrow_args')

// Without the ArrowFunctionExpression → FunctionExpression fix, `url` would
// resolve to the CJS module wrapper arguments rather than 'https://example.com'.
;(async () => {
  const result = await fetch('https://example.com')
  assert.strictEqual(result, 'https://example.com')
  assert.deepStrictEqual(context, {
    start: true,
    end: true,
    asyncStart: 'https://example.com',
    asyncEnd: 'https://example.com'
  })
})()
