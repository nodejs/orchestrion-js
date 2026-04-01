'use strict'

const esquery = require('esquery')
const { parse } = require('meriyah')

/**
 * Returns `true` if `node` is already a `tracingChannel` import/require statement,
 * used to avoid duplicate injections.
 *
 * @param {import('estree').Node} node
 * @returns {boolean}
 */
const tracingChannelPredicate = (node) => (
  node.declarations?.[0]?.id?.properties?.[0]?.value?.name === 'tr_ch_apm_tracingChannel'
)

const CHANNEL_REGEX = /[^\w]/g
/**
 * Formats the channel variable name by replacing any non-whitespace characters with `_`
 *
 * @param {string} channelName
 */
const formatChannelVariable = (channelName) => `tr_ch_apm$${channelName.replace(CHANNEL_REGEX, '_')}`

const transforms = module.exports = {
  /**
   * Injects a `tracingChannel` import/require into the program body if one is not
   * already present.
   *
   * @param {{ dcModule: string, sourceType: 'module'|'script' }} state
   * @param {import('estree').Program} node - The program root node.
   */
  tracingChannelImport ({ dcModule, moduleType }, node) {
    if (node.body.some(tracingChannelPredicate)) return

    const options = { module: moduleType === 'esm' }
    const index = node.body.findIndex(child => child.directive === 'use strict')
    const dc = moduleType === 'esm'
      ? `import tr_ch_apm_dc from "${dcModule}"`
      : `const tr_ch_apm_dc = require("${dcModule}")`
    const tracingChannel = 'const { tracingChannel: tr_ch_apm_tracingChannel } = tr_ch_apm_dc'
    const hasSubscribers = `const tr_ch_apm_hasSubscribers = ch => ch.start.hasSubscribers
      || ch.end.hasSubscribers
      || ch.asyncStart.hasSubscribers
      || ch.asyncEnd.hasSubscribers
      || ch.error.hasSubscribers`

    node.body.splice(
      index + 1,
      0,
      parse(dc, options).body[0],
      parse(tracingChannel, options).body[0],
      parse(hasSubscribers, options).body[0]
    )
  },

  /**
   * Injects a `tracingChannel(...)` variable declaration for the config's channel
   * into the program body, also ensuring the import is present.
   *
   * @param {{ channelName: string, module: { name: string }, dcModule: string, sourceType: 'module'|'script' }} state
   * @param {import('estree').Program} node - The program root node.
   */
  tracingChannelDeclaration (state, node) {
    const { channelName, module: { name } } = state
    const channelVariable = formatChannelVariable(channelName)

    if (node.body.some(child => child.declarations?.[0]?.id?.name === channelVariable)) return

    transforms.tracingChannelImport(state, node)

    const index = node.body.findIndex(tracingChannelPredicate)
    const code = `
      const ${channelVariable} = tr_ch_apm_tracingChannel("orchestrion:${name}:${channelName}")
    `

    node.body.splice(index + 1, 0, parse(code).body[0])
  },

  traceCallback: traceAny,
  tracePromise: traceAny,
  traceSync: traceAny,
}

/**
 * Generic trace entry point. Dispatches to {@link traceInstanceMethod} for class
 * nodes or {@link traceFunction} for all other function nodes.
 *
 * @param {object} state - Merged instrumentation + runtime state.
 * @param {import('estree').Node} node - Matched AST node.
 * @param {import('estree').Node} _parent
 * @param {import('estree').Node[]} ancestry - Full ancestor chain, root last.
 */
function traceAny (state, node, _parent, ancestry) {
  const program = ancestry[ancestry.length - 1]

  if (node.type === 'ClassDeclaration' || node.type === 'ClassExpression') {
    traceInstanceMethod(state, node, program)
  } else {
    traceFunction(state, node, program)
  }
}

