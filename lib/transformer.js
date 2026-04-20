'use strict'

const esquery = require('esquery')
const { parse } = require('meriyah')
const { generate } = require('astring')
const transforms = require('./transforms')

let SourceMapConsumer
let SourceMapGenerator

/**
 * Applies a set of instrumentation configs to JavaScript source code by parsing
 * it into an AST, locating the target functions via esquery selectors, injecting
 * diagnostics_channel tracing wrappers, and regenerating the source.
 */
class Transformer {
  #moduleName = null
  #version = null
  #filePath = null
  #configs = []
  #dcModule = null
  #customTransforms = {}

  /**
   * @param {string} moduleName - The npm package name being instrumented.
   * @param {string} version - The installed semver version string.
   * @param {string} filePath - The relative file path within the package.
   * @param {object[]} configs - Instrumentation configuration objects for this file.
   * @param {string} dcModule - The diagnostics_channel module specifier to inject.
   * @param {Record<string, Function>} [customTransforms] - Optional custom operator overrides.
   */
  constructor (moduleName, version, filePath, configs, dcModule, customTransforms = {}) {
    this.#moduleName = moduleName // TODO: moduleName false for user module
    this.#version = version
    this.#filePath = filePath
    this.#configs = configs
    this.#dcModule = dcModule
    this.#customTransforms = customTransforms
  }

  /** No-op — freeing resources is not needed for the JavaScript implementation. */
  free () {}

