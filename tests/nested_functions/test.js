/**
 * Unless explicitly stated otherwise all files in this repository are licensed under the Apache-2.0 License.
 * This product includes software developed at Datadog (https://www.datadoghq.com/). Copyright 2025 Datadog, Inc.
 **/
const fastify = require('./instrumented.js')
const { assert, getContext } = require('../common/preamble.js')
const context = getContext('orchestrion:undici:nested_fn');
(async () => {
  const f = fastify()
  const result = f.addHook()
  assert.strictEqual(result, 'Hook added')
  assert.deepStrictEqual(context, {
    start: true,
    end: 'Hook added'
  })
})()
