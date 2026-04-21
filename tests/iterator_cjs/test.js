const { generate } = require('./instrumented.js')
const { assert, getContext } = require('../common/preamble.js')

const context = getContext('orchestrion:undici:generate')
const nextContext = getContext('orchestrion:undici:generate:next')

const iter = generate()
assert.strictEqual(context.start, true)
assert.ok(context.end)

const values = []
for (const v of iter) {
  values.push(v)
}
assert.deepStrictEqual(values, [1, 2, 3])

assert.strictEqual(nextContext.start, true)
assert.deepStrictEqual(nextContext.end, { value: undefined, done: true })
