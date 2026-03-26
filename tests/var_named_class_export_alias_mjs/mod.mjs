class Base {
  async fetch (url) {
    return 0
  }
}

const J = class InternalName extends Base {
  async fetch (url) {
    return 42
  }
}

export { J as Undici }
