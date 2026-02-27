/**
 * Unless explicitly stated otherwise all files in this repository are licensed under the Apache-2.0 License.
 * This product includes software developed at Datadog (https://www.datadoghq.com/). Copyright 2025 Datadog, Inc.
 **/
class Streamer {
  async *#generate(n) {
    for (let i = 0; i < n; i++) yield i;
  }

  generate(n) {
    return this.#generate(n);
  }
}

module.exports = Streamer;
