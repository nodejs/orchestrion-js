/**
 * Unless explicitly stated otherwise all files in this repository are licensed under the Apache-2.0 License.
 * This product includes software developed at Datadog (https://www.datadoghq.com/). Copyright 2025 Datadog, Inc.
 **/
class TestClass {
  constructor () {
    this.prop = true
  }

  async #testMe () {
    return 42
  }

  async testMe () {
    return this.#testMe()
  }
}

module.exports = TestClass
