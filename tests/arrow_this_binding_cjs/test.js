'use strict'

const { Connection } = require('./instrumented.js')
const { assert, getContext } = require('../common/preamble.js')
const context = getContext('orchestrion:undici:Connection_query_this')

;(async () => {
  const conn = new Connection({ host: 'localhost' })
  const result = await conn._query('SELECT 1')
  assert.strictEqual(result, 'result:SELECT 1')
  assert.deepStrictEqual(context, {
    start: true,
    end: true,
    asyncStart: 'result:SELECT 1',
    asyncEnd: 'result:SELECT 1'
  })
})()
