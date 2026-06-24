const { load, loadThenable } = require('./instrumented.js')
const assert = require('node:assert')
const { tracingChannel } = require('node:diagnostics_channel')

const instance = { name: 'Ctrl' }
const callback = function (req) {
  return `${this.name}:${req}`
}

;(async () => {
  // Scenario 1: a native Promise. A subscriber substitutes the resolved handler
  // by reassigning `message.result` in `asyncEnd`. The caller awaits and
  // receives the substituted wrapper.
  const events = []
  tracingChannel('orchestrion:undici:load_mutable').subscribe({
    asyncEnd (message) {
      events.push('asyncEnd')
      const original = message.result
      assert.strictEqual(typeof original, 'function')
      message.result = function wrapped (...args) {
        events.push('wrapped')
        return `[${original.apply(this, args)}]`
      }
    }
  })

  const handler = await load(instance, callback)
  assert.strictEqual(typeof handler, 'function')
  // The handler returned to the caller is the substituted wrapper.
  assert.strictEqual(handler('GET'), '[Ctrl:GET]')
  assert.deepStrictEqual(events, ['asyncEnd', 'wrapped'])

  // Scenario 2: a userland thenable (not a native Promise). The subscriber can
  // observe `message.result` but reassigning it has no effect. The original
  // resolved handler is preserved, since the wrapper returns the thenable
  // itself rather than `__apm$ctx.result`.
  let observed
  tracingChannel('orchestrion:undici:load_thenable_mutable').subscribe({
    asyncEnd (message) {
      observed = message.result
      message.result = function wrapped () {
        return 'SHOULD_NOT_APPLY'
      }
    }
  })

  const thenableHandler = await loadThenable(instance, callback)
  assert.strictEqual(typeof thenableHandler, 'function')
  // Subscriber observed the resolved value...
  assert.strictEqual(typeof observed, 'function')
  // ...but its mutation was ignored: the caller gets the original handler.
  assert.strictEqual(thenableHandler('GET'), 'Ctrl:GET')
})().catch((err) => {
  console.error(err)
  process.exit(1)
})
