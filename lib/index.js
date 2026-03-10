'use strict'

const { InstrumentationMatcher } = require('./matcher')

function create (configs, dcModule) {
  return new InstrumentationMatcher(configs, dcModule)
}

module.exports = { create }
