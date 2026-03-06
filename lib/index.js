'use strict'

const { InstrumentationMatcher } = require('./matcher')

function create (configs, dc_module) {
  return new InstrumentationMatcher(configs, dc_module)
}

module.exports = { create }
