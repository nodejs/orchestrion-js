'use strict'

const { Connection } = require('./instrumented.js')
const { assert, getContext } = require('../common/preamble.js')
const context = getContext('orchestrion:undici:Connection_query')

;(async () => {
  const conn = new Connection({ host: 'localhost' })
  const result = await conn._query()
  assert.strictEqual(result, 42)
  assert.deepStrictEqual(context, {
    start: true,
    end: true,
    asyncStart: 42,
    asyncEnd: 42
  })
})()
