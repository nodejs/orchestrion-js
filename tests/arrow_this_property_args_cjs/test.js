'use strict'

const { Connection } = require('./instrumented.js')
const { assert, getContext } = require('../common/preamble.js')
const context = getContext('orchestrion:undici:Connection_query_args')

// Without the ArrowFunctionExpression → FunctionExpression fix, `sql` would
// resolve to the constructor's opts argument rather than 'SELECT 1'.
;(async () => {
  const conn = new Connection({ host: 'localhost' })
  const result = await conn._query('SELECT 1')
  assert.strictEqual(result, 'SELECT 1')
  assert.deepStrictEqual(context, {
    start: true,
    end: true,
    asyncStart: 'SELECT 1',
    asyncEnd: 'SELECT 1'
  })
})()
