'use strict'

// Arrow function assigned to `this` inside a constructor, with arguments.
// Without the ArrowFunctionExpression → FunctionExpression conversion,
// `arguments` inside the wrapper resolves to the constructor's arguments
// (the opts object) rather than the actual call-site arguments (sql).
function Connection (opts) {
  this._query = async (sql) => {
    return sql
  }
}

module.exports = { Connection }
