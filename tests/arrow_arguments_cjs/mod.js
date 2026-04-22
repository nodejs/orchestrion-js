'use strict'

// Two methods assigned to `this` inside a constructor that takes 2 arguments.
// The arrow function doesn't bind its own `arguments`, so `arguments.length`
// inside it refers to the constructor's argument count (2), not the call-site
// count (1). The regular function binds its own `arguments`, so it sees the
// call-site count (1). Instrumentation must not change either binding.
// Both functions declare extra parameters to ensure parameter count does not
// affect the reported arguments length.
function Connection (host, port) {
  this.fetchArrow = async (sql, extra1, extra2) => {
    return arguments.length
  }

  this.fetchFunction = async function (sql, extra1, extra2) {
    return arguments.length
  }
}

module.exports = { Connection }
