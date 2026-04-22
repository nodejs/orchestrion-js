'use strict'

const { Connection } = require('./instrumented.js')
const { assert, getContext } = require('../common/preamble.js')
const context = getContext('orchestrion:undici:Connection_generate')

const conn = new Connection()
const iter = conn.generate()

const results = []
for (const val of iter) {
  results.push(val)
}

assert.strictEqual(context.start, true)
assert.deepStrictEqual(results, [1, 2, 3])
