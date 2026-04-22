'use strict'

const { Connection } = require('./instrumented.js')
const { assert, getContext } = require('../common/preamble.js')

const contextArrow = getContext('orchestrion:undici:Connection_fetchArrow')
const contextFn = getContext('orchestrion:undici:Connection_fetchFunction')

;(async () => {
  const conn = new Connection('host', 'port')

  // Arrow: arguments.length must still be 2 (constructor args), not 1 (call-site).
  const arrowResult = await conn.fetchArrow('SELECT 1')
  assert.strictEqual(arrowResult, 2)

  // Regular function: arguments.length must be 1 (call-site args).
  const fnResult = await conn.fetchFunction('SELECT 1')
  assert.strictEqual(fnResult, 1)

  assert.deepStrictEqual(contextArrow, { start: true, end: true, asyncStart: 2, asyncEnd: 2 })
  assert.deepStrictEqual(contextFn, { start: true, end: true, asyncStart: 1, asyncEnd: 1 })
})()
