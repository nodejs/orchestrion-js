'use strict'

const runtimeRequire = typeof __webpack_require__ === 'function' ? __non_webpack_require__ : require

const { ORCHESTRION_PARSER } = process.env

const compiler = {
  parse: (sourceText, options) => {
    const useOxc = () => {
      // TODO: Figure out ESBuild `createRequire` issue and remove this hack.
      const oxc = runtimeRequire(['oxc', 'parser'].join('-'))

      compiler.parse = (sourceText, options) => {
        const { program, errors } = oxc.parseSync('index.js', sourceText, {
          ...options,
          preserveParens: false,
        })

        if (errors?.length > 0) throw errors[0]

        if (options?.range) addLoc(program, sourceText.toString())

        return program
      }
    }

    const useMeriyah = () => {
      const meriyah = require('meriyah')

      compiler.parse = (sourceText, { range, sourceType } = {}) => {
        return meriyah.parse(sourceText.toString(), {
          loc: range,
          ranges: range,
          raw: true,
          module: sourceType === 'module',
        })
      }
    }

    if (ORCHESTRION_PARSER === 'meriyah') {
      useMeriyah()
    } else {
      try {
        useOxc()
      } catch (e) {
        if (ORCHESTRION_PARSER === 'oxc') throw e
        useMeriyah() // Fallback for when OXC is not available.
      }
    }

    return compiler.parse(sourceText, options)
  },

  generate: (...args) => {
    const astring = require('astring')

    compiler.generate = astring.generate

    return compiler.generate(...args)
  },

  traverse: (ast, query, visitor) => {
    const esquery = require('esquery')

    compiler.traverse = (ast, query, visitor) => {
      return esquery.traverse(ast, esquery.parse(query), visitor)
    }

    return compiler.traverse(ast, query, visitor)
  },

  query: (ast, query) => {
    const esquery = require('esquery')

    compiler.query = esquery.query

    return compiler.query(ast, query)
  },
}

function addLoc (node, sourceText) {
  const lineOffsets = [0]
  for (let i = 0; i < sourceText.length; i++) {
    if (sourceText[i] === '\n') lineOffsets.push(i + 1)
  }
  const offsetToLoc = (offset) => {
    let lo = 0, hi = lineOffsets.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (lineOffsets[mid] <= offset) lo = mid; else hi = mid - 1
    }
    return { line: lo + 1, column: offset - lineOffsets[lo] }
  }

  compiler.traverse(node, '*', (node) => {
    if ('start' in node && !node.loc) {
      node.loc = { start: offsetToLoc(node.start), end: offsetToLoc(node.end) }
    }
  })
}

module.exports = {
  parse: (...args) => compiler.parse(...args),
  generate: (...args) => compiler.generate(...args),
  traverse: (...args) => compiler.traverse(...args),
  query: (...args) => compiler.query(...args),
}
