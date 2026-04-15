const { Undici } = require('./instrumented.js')
const { assert, getContext } = require('../common/preamble.js')
const { tracingChannel } = require('node:diagnostics_channel')

const context = getContext('orchestrion:undici:Base_fetch')

// Mutate the second argument in the start channel subscriber
tracingChannel('orchestrion:undici:Base_fetch').subscribe({
  start (message) {
    message.arguments[1] = 'mutated'
  }
})

;(async () => {
  const undici = new Undici()
  assert.strictEqual(undici.fetch.length, 2)
  const result = await undici.fetch('https://example.com', 'original')
  assert.strictEqual(result, 42)
  assert.deepStrictEqual(context, {
    start: true,
    end: true,
    asyncStart: 42,
    asyncEnd: 42,
  })
})()
