'use strict'

const { generate } = require('./instrumented.js')
const assert = require('node:assert')
const { tracingChannel } = require('node:diagnostics_channel')

let outerStart = 0
let outerEnd = 0
let iterStart = 0
let iterEnd = 0
let iterAsyncStart = 0
let iterAsyncEnd = 0
const asyncResults = []

tracingChannel('orchestrion:undici:generate_async_iter').subscribe({
  start () { outerStart++ },
  end () { outerEnd++ }
})

tracingChannel('orchestrion:undici:generate_async_iter:next').subscribe({
  start (msg) { msg.context = {}; iterStart++ },
  end () { iterEnd++ },
  asyncStart (msg) { iterAsyncStart++; asyncResults.push(msg.result) },
  asyncEnd () { iterAsyncEnd++ }
});

(async () => {
  const iter = generate([10, 20])
  assert.strictEqual(outerStart, 1, 'outer start fires when async generator is called')
  assert.strictEqual(outerEnd, 1, 'outer end fires when async generator is called')
  assert.strictEqual(iterStart, 0, 'no iter events before next() is called')

  const r1 = await iter.next()
  assert.deepStrictEqual(r1, { value: 10, done: false })
  assert.strictEqual(iterStart, 1)
  assert.strictEqual(iterEnd, 1)
  assert.strictEqual(iterAsyncStart, 1)
  assert.strictEqual(iterAsyncEnd, 1)
  assert.deepStrictEqual(asyncResults[0], { value: 10, done: false })

  const r2 = await iter.next()
  assert.deepStrictEqual(r2, { value: 20, done: false })
  assert.strictEqual(iterStart, 2)
  assert.strictEqual(iterEnd, 2)
  assert.strictEqual(iterAsyncStart, 2)
  assert.strictEqual(iterAsyncEnd, 2)
  assert.deepStrictEqual(asyncResults[1], { value: 20, done: false })

  const r3 = await iter.next()
  assert.deepStrictEqual(r3, { value: undefined, done: true })
  assert.strictEqual(iterStart, 3)
  assert.strictEqual(iterEnd, 3)
  assert.strictEqual(iterAsyncStart, 3)
  assert.strictEqual(iterAsyncEnd, 3)
  assert.deepStrictEqual(asyncResults[2], { value: undefined, done: true })
})()
