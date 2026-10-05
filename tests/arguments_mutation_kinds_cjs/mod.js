'use strict'

function syncFn (a, ...rest) {
  return { self: this, a, rest, len: arguments.length }
}

async function asyncFn (a, ...rest) {
  return { self: this, a, rest, len: arguments.length }
}

function callbackFn (a, cb) {
  cb(null, { self: this, a, len: arguments.length })
}

class Base {
  constructor (a, ...rest) {
    this.a = a
    this.rest = rest
  }
}

class Derived extends Base {
  constructor (a, ...rest) {
    super(a, ...rest)
    this.derivedA = a
    this.derivedRest = rest
  }
}

module.exports = { syncFn, asyncFn, callbackFn, Base, Derived }