/**
 * Wraps a function node's body with diagnostics_channel tracing.
 *
 * Injects the channel declaration, wraps the original body in an inner function,
 * and rewrites `super` references if needed.
 *
 * @param {object} state
 * @param {import('estree').Function} node - The function node to instrument.
 * @param {import('estree').Program} program
 */
function traceFunction (state, node, program) {
  transforms.tracingChannelDeclaration(state, program)

  const { functionQuery: { methodName, privateMethodName, functionName, expressionName } } = state
  const isConstructor = methodName === 'constructor' ||
    (!methodName && !privateMethodName && !functionName && !expressionName)
  const type = isConstructor ? 'ArrowFunctionExpression' : 'FunctionExpression'

  node.body = wrap(state, {
    type,
    params: node.params,
    body: node.body,
    async: node.async,
    expression: false,
    generator: node.generator,
  }, program)

  // The original function no longer contains any calls to `await` or `yield` as
  // the function body is copied to the internal wrapped function, so we set
  // these to false to avoid altering the return value of the wrapper. The old
  // values are instead copied to the new AST node above.
  node.generator = false
  node.async = false

  wrapSuper(state, node)
}

/**
 * Instruments an instance method that may not exist on the class at definition
 * time by patching it inside the constructor.
 *
 * If the method is already defined on the class body it is skipped (it will be
 * handled via {@link traceFunction} when the child node is visited). Otherwise a
 * constructor is synthesised (or extended) to wrap `this[methodName]` at runtime.
 *
 * @param {object} state
 * @param {import('estree').ClassDeclaration|import('estree').ClassExpression} node
 * @param {import('estree').Program} program
 */
function traceInstanceMethod (state, node, program) {
  const { functionQuery, operator } = state
  const { methodName } = functionQuery

  // No methodName means a constructor-only config — the constructor FunctionExpression
  // is matched directly by the other queries and handled via traceFunction instead.
  if (!methodName) return

  const classBody = node.body

  // If the method exists on the class, we return as it will be patched later
  // while traversing child nodes later on.
  if (classBody.body.some(({ key }) => key.name === methodName)) return

  // Method doesn't exist on the class so we assume an instance method and
  // wrap it in the constructor instead.
  let ctor = classBody.body.find(({ kind }) => kind === 'constructor')

  transforms.tracingChannelDeclaration(state, program)

  if (!ctor) {
    ctor = parse(
      node.superClass
        ? 'class A extends Object { constructor (...args) { super(...args) } }'
        : 'class A { constructor () {} }'
    ).body[0].body.body[0] // Extract constructor from dummy class body.

    classBody.body.unshift(ctor)
  }

  const ctorBody = parse(`
    const __apm$${methodName} = this["${methodName}"]
    this["${methodName}"] = function () {}
  `).body

  // Extract only right-hand side function of line 2.
  const fn = ctorBody[1].expression.right

  fn.async = operator === 'tracePromise'
  fn.body = wrap(state, { type: 'Identifier', name: `__apm$${methodName}` }, program)

  wrapSuper(state, fn)

  ctor.value.body.body.push(...ctorBody)
}

/**
 * Builds the replacement block statement for a function body.
 *
 * Selects the appropriate wrapper template (`wrapSync`, `wrapPromise`, etc.) and
 * prepends the shared `__apm$ctx` / `__apm$traced` preamble before returning the
 * resulting block statement body.
 *
 * @param {object} state
 * @param {import('estree').Node} node - The original function (or identifier for instance methods).
 * @param {import('estree').Program} program
 * @returns {import('estree').BlockStatement['body']}
 */
