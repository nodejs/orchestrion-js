// This test guards that the name-based `functionQuery` variants match
// synchronous functions: the `[async]` token in the generated selectors
// is a structural "is-a-function-node" existence check (every function
// node has an `async` field), NOT an async-only filter.
const { fetchExpr, client } = require('./instrumented.js')
const { assert, getContext } = require('../common/preamble.js')

// expressionName, kind: 'Sync' matched, fetchExpr is not async.
const exprCtx = getContext('orchestrion:undici:fetch_expr_sync')
assert.strictEqual(fetchExpr(1), 2)
assert.deepStrictEqual(exprCtx, { start: true, end: 2 })

// methodName (object method), kind: 'Sync' matched, query is not async.
const methodCtx = getContext('orchestrion:undici:client_query_sync')
assert.strictEqual(client.query(3), 6)
assert.deepStrictEqual(methodCtx, { start: true, end: 6 })
