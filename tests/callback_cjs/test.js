const { fetch } = require('./instrumented.js');
const { assert, getContext } = require('../common/preamble.js');
const context = getContext('orchestrion:undici:fetch_cb');
(async () => {
  const result = await new Promise((resolve, reject) => {
    fetch('https://example.com', (err, val) => {
      if (err) reject(err);
      else resolve(val);
    });
  });
  assert.strictEqual(result, 42);
  assert.deepStrictEqual(context, {
    start: true,
    end: true,
    asyncStart: 42,
    asyncEnd: 42,
  });
})();
