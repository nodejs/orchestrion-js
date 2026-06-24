const { Decorator } = require('./instrumented.js')
const assert = require('node:assert')
const { tracingChannel } = require('node:diagnostics_channel')

// The channel fires when the (anonymous, sync) returned decorator is applied.
// A subscriber can mutate the decorated target (arg 0): building block for
// instrumenting decorated classes.
let started = false
tracingChannel('orchestrion:undici:decorator_apply').subscribe({
  start (message) {
    started = true
    const target = message.arguments[0]
    target.instrumented = true
  }
})

class MyService {}
const decorate = Decorator({ scope: 'request' })
const result = decorate(MyService)

assert.strictEqual(started, true)
// Original decorator still ran.
assert.strictEqual(result, MyService)
assert.deepStrictEqual(MyService.decorated, { scope: 'request' })
// Subscriber's mutation of the target took effect.
assert.strictEqual(MyService.instrumented, true)
