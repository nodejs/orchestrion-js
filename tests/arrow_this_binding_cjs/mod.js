'use strict'

// Verifies that lexical `this` and call-site arguments are both preserved
// correctly when an arrow function assigned to `this` is wrapped.
function Connection (opts) {
  this.prefix = 'result:'
  this._query = async (sql) => {
    return this.prefix + sql
  }
}

module.exports = { Connection }
