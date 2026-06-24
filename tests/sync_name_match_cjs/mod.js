// A synchronous function expression and a synchronous object method.
// This fixture guards that the name-based `functionQuery` variants match
// synchronous functions: the `[async]` token in the generated selectors
// is a structural "is-a-function-node" existence check (every function
// node has an `async` field), NOT an async-only filter.
const fetchExpr = function fetchExpr (x) {
  return x + 1
}

const client = {
  query (x) {
    return x * 2
  }
}

module.exports = { fetchExpr, client }
