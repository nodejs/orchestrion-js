'use strict'

const m = require('./instrumented.js')
const assert = require('node:assert')
const { tracingChannel } = require('node:diagnostics_channel')
const { measure } = require('../common/transport_spy.js')

// Fewer, exactly as many, and more arguments than the original declares.
const SHAPES = [['fewer', [1]], ['exact', [1, 2]], ['more', [1, 2, 3, 4]]]
const EVENTS = ['start', 'end', 'asyncStart', 'asyncEnd', 'error']

function watch (name, events = EVENTS) {
  const seen = []
  const handlers = {}
  for (const event of events) handlers[event] = () => seen.push(event)
  const channel = tracingChannel(`orchestrion:undici:${name}`)
  return {
    seen,
    subscribe () { channel.subscribe(handlers) },
    unsubscribe () { channel.unsubscribe(handlers) },
  }
}

function assertParams (rec, callArgs, bDefault = 'b-default') {
  assert.strictEqual(rec.a, callArgs[0])
  assert.strictEqual(rec.b, callArgs.length > 1 ? callArgs[1] : bDefault)
  assert.deepStrictEqual(rec.rest, callArgs.slice(2))
}

function assertRecord (rec, self, callArgs, bDefault) {
  assert.strictEqual(rec.self, self)
  assert.strictEqual(rec.len, callArgs.length)
  assert.deepStrictEqual(rec.args, callArgs)
  assertParams(rec, callArgs, bDefault)
}

function callWithCallback (fn, self, callArgs, ctx) {
  return new Promise((resolve, reject) => {
    ctx.cb = (err, rec) => err ? reject(err) : resolve(rec)
    fn.call(self, ...callArgs, ctx.cb)
  })
}

function assertCallbackRecord (rec, self, callArgs, ctx, subscribed) {
  assert.strictEqual(rec.self, self)
  assert.strictEqual(rec.len, callArgs.length + 1)
  assert.deepStrictEqual(rec.args.slice(0, -1), callArgs)
  assert.strictEqual(rec.a, callArgs[0])
  if (subscribed) {
    assert.notStrictEqual(rec.cb, ctx.cb, 'subscribed calls receive the wrapped callback')
  } else {
    assert.strictEqual(rec.cb, ctx.cb, 'unsubscribed calls receive the caller\'s callback untouched')
  }
}

const self = { self: true }
const service = new m.Service()
const holder = new m.Holder()

const cases = [
  {
    channel: 'syncFn',
    events: ['start', 'end'],
    observable: true,
    call: (callArgs) => m.syncFn.call(self, ...callArgs),
    check: (rec, callArgs) => assertRecord(rec, self, callArgs),
  },
  {
    channel: 'asyncFn',
    events: ['start', 'end', 'asyncStart', 'asyncEnd'],
    observable: true,
    call: (callArgs) => m.asyncFn.call(self, ...callArgs),
    check: (rec, callArgs) => assertRecord(rec, self, callArgs),
  },
  {
    channel: 'callbackFn',
    events: ['start', 'asyncStart', 'asyncEnd', 'end'],
    observable: true,
    call: (callArgs, ctx) => callWithCallback(m.callbackFn, self, callArgs, ctx),
    check: (rec, callArgs, { ctx, subscribed }) => assertCallbackRecord(rec, self, callArgs, ctx, subscribed),
  },
  {
    channel: 'autoFn',
    label: 'autoFn (callback)',
    events: ['start', 'asyncStart', 'asyncEnd', 'end'],
    observable: true,
    call: (callArgs, ctx) => callWithCallback(m.autoFn, self, callArgs, ctx),
    check: (rec, callArgs, { ctx, subscribed }) => assertCallbackRecord(rec, self, callArgs, ctx, subscribed),
  },
  {
    channel: 'autoFn',
    label: 'autoFn (promise)',
    events: ['start', 'end', 'asyncStart', 'asyncEnd'],
    observable: true,
    call: (callArgs) => m.autoFn.call(self, ...callArgs),
    check: (rec, callArgs) => {
      assert.strictEqual(rec.self, self)
      assert.strictEqual(rec.len, callArgs.length)
      assert.deepStrictEqual(rec.args, callArgs)
    },
  },
  {
    channel: 'iterFn',
    events: ['start', 'end'],
    observable: true,
    call: (callArgs) => m.iterFn.call(self, ...callArgs),
    check: (iter, callArgs, { label }) => {
      // Only the main channel is subscribed here, never `:next`, so `next`
      // must forward its argument without building `__apm$iterArgs`.
      const first = measure(() => iter.next())
      assert.strictEqual(first.slice, 0, `${label}: next() copied its arguments`)
      assert.strictEqual(first.value.value.self, self)
      assert.deepStrictEqual(first.value.value.args, callArgs)
      const second = measure(() => iter.next('sent'))
      assert.strictEqual(second.slice, 0, `${label}: next('sent') copied its arguments`)
      assert.deepStrictEqual(second.value, { value: 'sent', done: false })
    },
  },
  {
    channel: 'asyncIterFn',
    events: ['start', 'end'],
    observable: true,
    call: (callArgs) => m.asyncIterFn.call(self, ...callArgs),
    check: async (iter, callArgs, { label }) => {
      const first = measure(() => iter.next())
      assert.strictEqual(first.slice, 0, `${label}: next() copied its arguments`)
      const { value: rec } = await first.value
      assert.strictEqual(rec.self, self)
      assert.deepStrictEqual(rec.args, callArgs)
      const second = measure(() => iter.next('sent'))
      assert.strictEqual(second.slice, 0, `${label}: next('sent') copied its arguments`)
      assert.deepStrictEqual(await second.value, { value: 'sent', done: false })
    },
  },
  {
    channel: 'arrowFn',
    events: ['start', 'end'],
    observable: false,
    call: (callArgs) => m.arrowFn(...callArgs),
    check: (rec, callArgs) => assertParams(rec, callArgs),
  },
  {
    channel: 'Service_method',
    events: ['start', 'end'],
    observable: true,
    call: (callArgs) => service.method(...callArgs),
    check: (rec, callArgs) => assertRecord(rec, service, callArgs),
  },
  {
    channel: 'Holder_run',
    events: ['start', 'end'],
    observable: true,
    call: (callArgs) => holder.run(...callArgs),
    check: (rec, callArgs) => assertRecord(rec, holder, callArgs),
  },
  {
    channel: 'Base_ctor',
    events: ['start', 'end'],
    observable: false,
    call: (callArgs) => new m.Base(...callArgs),
    check: (instance, callArgs) => {
      assert.ok(instance instanceof m.Base)
      assert.strictEqual(instance.newTarget, m.Base)
      assertRecord(instance.base, undefined, callArgs)
    },
  },
  {
    // Also guards the derived-constructor fast path against a TDZ error if a
    // binding assigned at the `super()` call site is ever declared below the
    // subscriber check.
    channel: 'Derived_ctor',
    events: ['start', 'end'],
    observable: false,
    call: (callArgs) => new m.Derived(...callArgs),
    check: (instance, callArgs) => {
      assert.ok(instance instanceof m.Derived)
      assert.ok(instance instanceof m.Base)
      assert.strictEqual(instance.newTarget, m.Derived)
      assertRecord(instance.derived, undefined, callArgs, 'd-default')
      const superArgs = [callArgs[0], callArgs.length > 1 ? callArgs[1] : 'd-default', ...callArgs.slice(2)]
      assertRecord(instance.base, undefined, superArgs)
    },
  },
]

