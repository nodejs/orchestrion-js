'use strict'

const { generate, generateFromPromise } = require('./instrumented.js')
const assert = require('node:assert')
const { tracingChannel } = require('node:diagnostics_channel')

function watchChannel (name) {
  let outerStart = 0
  let outerEnd = 0
  let iterStart = 0
  let iterEnd = 0
  let iterAsyncStart = 0
  let iterAsyncEnd = 0
  const asyncResults = []
  tracingChannel(`orchestrion:undici:${name}`).subscribe({
    start () { outerStart++ },
    end () { outerEnd++ }
  })
  tracingChannel(`orchestrion:undici:${name}:next`).subscribe({
    start (msg) { msg.context = {}; iterStart++ },
    end () { iterEnd++ },
    asyncStart (msg) { iterAsyncStart++; asyncResults.push(msg.result) },
    asyncEnd () { iterAsyncEnd++ }
  })
  return { get: () => ({ outerStart, outerEnd, iterStart, iterEnd, iterAsyncStart, iterAsyncEnd }), asyncResults }
}

async function assertAsyncIterValues (iter, w, baseIter) {
  const r1 = await iter.next()
  assert.deepStrictEqual(r1, { value: 10, done: false })
  assert.strictEqual(w.get().iterStart, baseIter + 1)
  assert.strictEqual(w.get().iterEnd, baseIter + 1)
  assert.strictEqual(w.get().iterAsyncStart, baseIter + 1)
  assert.strictEqual(w.get().iterAsyncEnd, baseIter + 1)
  assert.deepStrictEqual(w.asyncResults[baseIter], { value: 10, done: false })

  const r2 = await iter.next()
  assert.deepStrictEqual(r2, { value: 20, done: false })
  assert.strictEqual(w.get().iterStart, baseIter + 2)
  assert.strictEqual(w.get().iterEnd, baseIter + 2)
  assert.strictEqual(w.get().iterAsyncStart, baseIter + 2)
  assert.strictEqual(w.get().iterAsyncEnd, baseIter + 2)
  assert.deepStrictEqual(w.asyncResults[baseIter + 1], { value: 20, done: false })

  const r3 = await iter.next()
  assert.deepStrictEqual(r3, { value: undefined, done: true })
  assert.strictEqual(w.get().iterStart, baseIter + 3)
  assert.strictEqual(w.get().iterEnd, baseIter + 3)
  assert.strictEqual(w.get().iterAsyncStart, baseIter + 3)
  assert.strictEqual(w.get().iterAsyncEnd, baseIter + 3)
  assert.deepStrictEqual(w.asyncResults[baseIter + 2], { value: undefined, done: true })
}

;(async () => {
  // Sync generator returning async iterator (kind: Sync, returnKind: AsyncIterator)
  {
    const w = watchChannel('generate_async_iter')
    const iter = generate([10, 20])
    assert.strictEqual(w.get().outerStart, 1)
    assert.strictEqual(w.get().outerEnd, 1)
    assert.strictEqual(w.get().iterStart, 0)
    await assertAsyncIterValues(iter, w, 0)
  }

  // Async function returning async iterator (kind: Async, returnKind: AsyncIterator)
  {
    const w = watchChannel('generate_async_iter_async')
    const iter = await generateFromPromise([10, 20])
    assert.strictEqual(w.get().outerStart, 1)
    assert.strictEqual(w.get().outerEnd, 1)
    assert.strictEqual(w.get().iterStart, 0)
    await assertAsyncIterValues(iter, w, 0)
  }
})()
