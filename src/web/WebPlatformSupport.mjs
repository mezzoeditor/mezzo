let platformSupport = null;

export class WebPlatformSupport {
  /**
   * @return {number}
   */
  requestIdleCallback(callback) {
    return window.requestIdleCallback(() => callback(), {timeout: 1000});
  }

  /**
   * @param {number} callbackId
   */
  cancelIdleCallback(id) {
    window.cancelIdleCallback(id);
  }

  static instance() {
    if (!platformSupport)
      platformSupport = new WebPlatformSupport();
    return platformSupport;
  }
}

