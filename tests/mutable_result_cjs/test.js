const { create, compute, boom } = require('./instrumented.js')
const assert = require('node:assert')
const { tracingChannel } = require('node:diagnostics_channel')

// Scenario 1: a subscriber substitutes the returned handler by reassigning
// `message.result` in `end`. The wrapper must return the substituted function.
const events = []
tracingChannel('orchestrion:undici:create_mutable').subscribe({
  start () {
    events.push('start')
  },
  end (message) {
    events.push('end')
    const original = message.result
    assert.strictEqual(typeof original, 'function')
    message.result = function wrapped (...args) {
      events.push('wrapped')
      return `[${original.apply(this, args)}]`
    }
  }
})

const instance = { name: 'Ctrl' }
const callback = function (req) {
  return `${this.name}:${req}`
}
const handler = create(instance, callback)
assert.strictEqual(typeof handler, 'function')
// The handler returned to the caller is the substituted wrapper.
assert.strictEqual(handler('GET'), '[Ctrl:GET]')
assert.deepStrictEqual(events, ['start', 'end', 'wrapped'])

// Scenario 2: a subscriber observes `message.result` but does NOT reassign it.
// The original return value must be preserved unchanged.
let observed
tracingChannel('orchestrion:undici:compute_mutable').subscribe({
  end (message) {
    observed = message.result
  }
})
assert.strictEqual(compute(41), 42)
assert.strictEqual(observed, 42)

// Scenario 3 (throw path): the restructured try/finally must still propagate
// the error and publish it; the trailing `return message.result` is unreachable.
let errored
tracingChannel('orchestrion:undici:boom_mutable').subscribe({
  error (message) {
    errored = message.error
  }
})
assert.throws(() => boom(), /boom/)
assert.ok(errored instanceof Error)
assert.strictEqual(errored.message, 'boom')
