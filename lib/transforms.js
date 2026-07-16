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

module.exports = {
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
   * @param {{ channelName: string, module: { name: string }, dcModule: string, sourceType: 'module'|'script', transforms: Record<string, Function> }} state
   * @param {import('estree').Program} node - The program root node.
   */
  tracingChannelDeclaration (state, node) {
    const { channelName, module: { name } } = state
    const channelVariable = formatChannelVariable(channelName)

    if (node.body.some(child => child.declarations?.[0]?.id?.name === channelVariable)) return

    state.transforms.tracingChannelImport(state, node)

    const index = node.body.findIndex(tracingChannelPredicate)
    const code = `
      const ${channelVariable} = tr_ch_apm_tracingChannel("orchestrion:${name}:${channelName}")
    `

    node.body.splice(index + 1, 0, parse(code).body[0])
  },

  traceCallback: traceAny,
  tracePromise: traceAny,
  traceSync: traceAny,
  traceAuto: traceAny,
}

/**
 * Replaces a function's params with numbered placeholders (`__apm$arg0`,
 * `__apm$arg1`, ...) plus a rest element (`...__apm$args`) to capture overflow.
 * This preserves the function's `.length` while giving the preamble a uniform
 * way to reconstruct all call-site arguments. `RestElement` and
 * `AssignmentPattern` params are excluded from the count since they do not
 * contribute to `.length`.
 *
 * @param {import('estree').Pattern[]} params - The original function params.
 * @returns {import('estree').Pattern[]} The replacement params.
 */
