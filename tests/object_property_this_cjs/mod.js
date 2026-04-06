'use strict'

// Mimics the mariadb v2 pattern: query methods are arrow functions
// assigned to `this` inside a function constructor.
function Connection (opts) {
  this._query = async () => {
    return 42
  }
}

module.exports = { Connection }
