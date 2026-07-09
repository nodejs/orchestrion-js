// Mirrors a NestJS-style decorator factory: `Decorator(options)` returns the
// actual decorator `(target) => {...}` that is applied to a class. The returned
// arrow is anonymous and synchronous, so the name-based FunctionQuery variants
// cannot target it. Only a raw `astQuery` can do that.
function Decorator (options) {
  return (target) => {
    target.decorated = options
    return target
  }
}

module.exports = { Decorator }
