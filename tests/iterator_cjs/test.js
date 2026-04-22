'use strict'

const { generate, generateFromPromise, generateCallback, generateAuto } = require('./instrumented.js')
const assert = require('node:assert')
const { tracingChannel } = require('node:diagnostics_channel')

function watchChannel (name) {
  let outerStart = 0
  let outerEnd = 0
  let iterStart = 0
  let iterEnd = 0
  const iterResults = []
  tracingChannel(`orchestrion:undici:${name}`).subscribe({
    start () { outerStart++ },
    end () { outerEnd++ }
  })
  tracingChannel(`orchestrion:undici:${name}:next`).subscribe({
    start (msg) { msg.context = {}; iterStart++ },
    end (msg) { iterEnd++; iterResults.push(msg.result) }
  })
  return { get: () => ({ outerStart, outerEnd, iterStart, iterEnd }), iterResults }
}

function assertIterValues (iter, w, baseIter) {
  const r1 = iter.next()
  assert.deepStrictEqual(r1, { value: 10, done: false })
  assert.strictEqual(w.get().iterStart, baseIter + 1)
  assert.strictEqual(w.get().iterEnd, baseIter + 1)
  assert.deepStrictEqual(w.iterResults[baseIter], { value: 10, done: false })

  const r2 = iter.next()
  assert.deepStrictEqual(r2, { value: 20, done: false })
  assert.strictEqual(w.get().iterStart, baseIter + 2)
  assert.strictEqual(w.get().iterEnd, baseIter + 2)
  assert.deepStrictEqual(w.iterResults[baseIter + 1], { value: 20, done: false })

  const r3 = iter.next()
  assert.deepStrictEqual(r3, { value: undefined, done: true })
  assert.strictEqual(w.get().iterStart, baseIter + 3)
  assert.strictEqual(w.get().iterEnd, baseIter + 3)
  assert.deepStrictEqual(w.iterResults[baseIter + 2], { value: undefined, done: true })
}

;(async () => {
  // Sync generator (kind: Sync, returnKind: Iterator)
  {
    const w = watchChannel('generate_iter')
    const iter = generate([10, 20])
    assert.strictEqual(w.get().outerStart, 1)
    assert.strictEqual(w.get().outerEnd, 1)
    assert.strictEqual(w.get().iterStart, 0)
    assertIterValues(iter, w, 0)
  }

  // Async function returning sync iterator (kind: Async, returnKind: Iterator)
  {
    const w = watchChannel('generate_iter_async')
    const iter = await generateFromPromise([10, 20])
    assert.strictEqual(w.get().outerStart, 1)
    assert.strictEqual(w.get().outerEnd, 1)
    assert.strictEqual(w.get().iterStart, 0)
    assertIterValues(iter, w, 0)
  }

  // Callback function returning sync iterator (kind: Callback, returnKind: Iterator)
  // outerEnd fires after the wrapped callback returns, so check it after the promise resolves
  {
    const w = watchChannel('generate_iter_cb')
    await new Promise((resolve, reject) => {
      generateCallback([10, 20], (err, iter) => {
        if (err) return reject(err)
        try {
          assert.strictEqual(w.get().outerStart, 1)
          assert.strictEqual(w.get().iterStart, 0)
          assertIterValues(iter, w, 0)
          resolve()
        } catch (e) {
          reject(e)
        }
      })
    })
    assert.strictEqual(w.get().outerEnd, 1)
  }

  // Auto function, promise path then callback path (kind: Auto, returnKind: Iterator)
  // Both paths share the same channel so counters accumulate across both calls
  {
    const w = watchChannel('generate_iter_auto')

    const iter = await generateAuto([10, 20])
    assert.strictEqual(w.get().outerStart, 1)
    assert.strictEqual(w.get().outerEnd, 1)
    assert.strictEqual(w.get().iterStart, 0)
    assertIterValues(iter, w, 0)

    await new Promise((resolve, reject) => {
      generateAuto([10, 20], (err, iter2) => {
        if (err) return reject(err)
        try {
          assert.strictEqual(w.get().outerStart, 2)
          assert.strictEqual(w.get().iterStart, 3)
          assertIterValues(iter2, w, 3)
          resolve()
        } catch (e) {
          reject(e)
        }
      })
    })
    assert.strictEqual(w.get().outerEnd, 2)
  }
})()
