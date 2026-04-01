/**
 * Unless explicitly stated otherwise all files in this repository are licensed under the Apache-2.0 License.
 * This product includes software developed at Datadog (https://www.datadoghq.com/). Copyright 2025 Datadog, Inc.
 **/

/**
 * A Promise subclass with an extra method, similar to Anthropic SDK's APIPromise.
 * The instrumented wrapper must preserve the original return type so callers
 * can still access subclass-specific methods like `.withResponse()`.
 */
class ExtendedPromise extends Promise {
  withResponse () {
    return this.then(result => ({ data: result, response: { status: 200 } }))
  }
}

/**
 * NOTE: Intentionally NOT async. Async functions always wrap their return value
 * in a native Promise, losing the subclass type. The real-world scenario
 * (e.g. Anthropic SDK's APIPromise) uses a non-async function that explicitly
 * constructs and returns a Promise subclass instance.
 */
function fetch (url) {
  return new ExtendedPromise(resolve => resolve(42))
}

module.exports = { fetch }
