'use strict'

async function * generate (values) {
  for (const value of values) {
    yield value
  }
}

async function generateFromPromise (values) {
  async function * gen () {
    for (const value of values) {
      yield value
    }
  }
  return gen()
}

module.exports = { generate, generateFromPromise }
