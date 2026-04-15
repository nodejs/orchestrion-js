const assert = require('node:assert')

class Base {}

class Undici extends Base {
  async fetch (url, tag) {
    assert.strictEqual(url, 'https://example.com')
    assert.strictEqual(tag, 'mutated')
    return 42
  }
}

module.exports = { Undici }
