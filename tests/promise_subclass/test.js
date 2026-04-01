/**
 * Unless explicitly stated otherwise all files in this repository are licensed under the Apache-2.0 License.
 * This product includes software developed at Datadog (https://www.datadoghq.com/). Copyright 2025 Datadog, Inc.
 **/
const { fetch } = require('./instrumented.js')
const { assert, getContext } = require('../common/preamble.js')
const context = getContext('orchestrion:undici:fetch_subclass');
(async () => {
  const promise = fetch('https://example.com')
  // The instrumented wrapper must return the original promise, not promise.then(),
  // so subclass methods like withResponse() remain accessible.
  assert.strictEqual(typeof promise.withResponse, 'function', 'withResponse should be available on the returned promise')
  const { data } = await promise.withResponse()
  assert.strictEqual(data, 42)
  assert.deepStrictEqual(context, {
    start: true,
    end: true,
    asyncStart: 42,
    asyncEnd: 42
  })
})()