function wrapParams (params) {
  const originalParams = params || []
  const numberedParams = originalParams
    .filter(param => param.type !== 'RestElement' && param.type !== 'AssignmentPattern')
    .map((_, i) => ({ type: 'Identifier', name: `__apm$arg${i}` }))

  return [
    ...numberedParams,
    { type: 'RestElement', argument: { type: 'Identifier', name: '__apm$args' } }
  ]
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
 * Returns `true` if `stmt` is a `return <channelVariable>.start.runStores(...)`
 * statement, the shape every wrapper template
 * (`wrapSync`/`wrapPromise`/`wrapCallback`/`wrapAuto`) ends with.
 *
 * @param {import('estree').Node} stmt
 * @param {string} channelVariable
 * @returns {boolean}
 */
function isChannelRunStoresReturn (stmt, channelVariable) {
  if (stmt.type !== 'ReturnStatement') return false
  const callee = stmt.argument?.type === 'CallExpression' ? stmt.argument.callee : null
  return callee?.type === 'MemberExpression' &&
    callee.property?.name === 'runStores' &&
    callee.object?.type === 'MemberExpression' &&
    callee.object.property?.name === 'start' &&
    callee.object.object?.type === 'Identifier' &&
    callee.object.object.name === channelVariable
}

/**
 * Given the body statements of a wrapper function, returns the function that was
 * moved into its `__apm$traced` closure as `const __apm$wrapped = <fn>` (i.e. the
 * next layer down: either an inner wrapper or the original function). Returns
 * `null` when there is no such closure, which marks the bottom of the stack (the
 * original, un-wrapped body).
 *
 * @param {import('estree').Statement[]} body
 * @returns {import('estree').Function|null}
 */
function nextWrappedFunction (body) {
  const declInit = (stmts, name) => {
    const decl = stmts?.find(stmt =>
      stmt.type === 'VariableDeclaration' &&
      stmt.declarations.some(d => d.id?.name === name)
    )
    return decl?.declarations.find(d => d.id?.name === name)?.init ?? null
  }

  const traced = declInit(body, '__apm$traced')
  const wrapped = declInit(traced?.body?.body, '__apm$wrapped')
  const type = wrapped?.type
  return type === 'FunctionExpression' || type === 'ArrowFunctionExpression' || type === 'FunctionDeclaration'
    ? wrapped
    : null
}

/**
 * Returns `true` if `node` is already wrapped for `channelVariable` at any layer
 * of the wrapper stack this transform builds.
 *
 * The check is scoped to the specific channel (not just "is this instrumented at
 * all") on purpose: re-wrapping the same function on the *same* channel
 * double-publishes to one channel and is the double-instrumentation bug we skip,
 * whereas wrapping it on a *different* channel is a second, independent APM whose
 * instrumentation must not be silently dropped.
 *
 * It walks down the `__apm$wrapped` closure chain rather than only inspecting the
 * outermost layer, so an already-wrapped channel is still detected after a
 * different channel has been wrapped on top of it. The walk only follows this
 * transform's own scaffolding, so unrelated nested functions in the original body
 * are never mistaken for a wrapper.
 *
 * @param {import('estree').Node} node - A function-like node.
 * @param {string} channelVariable - The channel variable name for this config.
 * @returns {boolean}
 */
function isWrappedForChannel (node, channelVariable) {
  const visited = new Set()
  let fn = node
  while (fn && !visited.has(fn)) {
    visited.add(fn)
    const body = fn.body?.body
    if (!Array.isArray(body)) return false
    if (body.some(stmt => isChannelRunStoresReturn(stmt, channelVariable))) return true
    fn = nextWrappedFunction(body)
  }
  return false
}

/**
 * Returns `true` if `ctor` already declares `bindingName`, the per-channel
 * `const <channelVar>$<method> = this["<method>"]` binding injected by
 * {@link traceInstanceMethod}. Used to keep re-transforming already instrumented
 * output idempotent for instance methods wrapped at runtime inside the
 * constructor, without dropping a different channel's patch.
 *
 * @param {import('estree').MethodDefinition} ctor - The class constructor node.
 * @param {string} bindingName - The channel-namespaced saved-original binding.
 * @returns {boolean}
 */
function constructorPatchesMethod (ctor, bindingName) {
  const body = ctor?.value?.body?.body
  if (!Array.isArray(body)) return false
  return body.some(stmt =>
    stmt.type === 'VariableDeclaration' &&
    stmt.declarations.some(decl => decl.id?.name === bindingName)
  )
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
  // Idempotency guard: the name-based esquery selectors re-match the outer
  // wrapper function on a second pass (the `[async]` token is structural, and
  // the wrapper keeps the target's name), so bail out if this node is already
  // wrapped for this channel instead of double-publishing to it. A different
  // channel (a second, independent APM) is intentionally allowed to wrap it.
  if (isWrappedForChannel(node, formatChannelVariable(state.channelName))) return

  state.transforms.tracingChannelDeclaration(state, program)

  const { functionQuery: { methodName, privateMethodName, functionName, expressionName, propertyName } } = state
  const isConstructor = methodName === 'constructor' ||
  (!methodName && !privateMethodName && !functionName && !expressionName && !propertyName)
  const type = isConstructor ? 'ArrowFunctionExpression' : node.type
  const params = node.params

  node.body = wrap(state, {
    type,
    params,
    body: node.body,
    async: node.async,
    expression: false,
    generator: node.generator,
  }, program)

  node.params = wrapParams(params)

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
  const { functionQuery, operator, channelName } = state
  const { methodName } = functionQuery

  // No methodName means a constructor-only config — the constructor FunctionExpression
  // is matched directly by the other queries and handled via traceFunction instead.
  if (!methodName) return

  const classBody = node.body

  // If the method exists on the class, we return as it will be patched later
  // while traversing child nodes later on.
  // `key` is absent on members without one (e.g. ES2022 `static {}` blocks),
  // so guard against reading `.name` on undefined.
  if (classBody.body.some(({ key }) => key?.name === methodName)) return

  // Method doesn't exist on the class so we assume an instance method and
  // wrap it in the constructor instead.
  let ctor = classBody.body.find(({ kind }) => kind === 'constructor')

  // The binding that captures the previous `this[method]` is namespaced by
  // channel so that patches for different channels stack in the constructor
  // (each wraps the previous one) rather than colliding on one `const`.
  const savedBinding = `${formatChannelVariable(channelName)}$${methodName}`

  // Idempotency guard: skip if this channel has already patched this method into
  // the constructor. Scoped per channel (not per method) so a re-run of the same
  // config is a no-op while a different channel is still allowed to add its own
  // patch, keeping this path consistent with `traceFunction`.
  if (ctor && constructorPatchesMethod(ctor, savedBinding)) return

  state.transforms.tracingChannelDeclaration(state, program)

  if (!ctor) {
    ctor = parse(
      node.superClass
        ? 'class A extends Object { constructor (...args) { super(...args) } }'
        : 'class A { constructor () {} }'
    ).body[0].body.body[0] // Extract constructor from dummy class body.

    classBody.body.unshift(ctor)
  }

  const ctorBody = parse(`
    const ${savedBinding} = this["${methodName}"]
    this["${methodName}"] = function () {}
    if (typeof ${savedBinding} === 'function') {
      Object.defineProperty(this["${methodName}"], 'length', {
        value: ${savedBinding}.length,
        configurable: true
      })
    }
  `).body

  // Extract only right-hand side function of line 2.
  const fn = ctorBody[1].expression.right
  fn.params = [{ type: 'RestElement', argument: { type: 'Identifier', name: '__apm$args' } }]

  fn.async = operator === 'tracePromise'
  fn.body = wrap(state, { type: 'Identifier', name: savedBinding }, program)
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
  const { returnKind } = state.functionQuery

  const iterPatch = returnKind ? generateIterPatch(state, returnKind, program) : ''

  let wrapper

  if (operator === 'traceCallback') wrapper = wrapCallback(state, node, iterPatch)
  if (operator === 'tracePromise') wrapper = wrapPromise(state, node, iterPatch)
  if (operator === 'traceSync') wrapper = wrapSync(state, node, iterPatch)
  if (operator === 'traceAuto') wrapper = wrapAuto(state, node, iterPatch)

  const args = (node.params || [])
    .filter(param => param.type !== 'RestElement' && param.type !== 'AssignmentPattern')
    .map((_, i) => `__apm$arg${i}`).concat('...__apm$args').join(', ')

  const block = wrapper.body[0].body // Extract only block statement of function body.
  const common = parse(node.type === 'ArrowFunctionExpression'
    ? `
    const __apm$arguments = [${args}];
    const __apm$ctx = {
      arguments: __apm$arguments,
      moduleVersion: ${JSON.stringify(moduleVersion)}
    };
    const __apm$traced = () => {
      const __apm$wrapped = () => {};
      return __apm$wrapped(...__apm$arguments);
    };
  `
    : `
    const __apm$arguments = [${args}].slice(0, arguments.length);
    const __apm$ctx = {
      arguments: __apm$arguments,
      self: this,
      moduleVersion: ${JSON.stringify(moduleVersion)}
    };
    const __apm$traced = () => {
      const __apm$wrapped = () => {};
      return __apm$wrapped.apply(this, __apm$arguments);
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
 * Builds a composite wrapper AST that detects at runtime whether to use callback
 * or promise tracing: if the argument at `callbackIndex` is a function, the
 * callback path is taken; otherwise the promise path is used as the fallback.
 *
 * @param {object} state
 * @param {import('estree').Node} node
 * @param {import('estree').Program} program
 * @returns {import('estree').Program} Parsed wrapper function program.
 */
function wrapAuto (state, node, iterPatch = '') {
  const cbWrapperAST = wrapCallback(state, node, iterPatch)
  const promiseWrapperAST = wrapPromise(state, node, iterPatch)

  const [
    getCbArg,
    checkHasSubscribers,
    defineWrappedCb,
    checkCbIsFunction,
    spliceCbArg,
    runStores,
  ] = cbWrapperAST.body[0].body.body

  const fallbackToPromise = {
    type: 'IfStatement',
    test: checkCbIsFunction.test,
    consequent: { type: 'BlockStatement', body: promiseWrapperAST.body[0].body.body },
    alternate: null,
  }

  cbWrapperAST.body[0].body.body = [
    getCbArg,
    fallbackToPromise,
    checkHasSubscribers,
    defineWrappedCb,
    spliceCbArg,
    runStores,
  ]

  return cbWrapperAST
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
function wrapCallback (state, node, iterPatch = '') {
  const { channelName, functionQuery: { callbackIndex = -1 } } = state
  const channelVariable = formatChannelVariable(channelName)

  return parse(`
    function wrapper () {
      const __apm$cb = Array.prototype.at.call(__apm$arguments, ${callbackIndex});

      if (!${channelVariable}.start.hasSubscribers) return __apm$traced();

      function __apm$wrappedCb(err, res) {
        if (err) {
          __apm$ctx.error = err;
          ${channelVariable}.error.publish(__apm$ctx);
        } else {
          __apm$ctx.result = res;
          ${iterPatch}
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
      Array.prototype.splice.call(__apm$arguments, ${callbackIndex}, 1, __apm$wrappedCb);

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
function wrapPromise (state, node, iterPatch = '') {
  const { channelName } = state
  const channelVariable = formatChannelVariable(channelName)

  // A subscriber can substitute the resolved value by reassigning
  // `message.result` in `asyncEnd` (the wrapper returns `__apm$ctx.result`),
  // but ONLY for native `Promise` instances. For Promise subclasses and other
  // thenables we side-chain the callbacks and return the original object so
  // that any subclass-specific methods (e.g. `APIPromise.withResponse()`)
  // remain accessible to the caller; that means their resolved value cannot be
  // mutated.
  return parse(`
    function wrapper () {
      if (!tr_ch_apm_hasSubscribers(${channelVariable})) return __apm$traced();

      return ${channelVariable}.start.runStores(__apm$ctx, () => {
        try {
          let promise = __apm$traced();
          if (typeof promise?.then !== 'function') {
            __apm$ctx.result = promise;
            ${iterPatch}
            return __apm$ctx.result;
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
                ${iterPatch}
                ${channelVariable}.asyncStart.publish(__apm$ctx);
                ${channelVariable}.asyncEnd.publish(__apm$ctx);
                return __apm$ctx.result;
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
              ${iterPatch}
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
 * on throw. The result is stored in `__apm$ctx.result` on success, and the
 * wrapper returns whatever `__apm$ctx.result` holds after `end` publishes, so a
 * subscriber's `end` handler can substitute the return value via `message.result`.
 *
 * @param {{ channelName: string }} state
 * @param {import('estree').Node} node
 * @returns {import('estree').Program} Parsed wrapper function program.
 */
function wrapSync (state, node, iterPatch = '') {
  const { channelName } = state
  const channelVariable = formatChannelVariable(channelName)

  // The return value is whatever `__apm$ctx.result` holds *after* `end` has
  // published, so a subscriber's `end` handler can reassign `message.result`
  // to substitute it (e.g. to wrap a returned handler). The `return`
  // therefore sits below the `try`/`finally`: on the throw path the `catch`
  // re-throws, so the trailing `return` is unreachable.
  return parse(`
    function wrapper () {
      if (!tr_ch_apm_hasSubscribers(${channelVariable})) return __apm$traced();

      return ${channelVariable}.start.runStores(__apm$ctx, () => {
        try {
          __apm$ctx.result = __apm$traced();
          ${iterPatch}
        } catch (err) {
          __apm$ctx.error = err;
          ${channelVariable}.error.publish(__apm$ctx);
          throw err;
        } finally {
         __apm$ctx.self ??= this;
          ${channelVariable}.end.publish(__apm$ctx);
        }
        return __apm$ctx.result;
      });
    }
  `)
}

/**
 * Injects a `:next` tracing channel declaration (for iterator method tracing) into
 * the program body, inserting it immediately after the main channel declaration.
 *
 * @param {object} state
 * @param {import('estree').Program} program
 */
function declareIteratorChannel (state, program) {
  const { channelName, module: { name } } = state
  const iterChannelVariable = formatChannelVariable(channelName + ':next')

  if (program.body.some(child => child.declarations?.[0]?.id?.name === iterChannelVariable)) return

  const channelVariable = formatChannelVariable(channelName)
  const index = program.body.findIndex(child =>
    child.declarations?.[0]?.id?.name === channelVariable
  )
  const code = `const ${iterChannelVariable} = tr_ch_apm_tracingChannel("orchestrion:${name}:${channelName}:next")`
  program.body.splice(index + 1, 0, parse(code).body[0])
}

/**
 * Generates the iterator-patching code string for injection into an existing
 * wrapper. Patches `next`, `throw`, and `return` on the iterator held in
 * `__apm$ctx.result`, publishing to the `:next` tracing channel via
 * `traceSync` or `tracePromise` depending on `returnKind`.
 *
 * @param {object} state
 * @param {'Iterator'|'AsyncIterator'} returnKind
 * @param {import('estree').Program} program
 * @returns {string}
 */
function generateIterPatch (state, returnKind, program) {
  const { channelName } = state
  const traceMethod = returnKind === 'Iterator' ? 'traceSync' : 'tracePromise'
  const iterChannelVariable = formatChannelVariable(channelName + ':next')

  declareIteratorChannel(state, program)

  return `
    const __apm$iter = __apm$ctx.result;
    if (__apm$iter != null && typeof __apm$iter.next === 'function') {
      const __apm$patchIter = function (method) {
        const __apm$orig = __apm$iter[method];
        if (typeof __apm$orig !== 'function') return;
        __apm$iter[method] = function () {
          const __apm$iterArgs = Array.prototype.slice.call(arguments);
          if (!tr_ch_apm_hasSubscribers(${iterChannelVariable})) return __apm$orig.apply(this, __apm$iterArgs);
          __apm$ctx.method = method;
          __apm$ctx.arguments = __apm$iterArgs;
          return ${iterChannelVariable}.${traceMethod}(__apm$orig, __apm$ctx, this, ...__apm$iterArgs);
        };
      };
      __apm$patchIter('next');
      __apm$patchIter('throw');
      __apm$patchIter('return');
    }
  `
}
