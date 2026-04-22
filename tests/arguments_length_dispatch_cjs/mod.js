'use strict'

// Regression for the graphql-style overload pattern. `execute` dispatches on
// `arguments.length` to choose between an options-object form and a positional
// form. Without `Array.prototype.slice.call(arguments)` in the non-arrow
// preamble, the rebuilt args array was padded with undefined up to the
// declared arity, so `arguments.length` inside the moved-out body was always
// the declared arity (8) instead of the caller's real arity.
function execute (argsOrSchema, document, rootValue, contextValue,
  variableValues, operationName, fieldResolver, typeResolver) {
  if (arguments.length === 1) {
    return 'object-form:' + argsOrSchema.marker
  }
  return 'positional-form:' + argsOrSchema + ',' + document
}

module.exports = { execute }
