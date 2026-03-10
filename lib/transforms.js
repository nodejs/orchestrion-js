'use strict'

const { parse, query, traverse } = require('./compiler')

const tracingChannelPredicate = (node) => (
  node.specifiers?.[0]?.local?.name === 'tr_ch_apm_tracingChannel' ||
    node.declarations?.[0]?.id?.properties?.[0]?.value?.name === 'tr_ch_apm_tracingChannel'
)

const transforms = module.exports = {
  tracingChannelImport ({ dcModule, sourceType }, node) {
    if (node.body.some(tracingChannelPredicate)) return

    const index = node.body.findIndex(child => child.directive === 'use strict')
    const code = sourceType === 'module'
      ? `import { tracingChannel as tr_ch_apm_tracingChannel } from "${dcModule}"`
      : `const {tracingChannel: tr_ch_apm_tracingChannel} = require("${dcModule}")`

    node.body.splice(index + 1, 0, parse(code, { sourceType }).body[0])
  },

  tracingChannelDeclaration (state, node) {
    const { channelName, module: { name } } = state
    const channelVariable = 'tr_ch_apm$' + channelName.replaceAll(':', '_')

    if (node.body.some(child => child.declarations?.[0]?.id?.name === channelVariable)) return

    transforms.tracingChannelImport(state, node)

    const index = node.body.findIndex(tracingChannelPredicate)
    const code = `
      const ${channelVariable} = tr_ch_apm_tracingChannel("orchestrion:${name}:${channelName}")
    `

    node.body.splice(index + 1, 0, parse(code).body[0])
  },

  traceAsyncIterator: traceAny,
  traceCallback: traceAny,
  traceIterator: traceAny,
  tracePromise: traceAny,
  traceSync: traceAny,
}

function traceAny (state, node, _parent, ancestry) {
  const program = ancestry[ancestry.length - 1]

  if (node.type === 'ClassDeclaration' || node.type === 'ClassExpression') {
    traceInstanceMethod(state, node, program)
  } else {
    traceFunction(state, node, program)
  }
}

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

function wrap (state, node, program) {
  const { operator, moduleVersion } = state

  let wrapper

  if (operator === 'traceAsyncIterator') wrapper = wrapIterator(state, node, program)
  if (operator === 'traceCallback') wrapper = wrapCallback(state, node)
  if (operator === 'traceIterator') wrapper = wrapIterator(state, node, program)
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
  query(block, '[id.name=__apm$wrapped]')[0].init = node

  return block
}

function wrapSuper (_state, node) {
  const members = new Set()

  traverse(
    node.body,
    '[object.type=Super]',
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

function wrapCallback (state, node) {
  const { channelName, functionQuery: { callbackIndex = -1 } } = state
  const channelVariable = 'tr_ch_apm$' + channelName.replaceAll(':', '_')

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

function wrapIterator (state, node, program) {
  const { channelName, operator } = state
  const baseChannel = channelName.replaceAll(':', '_')
  const channelVariable = 'tr_ch_apm$' + baseChannel
  const nextChannel = baseChannel + '_next'
  const traceMethod = operator === 'traceAsyncIterator' ? 'tracePromise' : 'traceSync'
  const traceNext = `tr_ch_apm$${nextChannel}.${traceMethod}`

  transforms.tracingChannelDeclaration({ ...state, channelName: nextChannel }, program)

  return parse(`
    function wrapper () {
      if (!${channelVariable}.start.hasSubscribers) return __apm$traced();

      {
        const ctx = __apm$ctx;
        const wrap = iter => {
          const { next: iterNext, return: iterReturn, throw: iterThrow } = iter;

          iter.next = (...args) => ${traceNext}(iterNext, ctx, iter, ...args);
          iter.return = (...args) => ${traceNext}(iterReturn, ctx, iter, ...args);
          iter.throw = (...args) => ${traceNext}(iterThrow, ctx, iter, ...args);

          return iter;
        };
        const iter = ${channelVariable}.traceSync(__apm$traced, ctx);

        if (typeof iter.then !== 'function') return wrap(iter);

        return iter.then(result => {
          ctx.result = result;

          ${channelVariable}.asyncStart.publish(ctx);
          ${channelVariable}.asyncEnd.publish(ctx);

          return wrap(result);
        }, err => {
          ctx.error = err;

          ${channelVariable}.error.publish(ctx);
          ${channelVariable}.asyncStart.publish(ctx);
          ${channelVariable}.asyncEnd.publish(ctx);

          return Promise.reject(err);
        });
      };
    }
  `)
}

function wrapPromise (state, node) {
  const { channelName } = state
  const channelVariable = 'tr_ch_apm$' + channelName.replaceAll(':', '_')

  return parse(`
    function wrapper () {
      if (!${channelVariable}.hasSubscribers) return __apm$traced();

      return ${channelVariable}.start.runStores(__apm$ctx, () => {
        try {
          let promise = __apm$traced();
          if (!(promise instanceof Promise)) {
            promise = Promise.resolve(promise);
          }
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
              return PromiseReject(err);
            }
          );
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

function wrapSync (state, node) {
  const { channelName } = state
  const channelVariable = 'tr_ch_apm$' + channelName.replaceAll(':', '_')

  return parse(`
    function wrapper () {
      if (!${channelVariable}.hasSubscribers) return __apm$traced();

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
