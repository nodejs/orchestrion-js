'use strict'

function * generate (values) {
  for (const value of values) {
    yield value
  }
}

module.exports = { generate }
