'use strict'

const { generate } = require('./instrumented.js')
const assert = require('node:assert')
const { tracingChannel } = require('node:diagnostics_channel')

let outerStart = 0
let outerEnd = 0
let iterStart = 0
let iterEnd = 0
const iterResults = []

tracingChannel('orchestrion:undici:generate_iter').subscribe({
  start () { outerStart++ },
  end () { outerEnd++ }
})

tracingChannel('orchestrion:undici:generate_iter:next').subscribe({
  start (msg) { msg.context = {}; iterStart++ },
  end (msg) { iterEnd++; iterResults.push(msg.result) }
})

const iter = generate([10, 20])
assert.strictEqual(outerStart, 1, 'outer start fires when generator is called')
assert.strictEqual(outerEnd, 1, 'outer end fires when generator is called')
assert.strictEqual(iterStart, 0, 'no iter events before next() is called')

const r1 = iter.next()
assert.deepStrictEqual(r1, { value: 10, done: false })
assert.strictEqual(iterStart, 1)
assert.strictEqual(iterEnd, 1)
assert.deepStrictEqual(iterResults[0], { value: 10, done: false })

const r2 = iter.next()
assert.deepStrictEqual(r2, { value: 20, done: false })
assert.strictEqual(iterStart, 2)
assert.strictEqual(iterEnd, 2)
assert.deepStrictEqual(iterResults[1], { value: 20, done: false })

const r3 = iter.next()
assert.deepStrictEqual(r3, { value: undefined, done: true })
assert.strictEqual(iterStart, 3)
assert.strictEqual(iterEnd, 3)
assert.deepStrictEqual(iterResults[2], { value: undefined, done: true })
