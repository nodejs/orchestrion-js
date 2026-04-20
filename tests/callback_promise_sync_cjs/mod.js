function fetch (url, callback) {
  if (typeof callback === 'function') {
    process.nextTick(() => callback(null, 42))
  } else if (url === 'async') {
    return Promise.resolve(42)
  } else {
    return 42
  }
}

module.exports = { fetch }
