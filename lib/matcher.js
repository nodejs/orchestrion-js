'use strict'

const semifies = require('semifies')
const { Transformer } = require('./transformer')

class InstrumentationMatcher {
  #configs = []
  #dcModule = null
  #transformers = {}
  #customTransforms = {}

  constructor (configs, dcModule) {
    this.#configs = configs
    this.#dcModule = dcModule || 'diagnostics_channel'
  }

  free () {
    this.#transformers = {}
  }

  addTransform (name, fn) {
    this.#customTransforms[name] = fn
  }

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
