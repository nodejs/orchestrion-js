'use strict'

const semifies = require('semifies')
const { Transformer } = require('./transformer')

/**
 * Matches instrumentation configs against a given module/file/version triple and
 * returns a cached {@link Transformer} for matching configs.
 */
class InstrumentationMatcher {
  #configs = []
  #dcModule = null
  #transformers = {}
  #customTransforms = {}

  /**
   * @param {object[]} configs - Array of instrumentation configuration objects.
   * @param {string} [dcModule] - The diagnostics_channel module specifier to inject.
   *   Defaults to `'diagnostics_channel'`.
   */
  constructor (configs, dcModule) {
    this.#configs = configs
    this.#dcModule = dcModule || 'diagnostics_channel'
  }

  /** Releases all cached transformers, freeing any associated resources. */
  free () {
    this.#transformers = {}
  }

  /**
   * Registers a custom transform function under the given operator name.
   *
   * Custom transforms override built-in ones when an instrumentation config
   * specifies the same `transform` value.
   *
   * @param {string} name - Operator name (e.g. `'traceSync'`).
   * @param {Function} fn - Transform function `(state, node, parent, ancestry) => void`.
   */
  addTransform (name, fn) {
    this.#customTransforms[name] = fn
  }

  /**
   * Returns a {@link Transformer} for the given module/file/version, or `undefined`
   * if no registered config matches.
   *
   * Results are cached by a `moduleName/filePath@version` key.
   *
   * @param {string} moduleName - The npm package name (e.g. `'express'`).
   * @param {string} version - The installed semver version string.
   * @param {string} filePath - The relative file path within the package.
   * @returns {import('./transformer').Transformer|undefined}
   */
  getTransformer (moduleName, version, filePath) {
    filePath = filePath.replace(/\\/g, '/')

    const id = `${moduleName}/${filePath}@${version}`

    if (this.#transformers[id]) return this.#transformers[id]

    const configs = this.#configs.filter(({ module: mod }) =>
      mod.name === moduleName &&
      mod.filePath === filePath &&
      semifies(version, mod.versionRange)
    )

    if (configs.length === 0) return

    this.#transformers[id] = new Transformer(
      moduleName,
      version,
      filePath,
      configs,
      this.#dcModule,
      this.#customTransforms
    )

    return this.#transformers[id]
  }
}

module.exports = { InstrumentationMatcher }
