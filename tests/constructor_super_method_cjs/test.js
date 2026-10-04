/**
 * Unless explicitly stated otherwise all files in this repository are licensed under the Apache-2.0 License.
 * This product includes software developed at Datadog (https://www.datadoghq.com/). Copyright 2025 Datadog, Inc.
 **/
const Undici = require('./instrumented.js')
const { assert, getContext } = require('../common/preamble.js')
const context = getContext('orchestrion:undici:Undici_constructor');

// `super.greet()` uses `this` as the receiver, so it only works after the
// body's own `super()` call. The wrapper must leave it where it was.
(() => {
  const undici = new Undici(42)
  assert.strictEqual(undici.base, 42)
  assert.strictEqual(undici.val, 'hi 42')
  assert.deepStrictEqual(context, {
    start: true,
    end: true
  })
})()
