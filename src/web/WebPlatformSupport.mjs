let platformSupport = null;

export class WebPlatformSupport {
  constructor() {
    if (window.requestIdleCallback) {
      this._requestIdleCallback = callback => window.requestIdleCallback(callback.bind(null), {timeout: 1000});
      this._cancelIdleCallback = window.cancelIdleCallback.bind(window);
    } else {
      this._requestIdleCallback = window.requestAnimationFrame.bind(window);
      this._cancelIdleCallback = window.cancelAnimationFrame.bind(window);
    }
    this._throttleId = null;
    this._lastId = 0;
    this._map = new Map();
  }

  createWorker(workerFunction) {
    const code = [
      `(${workerFunction.toString()})(self, {
        createWorker: () => null,
        requestIdleCallback: callback => setTimeout(callback, 0),
        cancelIdleCallback: id => clearTimeout(id),
      });`,
      '//# sourceURL=webworker.js'
    ].join('\n');
    const url = URL.createObjectURL(new Blob([code], {
      type: 'text/javascript'
    }));
    return new Worker(url, {type: 'module'});
  }

  /**
   * @return {number}
   */
  requestIdleCallback(callback) {
    const id = ++this._lastId;
    this._map.set(id, {callback, platformId: 0});
    if (!this._throttleId)
      this._schedule(id);
    return id;
  }

  /**
   * @param {number} id
   */
  cancelIdleCallback(id) {
    const o = this._map.get(id);
    if (!o)
      return;
    if (o.platformId)
      this._cancel(id);
    this._map.delete(id);
  }

  /**
   * @param {number} ms
   */
  throttle(ms) {
    if (this._throttleId) {
      window.clearTimeout(this._throttleId);
    } else {
      for (const [id, o] of this._map) {
        if (o.platformId)
          this._cancel(id);
      }
    }
    this._throttleId = window.setTimeout(() => {
      this._throttleId = 0;
      for (const [id, o] of this._map) {
        if (!o.platformId)
          this._schedule(id);
      }
    }, ms);
  }

  /**
   * @param {number} id
   */
  _schedule(id) {
    this._map.get(id).platformId =
        this._requestIdleCallback.call(null, this._runCallback.bind(this, id));
  }

  /**
   * @param {number} id
   */
  _cancel(id) {
    const o = this._map.get(id);
    this._cancelIdleCallback.call(null, o.platformId);
    o.platformId = 0;
  }

  /**
   * @param {number} id
   */
  _runCallback(id) {
    const callback = this._map.get(id).callback;
    this._map.delete(id);
    callback();
  }

  static instance() {
    if (!platformSupport)
      platformSupport = new WebPlatformSupport();
    return platformSupport;
  }
}

