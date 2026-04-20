const { fetch } = require('./instrumented.js')
const { assert, getContext } = require('../common/preamble.js')
const context = getContext('orchestrion:undici:fetch.auto')

function resetContext () {
  for (const key of Object.keys(context)) delete context[key]
}

;(async () => {
  // Callback path: last arg is a function → callback tracing
  await new Promise((resolve, reject) => {
    fetch('sync', (err, val) => {
      if (err) reject(err)
      else resolve(val)
    })
  })
  assert.deepStrictEqual(context, {
    start: true,
    end: true,
    asyncStart: 42,
    asyncEnd: 42,
  })
  resetContext()

  // Promise path: no callback, returns a thenable → asyncStart/asyncEnd fired on settlement
  await fetch('async')
  assert.deepStrictEqual(context, {
    start: true,
    end: true,
    asyncStart: 42,
    asyncEnd: 42,
  })
  resetContext()

  // Sync path: no callback, returns a plain value → result captured in end, no async events
  const result = fetch('sync')
  assert.strictEqual(result, 42)
  assert.deepStrictEqual(context, {
    start: true,
    end: 42,
  })
})()
