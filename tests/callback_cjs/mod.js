function fetch (url, callback) {
  process.nextTick(() => {
    callback(null, 42)
  })
}

module.exports = { fetch }