function wrap (state, node, program) {
  const { operator, moduleVersion } = state

  let wrapper

  if (operator === 'traceCallback') wrapper = wrapCallback(state, node)
  if (operator === 'tracePromise') wrapper = wrapPromise(state, node, program)
  if (operator === 'traceSync') wrapper = wrapSync(state, node, program)

  const block = wrapper.body[0].body // Extract only block statement of function body.
  const common = parse(node.type === 'ArrowFunctionExpression'
    ? `
    const __apm$ctx = {
      arguments,
      moduleVersion: ${JSON.stringify(moduleVersion)}
    };
    const __apm$traced = () => {
      const __apm$wrapped = () => {};
      return __apm$wrapped(...arguments);
    };
  `
    : `
    const __apm$ctx = {
      arguments,
      self: this,
      moduleVersion: ${JSON.stringify(moduleVersion)}
    };
    const __apm$traced = () => {
      const __apm$wrapped = () => {};
      return __apm$wrapped.apply(this, arguments);
    };
  `).body

  block.body.unshift(...common)

  // Replace the right-hand side assignment of `const __apm$wrapped = () => {}`.
  esquery.query(block, '[id.name=__apm$wrapped]')[0].init = node

  return block
}

/**
 * Rewrites `super.method(...)` calls inside a moved function body.
 *
 * Because the original body is copied into a nested arrow/function, `super` would
 * no longer be in scope. Each unique `super.x` reference is replaced with
 * `__apm$super['x']` and a preamble that captures the super-binding in the
 * outermost method scope is prepended.
 *
 * @param {object} _state
 * @param {import('estree').Function} node - The outer (wrapper) function node.
 */
function wrapSuper (_state, node) {
  const members = new Set()

  esquery.traverse(
    node.body,
    esquery.parse('[object.type=Super]'),
    (node, parent) => {
      const { name } = node.property

      let child

      if (parent.callee) {
        // This is needed because for generator functions we have to move the
        // original function to a nested wrapped function, but we can't use an
        // arrow function because arrow function cannot be generator functions,
        // and `super` cannot be called from a nested function, so we have to
        // rewrite any `super` call to not use the keyword.
        const { expression } = parse(`__apm$super['${name}'].call(this)`).body[0]

        parent.callee = child = expression.callee
        parent.arguments.unshift(...expression.arguments)
      } else {
        parent.expression = child = parse(`__apm$super['${name}']`).body[0]
      }

      child.computed = parent.callee.computed
      child.optional = parent.callee.optional

      members.add(name)
    }
  )

  for (const name of members) {
    const member = parse(`
      class Wrapper {
        wrapper () {
          __apm$super['${name}'] = super['${name}']
        }
      }
    `).body[0].body.body[0].value.body.body[0]

    node.body.body.unshift(member)
  }

  if (members.size > 0) {
    node.body.body.unshift(parse('const __apm$super = {}').body[0])
  }
}

/**
 * Builds the wrapper AST for a callback-style function.
 *
 * Replaces the callback argument (at `callbackIndex`) with a wrapped version that
 * publishes to the tracing channel on completion or error.
 *
 * @param {{ channelName: string, functionQuery: { callbackIndex?: number } }} state
 * @param {import('estree').Node} node - The original function node (unused; replaced by preamble).
 * @returns {import('estree').Program} Parsed wrapper function program.
 */
function wrapCallback (state, node) {
  const { channelName, functionQuery: { callbackIndex = -1 } } = state
  const channelVariable = formatChannelVariable(channelName)

  return parse(`
    function wrapper () {
      const __apm$cb = Array.prototype.at.call(arguments, ${callbackIndex});

      if (!${channelVariable}.start.hasSubscribers) return __apm$traced();

      function __apm$wrappedCb(err, res) {
        if (err) {
          __apm$ctx.error = err;
          ${channelVariable}.error.publish(__apm$ctx);
        } else {
          __apm$ctx.result = res;
        }

        ${channelVariable}.asyncStart.runStores(__apm$ctx, () => {
          try {
            if (__apm$cb) {
              return __apm$cb.apply(this, arguments);
            }
          } finally {
            ${channelVariable}.asyncEnd.publish(__apm$ctx);
          }
        });
      }

      if (typeof __apm$cb !== 'function') {
        return __apm$traced();
      }
      Array.prototype.splice.call(arguments, ${callbackIndex}, 1, __apm$wrappedCb);

      return ${channelVariable}.start.runStores(__apm$ctx, () => {
        try {
          return __apm$traced();
        } catch (err) {
          __apm$ctx.error = err;
          ${channelVariable}.error.publish(__apm$ctx);
          throw err;
        } finally {
         __apm$ctx.self ??= this;
          ${channelVariable}.end.publish(__apm$ctx);
        }
      });
    }
  `)
}

