'use strict'

const { syncFn, asyncFn, callbackFn, Base, Derived } = require('./instrumented.js')
const assert = require('node:assert')
const { tracingChannel } = require('node:diagnostics_channel')

// A `start` subscriber replaces the first argument and appends one in place;
// the original must see both, because the wrapper hands it the same array
// that was published as `message.arguments`.
function replaceAndAppend (name) {
  tracingChannel(`orchestrion:undici:${name}`).subscribe({
    start (message) {
      message.arguments[0] = 'replaced'
      message.arguments.push('appended')
    },
  })
}

for (const name of ['syncFn', 'asyncFn', 'Base_ctor', 'Derived_ctor']) replaceAndAppend(name)

;(async () => {
  const self = { self: true }

  assert.deepStrictEqual(syncFn.call(self, 'original', 'extra'), {
    self, a: 'replaced', rest: ['extra', 'appended'], len: 3,
  })

  assert.deepStrictEqual(await asyncFn.call(self, 'original'), {
    self, a: 'replaced', rest: ['appended'], len: 2,
  })

  // Constructors forward `__apm$arguments` by spreading it into the moved
  // body, so parameters see the mutation. (`arguments` inside the body is the
  // constructor's own and is not affected, as before.)
  const base = new Base('original')
  assert.strictEqual(base.a, 'replaced')
  assert.deepStrictEqual(base.rest, ['appended'])

  // `super()` goes through the separately instrumented `Base`, whose own
  // subscriber appends once more.
  const derived = new Derived('original', 'extra')
  assert.strictEqual(derived.derivedA, 'replaced')
  assert.deepStrictEqual(derived.derivedRest, ['extra', 'appended'])
  assert.strictEqual(derived.a, 'replaced')
  assert.deepStrictEqual(derived.rest, ['extra', 'appended', 'appended'])

  // Callback: by the time `start` fires the wrapper has already spliced its
  // own callback into `message.arguments`. A subscriber can wrap that in turn,
  // and both layers must run.
  {
    const events = []
    tracingChannel('orchestrion:undici:callbackFn').subscribe({
      start (message) {
        events.push('start')
        message.arguments[0] = 'replaced'
        const wrappedCb = message.arguments[1]
        assert.strictEqual(typeof wrappedCb, 'function')
        message.arguments[1] = function (err, res) {
          events.push('subscriber-cb')
          return wrappedCb.call(this, err, res)
        }
      },
      asyncStart () { events.push('asyncStart') },
      asyncEnd () { events.push('asyncEnd') },
      end () { events.push('end') },
    })

    const result = await new Promise((resolve, reject) => {
      callbackFn.call(self, 'original', (err, res) => {
        events.push('user-cb')
        err ? reject(err) : resolve(res)
      })
    })
    assert.deepStrictEqual(result, { self, a: 'replaced', len: 2 })
    assert.deepStrictEqual(events, ['start', 'subscriber-cb', 'asyncStart', 'user-cb', 'asyncEnd', 'end'])
  }
})().catch((err) => {
  console.error(err)
  process.exit(1)
})
