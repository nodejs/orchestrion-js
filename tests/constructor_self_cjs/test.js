/**
 * Unless explicitly stated otherwise all files in this repository are licensed under the Apache-2.0 License.
 * This product includes software developed at Datadog (https://www.datadoghq.com/). Copyright 2025 Datadog, Inc.
 **/
const Undici = require('./instrumented.js')
const assert = require('node:assert')
const { tracingChannel } = require('node:diagnostics_channel')

const ends = []
tracingChannel('orchestrion:undici:Undici_constructor').subscribe({
  end (message) {
    ends.push(message)
  }
})

const undici = new Undici(42)
assert.strictEqual(undici.val, 42)
assert.strictEqual(undici.base, 42)
assert.strictEqual(ends.length, 1)
assert.strictEqual(ends[0].self, undici)

// A throw before `super()` leaves `this` unbound, so the wrapper must not read
// it. If it does, the original error is replaced by a ReferenceError.
assert.throws(() => new Undici('boom'), (err) => {
  assert.strictEqual(err.constructor, Error)
  assert.strictEqual(err.message, 'boom')
  return true
})
assert.strictEqual(ends.length, 2)
assert.strictEqual(ends[1].self, undefined)