  /**
   * Instruments `code` by injecting diagnostics_channel tracing around the
   * target functions defined by this transformer's configs.
   *
   * @param {string|Buffer} code - Original JavaScript source, or a Buffer containing UTF-8 source.
   * @param {'esm'|'cjs'|'unknown'} moduleType - Whether the source is an ES module or CommonJS.
   * @param {string|object|null} [sourcemap] - Existing source map (raw string or object) to chain from.
   * @returns {{ code: string, map?: string }}
   *   The transformed source and an optional updated source map.
   * @throws {Error} If no injection points are found for any config.
   */
  transform (code, moduleType, sourcemap) {
    if (Buffer.isBuffer(code)) code = code.toString()
    if (!code) return { code }

    let ast
    let aliases = {}
    let injectionCount = 0

    for (const config of this.#configs) {
      const { astQuery, functionQuery = {} } = config

      if (!ast) {
        const options = {
          loc: true,
          ranges: true,
          raw: true,
          module: moduleType === 'esm',
        }

        try {
          ast = parse(code, options)
        } catch {
          ast = parse(code, { ...options, module: !options.module })
        }

        if (moduleType === 'esm') { // TODO: cjs
          aliases = this.#collectExportAliases(ast)
        }
      }

      const resolvedFunctionQuery = this.#resolveExportAlias(functionQuery, aliases)
      const query = astQuery || this.#fromFunctionQuery(resolvedFunctionQuery)
      const state = {
        ...config,
        dcModule: this.#dcModule,
        moduleType,
        moduleVersion: this.#version,
        functionQuery: resolvedFunctionQuery
      }

      state.operator = this.#getOperator(state)

      esquery.traverse(ast, esquery.parse(query), (...args) => {
        if (this.#visit(state, ...args)) {
          injectionCount++
        }
      })
    }

    if (injectionCount === 0 && this.#configs.length > 0) {
      const names = this.#configs.map(({ functionQuery = {} }) => {
        const resolvedQuery = this.#resolveExportAlias(functionQuery, aliases)
        const queryName = (q) => q.methodName || q.privateMethodName || q.functionName || q.expressionName || 'constructor'
        const originalName = queryName(functionQuery)
        const originalAlias = functionQuery.className || functionQuery.functionName || functionQuery.expressionName
        const resolvedAlias = resolvedQuery.className || resolvedQuery.functionName || resolvedQuery.expressionName
        if (originalAlias && originalAlias !== resolvedAlias) {
          return `${originalAlias} (local name: ${resolvedAlias})`
        }
        return originalName
      })
      throw new Error(`Failed to find injection points for: ${JSON.stringify(names)}`)
    }

    if (ast) {
      SourceMapConsumer ??= require('source-map').SourceMapConsumer
      SourceMapGenerator ??= require('source-map').SourceMapGenerator

      const file = `${this.#moduleName}/${this.#filePath}`
      const sourceMapInput = sourcemap ? new SourceMapConsumer(sourcemap) : { file }
      const sourceMap = new SourceMapGenerator(sourceMapInput)
      const code = generate(ast, { sourceMap })
      const map = sourceMap.toString()

      return { code, map }
    }

    return { code }
  }

  /**
   * Visitor called for each AST node that matches a config's query.
   * Handles index-based filtering and delegates to the appropriate transform.
   *
   * @param {object} state - Merged config + runtime state for this traversal.
   * @param {...unknown} args - `(node, parent, ancestry)` from esquery traverse.
   * @returns {boolean} True if injection should be counted, false otherwise.
   */
  #visit (state, ...args) {
    const transform = this.#customTransforms[state.operator] ?? transforms[state.operator]
    const { index = 0 } = state.functionQuery
    const [node, , ancestry] = args
    const type = node.init?.type || node.type

    // Class nodes are visited for traceInstanceMethod (missing method patching),
    // but when selecting by index we only want to count and match function nodes.
    if (type !== 'ClassDeclaration' && type !== 'ClassExpression') {
      // A VariableDeclarator whose init is not a class (e.g. an IIFE wrapping a
      // nested class like `let Server = (() => { class Server {} })()`) is only
      // matched because `[id.name="Server"]` is broad.  It is not a function node
      // and should not be instrumented or counted toward the function index.
      if (node.type === 'VariableDeclarator') return false

      state.functionIndex = ++state.functionIndex || 0

      if (index !== null && index !== state.functionIndex) return false
    } else {
      // For class nodes, validate that the method exists before instrumenting
      const { methodName } = state.functionQuery
      if (methodName) {
        // Handle both ClassDeclaration/ClassExpression and VariableDeclarator with ClassExpression init
        const classNode = node.type === 'VariableDeclarator' ? node.init : node
        const classBody = classNode.body
        const methodExists = classBody.body.some(({ key }) => key?.name === methodName)

        if (!methodExists) {
          // Method doesn't exist on the class. Check if any subclass has it.
          const className = classNode.id?.name || node.id?.name
          const program = ancestry[ancestry.length - 1]

          if (className) {
            const hasMethodInSubclass = esquery.query(
              program,
              `ClassDeclaration[superClass.name="${className}"] > ClassBody > MethodDefinition[key.name="${methodName}"]`
            ).length > 0

            if (!hasMethodInSubclass) {
              throw new Error(`Method '${methodName}' not found on class '${className}' or any of its subclasses`)
            }
          }
        }
      }
    }

    transform(state, ...args)
    return true
  }

  /**
   * Resolves the operator name (transform function key) for a config.
   *
   * If the config has an explicit `transform` name it is used directly;
   * otherwise the operator is derived from the `kind` field of `functionQuery`.
   *
   * @param {{ transform?: string, functionQuery: { kind?: string } }} state
   * @returns {string} Operator name, e.g. `'tracePromise'`.
   */
  #getOperator ({ transform, functionQuery: { kind } }) {
    if (transform) return transform

    switch (kind) {
      case 'Async': return 'tracePromise'
      case 'Auto': return 'traceAuto'
      case 'Callback': return 'traceCallback'
      case 'Sync': return 'traceSync'
      default: return 'traceSync'
    }
  }

  /**
   * Collects a map of exported name → local name from `export { local as exported }`
   * declarations so that instrumentation configs that reference export names can be
   * resolved to local identifiers.
   *
   * @param {import('estree').Program} ast
   * @returns {Record<string, string>} Map of exported name to local name.
   */
  #collectExportAliases (ast) {
    const aliases = {}
    for (const node of ast.body) {
      if (node.type === 'ExportNamedDeclaration' && !node.source) {
        for (const spec of node.specifiers) {
          if (spec.exported && spec.local) {
            const exportedName = spec.exported.name ?? spec.exported.value
            const localName = spec.local.name ?? spec.local.value
            if (exportedName && localName) {
              aliases[exportedName] = localName
            }
          }
        }
      }
    }
    return aliases
  }

  /**
   * If `functionQuery.isExportAlias` is set, replaces the exported identifier in
   * `functionQuery` with the corresponding local name from `aliases`.
   *
   * @param {object} functionQuery
   * @param {Record<string, string>} aliases - Map produced by {@link #collectExportAliases}.
   * @returns {object} Resolved function query (may be the original object if unchanged).
   */
  #resolveExportAlias (functionQuery, aliases) {
    if (!functionQuery.isExportAlias) return functionQuery
    const { functionName, expressionName, className } = functionQuery
    if (functionName && aliases[functionName]) {
      return { ...functionQuery, functionName: aliases[functionName] }
    }
    if (expressionName && aliases[expressionName]) {
      return { ...functionQuery, expressionName: aliases[expressionName] }
    }
    if (className && aliases[className]) {
      return { ...functionQuery, className: aliases[className] }
    }
    return functionQuery
  }

  /**
   * Builds a comma-separated esquery selector string from a `functionQuery` descriptor.
   *
   * Handles class methods, standalone functions, and expression assignments, producing
   * multiple selector alternatives joined with `, `.
   *
   * @param {object} functionQuery
   * @param {string} [functionQuery.className]
   * @param {string} [functionQuery.methodName]
   * @param {string} [functionQuery.privateMethodName]
   * @param {string} [functionQuery.functionName]
   * @param {string} [functionQuery.expressionName]
   * @returns {string} esquery selector.
   */
  #fromFunctionQuery (functionQuery) {
    const { functionName, expressionName, className, objectName, propertyName } = functionQuery
    const type = functionQuery.privateMethodName ? 'PrivateIdentifier' : 'Identifier'
    const queries = []

    let method = functionQuery.methodName || functionQuery.privateMethodName

    if (className) {
      method ??= 'constructor'
      queries.push(
        `[id.name="${className}"]`,
        `[id.name="${className}"] > ClassExpression`,
        `[id.name="${className}"] > ClassBody > [key.name="${method}"][key.type=${type}] > [async]`,
        `[id.name="${className}"] > ClassExpression > ClassBody > [key.name="${method}"][key.type=${type}] > [async]`
      )
    } else if (method) {
      queries.push(
        `ClassBody > [key.name="${method}"][key.type=${type}] > [async]`,
        `Property[key.name="${method}"][key.type=${type}] > [async]`
      )
    }

    if (functionName) {
      queries.push(`FunctionDeclaration[id.name="${functionName}"][async]`)
    } else if (expressionName) {
      queries.push(
        `FunctionExpression[id.name="${expressionName}"][async]`,
        `ArrowFunctionExpression[id.name="${expressionName}"][async]`,
        `VariableDeclarator[id.name="${expressionName}"] > FunctionExpression[async]`,
        `VariableDeclarator[id.name="${expressionName}"] > ArrowFunctionExpression[async]`,
        `AssignmentExpression[left.property.name="${expressionName}"] > FunctionExpression[async]`,
        `AssignmentExpression[left.property.name="${expressionName}"] > ArrowFunctionExpression[async]`,
        `AssignmentExpression[left.name="${expressionName}"] > FunctionExpression[async]`,
        `AssignmentExpression[left.name="${expressionName}"] > ArrowFunctionExpression[async]`
      )
    }

    if (objectName || propertyName) {
      if (!objectName || !propertyName) {
        throw new Error(
          `functionQuery: 'objectName' and 'propertyName' must be used together (got objectName=${objectName}, propertyName=${propertyName})`
        )
      }
      const objectSelector = objectName === 'this'
        ? 'left.object.type=ThisExpression'
        : `left.object.name="${objectName}"`
      queries.push(
        `AssignmentExpression[${objectSelector}][left.property.name="${propertyName}"] > [async]`
      )
    }
    return queries.join(', ')
  }
}

module.exports = { Transformer }
