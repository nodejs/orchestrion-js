'use strict'

function * generate (values) {
  for (const value of values) {
    yield value
  }
}

async function generateFromPromise (values) {
  return values[Symbol.iterator]()
}

function generateCallback (values, cb) {
  cb(null, values[Symbol.iterator]())
}

function generateAuto (values, cb) {
  const iter = values[Symbol.iterator]()
  if (typeof cb === 'function') {
    cb(null, iter)
  } else {
    return Promise.resolve(iter)
  }
}

module.exports = { generate, generateFromPromise, generateCallback, generateAuto }
