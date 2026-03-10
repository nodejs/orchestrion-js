'use strict'

const { generate, parse, traverse } = require('./compiler')
const transforms = require('./transforms')

let SourceMapConsumer
let SourceMapGenerator

class Transformer {
  #module_name = null
  #version = null
  #file_path = null
  #configs = []
  #dc_module = null
  #customTransforms = {}

  // TODO: module_name false for user module
  constructor (module_name, version, file_path, configs, dc_module, customTransforms = {}) {
    this.#module_name = module_name
    this.#version = version
    this.#file_path = file_path
    this.#configs = configs
    this.#dc_module = dc_module
    this.#customTransforms = customTransforms
  }

  free () {
    // Freeing is not needed for a JavaScript implementation.
  }

  transform (code, module_type, sourcemap) {
    if (!code) return { code }

    let sourceType = module_type === 'esm' ? 'module' : 'script'
    let ast
    let aliases = {}
    let injectionCount = 0

    for (const config of this.#configs) {
      const { astQuery, functionQuery = {} } = config

      if (!ast) {
        try {
          ast = parse(code.toString(), { range: true, sourceType })
        } catch { // TODO: why is this fallback needed?
          sourceType = sourceType === 'module' ? 'script' : 'module'
          ast = parse(code.toString(), { range: true, sourceType })
        }
        if (sourceType === 'module') {
          aliases = this.#collectExportAliases(ast)
        }
      }

      const resolvedFunctionQuery = this.#resolveExportAlias(functionQuery, aliases)
      const query = astQuery || this.#fromFunctionQuery(resolvedFunctionQuery)
      const state = {
        ...config,
        dcModule: this.#dc_module,
        sourceType,
        moduleVersion: this.#version,
        functionQuery: resolvedFunctionQuery
      }

      state.operator = this.#getOperator(state)

      traverse(ast, query, (...args) => {
        injectionCount++
        this.#visit(state, ...args)
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

      const file = `${this.#module_name}/${this.#file_path}`
      const sourceMapInput = sourcemap ? new SourceMapConsumer(sourcemap) : { file }
      const sourceMap = new SourceMapGenerator(sourceMapInput)
      const code = generate(ast, { sourceMap })
      const map = sourceMap.toString()

      return { code, map }
    }

    return { code }
  }

  #visit (state, ...args) {
    const transform = this.#customTransforms[state.operator] ?? transforms[state.operator]
    const { index } = state.functionQuery
    const [node] = args

    if (index !== undefined) {
      // Class nodes are visited for traceInstanceMethod (missing method patching),
      // but when selecting by index we only want to count and match function nodes.
      if (node.type === 'ClassDeclaration' || node.type === 'ClassExpression') return

      state.functionIndex = ++state.functionIndex || 0

      if (index !== state.functionIndex) return
    }

    transform(state, ...args)
  }

  #getOperator ({ transform, functionQuery: { kind } }) {
    if (transform) return transform

    // TODO: doc says `kind` is required but tests don't always pass it?
    switch (kind) {
      case 'Async': return 'tracePromise'
      case 'AsyncIterator': return 'traceAsyncIterator'
      case 'Callback': return 'traceCallback'
      case 'Iterator': return 'traceIterator'
      case 'Sync': return 'traceSync'
      default: return 'traceSync'
    }
  }

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

  #fromFunctionQuery (functionQuery) {
    const { functionName, expressionName, className } = functionQuery
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

    return queries.join(', ')
  }
}

module.exports = { Transformer }
