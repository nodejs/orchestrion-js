const { generate } = require('./instrumented.js')
const { assert, getContext } = require('../common/preamble.js')

const context = getContext('orchestrion:undici:generate')
const nextContext = getContext('orchestrion:undici:generate:next')

;(async () => {
  const iter = generate()
  assert.strictEqual(context.start, true)
  assert.ok(context.end)

  const values = []
  for await (const v of iter) {
    values.push(v)
  }
  assert.deepStrictEqual(values, [1, 2, 3])

  assert.strictEqual(nextContext.start, true)
  assert.deepStrictEqual(nextContext.asyncEnd, { value: undefined, done: true })
})()
