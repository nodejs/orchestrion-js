'use strict'

// Arrow function targeted via expressionName. Without the ArrowFunctionExpression
// → FunctionExpression conversion, `arguments` inside the wrapper resolves to the
// CJS module wrapper arguments instead of the actual call-site arguments.
exports.fetch = async (url) => {
  return url
}