/**
 * Builds the wrapper AST for a Promise-returning function.
 *
 * Uses `runStores` to propagate async context and publishes
 * `asyncStart`/`asyncEnd`/`error` channel events on settlement.
 *
 * @param {{ channelName: string }} state
 * @param {import('estree').Node} node
 * @returns {import('estree').Program} Parsed wrapper function program.
 */
function wrapPromise (state, node) {
  const { channelName } = state
  const channelVariable = formatChannelVariable(channelName)

  return parse(`
    function wrapper () {
      if (!tr_ch_apm_hasSubscribers(${channelVariable})) return __apm$traced();

      return ${channelVariable}.start.runStores(__apm$ctx, () => {
        try {
          let promise = __apm$traced();
          if (typeof promise?.then !== 'function') {
            __apm$ctx.result = promise;
            return promise;
          }
          // Mirror Node.js core diagnostics_channel behaviour: for native Promise
          // instances, chain normally (safe since there is no subclass API to
          // preserve). For Promise subclasses and other thenables, side-chain the
          // callbacks for event publishing and return the original so that any
          // subclass-specific methods (e.g. APIPromise.withResponse()) remain
          // accessible to the caller.
          if (promise instanceof Promise && promise.constructor === Promise) {
            return promise.then(
              result => {
                __apm$ctx.result = result;
                ${channelVariable}.asyncStart.publish(__apm$ctx);
                ${channelVariable}.asyncEnd.publish(__apm$ctx);
                return result;
              },
              err => {
                __apm$ctx.error = err;
                ${channelVariable}.error.publish(__apm$ctx);
                ${channelVariable}.asyncStart.publish(__apm$ctx);
                ${channelVariable}.asyncEnd.publish(__apm$ctx);
                throw err;
              }
            );
          }
          promise.then(
            result => {
              __apm$ctx.result = result;
              ${channelVariable}.asyncStart.publish(__apm$ctx);
              ${channelVariable}.asyncEnd.publish(__apm$ctx);
            },
            err => {
              __apm$ctx.error = err;
              ${channelVariable}.error.publish(__apm$ctx);
              ${channelVariable}.asyncStart.publish(__apm$ctx);
              ${channelVariable}.asyncEnd.publish(__apm$ctx);
            }
          );
          return promise;
        } catch (err) {
          __apm$ctx.error = err;
          ${channelVariable}.error.publish(__apm$ctx);
          throw err;
        } finally {
          __apm$ctx.self ??= this;
          ${channelVariable}.end.publish(__apm$ctx);
        }
      });
    }
  `)
}

/**
 * Builds the wrapper AST for a synchronous function.
 *
 * Uses `runStores` for context propagation and publishes `error` channel events
 * on throw. The result is stored in `__apm$ctx.result` on success.
 *
 * @param {{ channelName: string }} state
 * @param {import('estree').Node} node
 * @returns {import('estree').Program} Parsed wrapper function program.
 */
function wrapSync (state, node) {
  const { channelName } = state
  const channelVariable = formatChannelVariable(channelName)

  return parse(`
    function wrapper () {
      if (!tr_ch_apm_hasSubscribers(${channelVariable})) return __apm$traced();

      return ${channelVariable}.start.runStores(__apm$ctx, () => {
        try {
          const result = __apm$traced();
          __apm$ctx.result = result;
          return result;
        } catch (err) {
          __apm$ctx.error = err;
          ${channelVariable}.error.publish(__apm$ctx);
          throw err;
        } finally {
         __apm$ctx.self ??= this;
          ${channelVariable}.end.publish(__apm$ctx);
        }
      });
    }
  `)
}
