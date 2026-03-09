const { generate } = require('./instrumented.js');
const { assert, getContext } = require('../common/preamble.js');
const context = getContext('orchestrion:undici:generate');
const values = [];
for (const v of generate()) {
  values.push(v);
}
assert.deepStrictEqual(values, [1, 2, 3]);
assert.deepStrictEqual(context, { start: true, end: true });
