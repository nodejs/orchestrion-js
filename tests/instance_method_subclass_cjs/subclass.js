const assert = require('node:assert')
const { Base } = require('./instrumented.js')

class Undici extends Base {
  async fetch (url, tag) {
    assert.strictEqual(url, 'https://example.com')
    assert.strictEqual(tag, 'mutated')
    return 42
  }
}

module.exports = { Undici }
