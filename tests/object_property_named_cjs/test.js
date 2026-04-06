'use strict'

const { conn } = require('./instrumented.js')
const { assert, getContext } = require('../common/preamble.js')
const context = getContext('orchestrion:undici:conn_query')

;(async () => {
  const result = await conn.query()
  assert.strictEqual(result, 42)
  assert.deepStrictEqual(context, {
    start: true,
    end: true,
    asyncStart: 42,
    asyncEnd: 42
  })
})()
