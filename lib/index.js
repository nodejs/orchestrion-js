'use strict'

const { InstrumentationMatcher } = require('./matcher')

/**
 * Creates a new {@link InstrumentationMatcher} from the given instrumentation configs.
 *
 * @param {object[]} configs - Instrumentation configuration objects.
 * @param {string} [dcModule] - The diagnostics_channel module specifier to use for imports.
 *   Deprecated: pass `dcModule` via each config's `dcModule` field instead.
 * @returns {InstrumentationMatcher}
 */
function create (configs, dcModule) {
  return new InstrumentationMatcher(configs, dcModule)
}

module.exports = { create }
