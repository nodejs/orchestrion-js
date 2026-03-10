'use strict'

// eslint-disable-next-line camelcase, no-undef
const runtimeRequire = typeof __webpack_require__ === 'function' ? __non_webpack_require__ : require

const { ORCHESTRION_PARSER } = process.env

/**
 * Lazy-initializing compiler facade. Each method replaces itself on first call with a
 * concrete implementation so that parsers/generators are only loaded when needed.
 */
const compiler = {
  /**
   * Parses JavaScript source text into an ESTree AST.
   *
   * Uses OXC by default with meriyah as a fallback (or as the primary parser when
   * `ORCHESTRION_PARSER=meriyah`). On the first call the concrete parse function is
   * selected and stored back on `compiler.parse` so subsequent calls skip the
   * selection logic.
   *
   * @param {string|Buffer} sourceText - JavaScript source to parse.
   * @param {{ range?: boolean, sourceType?: 'module'|'script' }} [options]
   * @returns {import('estree').Program}
   */
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

  /**
   * Generates JavaScript source text from an ESTree AST node.
   *
   * Delegates to `astring.generate`. Replaces itself with the bound astring function
   * after the first call.
   *
   * @param {import('estree').Node} node
   * @param {object} [options] - astring generator options (e.g. `{ sourceMap }`).
   * @returns {string}
   */
  generate: (...args) => {
    const astring = require('astring')

    compiler.generate = astring.generate

    return compiler.generate(...args)
  },

  /**
   * Traverses an AST, calling `visitor` for each node that matches `query`.
   *
   * @param {import('estree').Node} ast
   * @param {string} query - esquery selector string.
   * @param {(node: import('estree').Node, parent: import('estree').Node, ancestry: import('estree').Node[]) => void} visitor
   */
  traverse: (ast, query, visitor) => {
    const esquery = require('esquery')

    compiler.traverse = (ast, query, visitor) => {
      return esquery.traverse(ast, esquery.parse(query), visitor)
    }

    return compiler.traverse(ast, query, visitor)
  },

  /**
   * Returns all AST nodes matching an esquery selector.
   *
   * @param {import('estree').Node} ast
   * @param {string} query - esquery selector string.
   * @returns {import('estree').Node[]}
   */
  query: (ast, query) => {
    const esquery = require('esquery')

    compiler.query = esquery.query

    return compiler.query(ast, query)
  },
}

/**
 * Adds `loc` (line/column) information to every node in an OXC AST.
 *
 * OXC's `parseSync` provides `start`/`end` character offsets but not ESTree-style
 * `loc` objects. This function computes those locations from the raw source text and
 * attaches them when the `range` option was requested.
 *
 * @param {import('estree').Program} node - Root AST node produced by OXC.
 * @param {string} sourceText - The original source text.
 */
function addLoc (node, sourceText) {
  const lineOffsets = [0]
  for (let i = 0; i < sourceText.length; i++) {
    if (sourceText[i] === '\n') lineOffsets.push(i + 1)
  }
  const offsetToLoc = (offset) => {
    let lo = 0; let hi = lineOffsets.length - 1
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
