'use strict'

const { execute } = require('./instrumented.js')
const { assert, getContext } = require('../common/preamble.js')
const context = getContext('orchestrion:undici:execute')

// The outer wrapper must still expose the author's declared arity.
assert.strictEqual(execute.length, 8)

// Single-arg call must take the object-form branch. Before the slice-based
// preamble, `arguments.length` inside the wrapped body was always 8, so this
// call silently took the positional branch and crashed on `undefined.marker`.
assert.strictEqual(execute({ marker: 'x' }), 'object-form:x')

// Multi-arg call must take the positional branch.
assert.strictEqual(execute('schema', 'doc'), 'positional-form:schema,doc')

// Last-call context reflects the positional branch's return value.
assert.deepStrictEqual(context, {
  start: true,
  end: 'positional-form:schema,doc'
})
