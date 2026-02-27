/**
 * Unless explicitly stated otherwise all files in this repository are licensed under the Apache-2.0 License.
 * This product includes software developed at Datadog (https://www.datadoghq.com/). Copyright 2025 Datadog, Inc.
 **/
const Streamer = require('./instrumented.js');
const { assert, getContext } = require('../common/preamble.js');
const context = getContext('orchestrion:undici:Streamer:generate');
(async () => {
  const streamer = new Streamer;
  const values = [];
  for await (const val of streamer.generate(3)) {
    values.push(val);
  }
  assert.deepStrictEqual(values, [0, 1, 2]);
  assert.deepStrictEqual(context, {
    start: true,
    end: true,
  });
})();
