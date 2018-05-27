export class TestMeasurer {
  lineHeight() {
    return 10;
  }

  defaultWidth() {
    return 10;
  }

  defaultWidthRegex() {
    return /^.*$/;
  }

  measureString(s) {
    throw new Error('UNREACHABLE CODE');
  }
}

export class TestPlatformSupport {
  constructor() {
    this._id = 0;
    this._callbacks = new Map();
  }

  requestIdleCallback(callback) {
    this._callbacks.set(++this._id, callback);
  }

  cancelIdleCallback(id) {
    this._callbacks.delete(id);
  }

  runUntilIdle() {
    while (this._callbacks.size) {
      const [id, callback] = this._callbacks[Symbol.iterator]().next().value;
      this._callbacks.delete(id);
      callback.call(null);
    }
  }
}

