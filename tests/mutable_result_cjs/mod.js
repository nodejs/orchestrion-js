function create (instance, callback) {
  // Returns a per-request handler that closes over `instance`/`callback`,
  // mirroring NestJS `RouterExecutionContext.create`. A subscriber needs to
  // replace this returned function with a span-wrapping version.
  return function handler (req) {
    return callback.call(instance, req)
  }
}

function compute (x) {
  return x + 1
}

function boom () {
  throw new Error('boom')
}

module.exports = { create, compute, boom }
