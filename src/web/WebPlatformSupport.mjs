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
  }

  /**
   * @return {number}
   */
  requestIdleCallback(callback) {
    return this._requestIdleCallback.call(null, callback);
  }

  /**
   * @param {number} callbackId
   */
  cancelIdleCallback(id) {
    this._cancelIdleCallback.call(null, id);
  }

  static instance() {
    if (!platformSupport)
      platformSupport = new WebPlatformSupport();
    return platformSupport;
  }
}

