'use strict'

// Every original records what it was actually called with, so the test can
// compare the unsubscribed fast path against the subscribed path.
function record (self, args, named) {
  return { self, len: args.length, args: Array.from(args), ...named }
}

function syncFn (a, b = 'b-default', ...rest) {
  return record(this, arguments, { a, b, rest })
}

async function asyncFn (a, b = 'b-default', ...rest) {
  return record(this, arguments, { a, b, rest })
}

function callbackFn (a, cb) {
  const cbArg = arguments[arguments.length - 1]
  cbArg(null, record(this, arguments, { a, cb: cbArg }))
}

function autoFn (a, cb) {
  const last = arguments[arguments.length - 1]
  if (typeof last === 'function') {
    last(null, record(this, arguments, { a, cb: last }))
  } else {
    return Promise.resolve(record(this, arguments, { a }))
  }
}

function * iterFn (a) {
  const sent = yield record(this, arguments, { a })
  yield sent
}

async function * asyncIterFn (a) {
  const sent = yield record(this, arguments, { a })
  yield sent
}

const arrowFn = (a, b = 'b-default', ...rest) => ({ a, b, rest })

class Service {
  method (a, b = 'b-default', ...rest) {
    return record(this, arguments, { a, b, rest })
  }
}

class Base {
  constructor (a, b = 'b-default', ...rest) {
    this.base = record(undefined, arguments, { a, b, rest })
    this.newTarget = new.target
  }
}

class Derived extends Base {
  constructor (a, b = 'd-default', ...rest) {
    super(a, b, ...rest)
    this.derived = record(undefined, arguments, { a, b, rest })
  }
}

// Not declared on the class body, so it is patched onto the instance from a
// synthesised constructor at runtime.
class Holder {}
Holder.prototype.run = function (a, b = 'b-default', ...rest) {
  return record(this, arguments, { a, b, rest })
}

module.exports = {
  syncFn,
  asyncFn,
  callbackFn,
  autoFn,
  iterFn,
  asyncIterFn,
  arrowFn,
  Service,
  Base,
  Derived,
  Holder,
}
