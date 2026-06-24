// Async factory: returns a native Promise that resolves to a per-request
// handler. A subscriber can replace the resolved handler in `asyncEnd`.
async function load (instance, callback) {
  return function handler (req) {
    return callback.call(instance, req)
  }
}

// Returns a userland thenable (NOT a native Promise) that resolves to a
// handler. Because the returned value is not `instanceof Promise`, the wrapper
// side-chains it and returns the original object, so a subscriber cannot mutate
// its resolved value.
function loadThenable (instance, callback) {
  const handler = function handler (req) {
    return callback.call(instance, req)
  }
  return {
    then (onResolve) {
      onResolve(handler)
    }
  }
}

module.exports = { load, loadThenable }