async function runCase (c) {
  const label = c.label ?? c.channel
  const w = watch(c.channel)
  // Unsubscribed, then subscribed, then unsubscribed again.
  const phases = [['before', false], ['subscribed', true], ['after', false]]
  for (const [phase, subscribed] of phases) {
    if (phase === 'subscribed') w.subscribe()
    if (phase === 'after') w.unsubscribe()
    for (const [shape, callArgs] of SHAPES) {
      const info = { label: `${label} ${phase} ${shape}`, subscribed, ctx: {} }
      w.seen.length = 0
      const { value, slice, at } = measure(() => c.call(callArgs, info.ctx))
      if (!subscribed) {
        assert.strictEqual(slice, 0, `${info.label}: built the arguments array`)
        assert.strictEqual(at, 0, `${info.label}: looked up the callback`)
      } else if (c.observable) {
        assert.ok(slice + at > 0, `${info.label}: expected the subscribed path to build its transport`)
      }
      await c.check(await value, callArgs, info)
      assert.deepStrictEqual(w.seen, subscribed ? c.events : [], info.label)
    }
  }
}

;(async () => {
  assert.strictEqual(m.syncFn.length, 1)
  assert.strictEqual(m.callbackFn.length, 2)
  assert.strictEqual(holder.run.length, 1)

  for (const c of cases) await runCase(c)

  // Iterator `next` once `:next` is subscribed: traced, and its argument is
  // still forwarded.
  {
    const main = watch('iterFn')
    const next = watch('iterFn:next', ['start', 'end'])
    main.subscribe()
    next.subscribe()
    const iter = m.iterFn.call(self, 1)
    iter.next()
    assert.deepStrictEqual(iter.next('sent'), { value: 'sent', done: false })
    assert.deepStrictEqual(next.seen, ['start', 'end', 'start', 'end'])
    next.unsubscribe()
    assert.deepStrictEqual(iter.next('more'), { value: undefined, done: true })
    assert.deepStrictEqual(next.seen, ['start', 'end', 'start', 'end'])
    main.unsubscribe()
  }

  // Callback/Auto with only `asyncEnd` subscribed. Pins existing behaviour:
  // the callback paths still only trace when `start` has subscribers, while
  // the Auto promise fallback traces when any event does.
  {
    const w = watch('callbackFn', ['asyncEnd'])
    w.subscribe()
    const ctx = {}
    const rec = await callWithCallback(m.callbackFn, self, [1], ctx)
    assert.strictEqual(rec.cb, ctx.cb)
    assert.deepStrictEqual(w.seen, [])
    w.unsubscribe()
  }
  {
    const w = watch('autoFn', ['asyncEnd'])
    w.subscribe()
    const ctx = {}
    const rec = await callWithCallback(m.autoFn, self, [1], ctx)
    assert.strictEqual(rec.cb, ctx.cb)
    assert.deepStrictEqual(w.seen, [])

    const promised = await m.autoFn.call(self, 1)
    assert.deepStrictEqual(promised.args, [1])
    assert.deepStrictEqual(w.seen, ['asyncEnd'])
    w.unsubscribe()
  }
})().catch((err) => {
  console.error(err)
  process.exit(1)
})
