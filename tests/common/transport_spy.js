/**
 * Unless explicitly stated otherwise all files in this repository are licensed under the Apache-2.0 License.
 * This product includes software developed at Datadog (https://www.datadoghq.com/). Copyright 2025 Datadog, Inc.
 **/
'use strict'

// The wrappers build their per-call transport with `[...].slice(...)`
// (`__apm$arguments`), `Array.prototype.at.call(...)` (callback lookup) and
// `Array.prototype.slice.call(arguments)` (iterator `next` arguments). Counting
// those calls while a single wrapped call runs synchronously tells us whether
// the wrapper took the no-subscriber fast path or built the transport.
//
// Replacing the prototype methods is process-wide, so keep the window small:
// they are only swapped for one synchronous call and always restored, and each
// fixture runs in its own `node` process. Callers should only assert zero
// counts on the fast path and a non-zero count on the subscribed path, never
// exact numbers. The "fast path ordering" test in tests.test.mjs checks the
// same property on the generated code without patching anything.
const { slice, at } = Array.prototype

function measure (fn) {
  const counts = { slice: 0, at: 0 }
  Array.prototype.slice = function (...args) { // eslint-disable-line no-extend-native
    counts.slice++
    return slice.apply(this, args)
  }
  Array.prototype.at = function (...args) { // eslint-disable-line no-extend-native
    counts.at++
    return at.apply(this, args)
  }
  let value
  try {
    value = fn()
  } finally {
    Array.prototype.slice = slice // eslint-disable-line no-extend-native
    Array.prototype.at = at // eslint-disable-line no-extend-native
  }
  return { value, slice: counts.slice, at: counts.at }
}

module.exports = { measure }
