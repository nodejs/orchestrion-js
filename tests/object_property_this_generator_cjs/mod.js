'use strict'

function Connection () {
  this.generate = function * () {
    yield 1
    yield 2
    yield 3
  }
}

module.exports = { Connection }
