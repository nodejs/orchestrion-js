class Base {}

class Undici extends Base {
  async fetch(url) {
    return 42;
  }
}

module.exports = { Undici };
