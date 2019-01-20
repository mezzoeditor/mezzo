export class EventEmitter {
  constructor() {
    /** @type {!Map<string, !Set<EventEmitter.Listener>>} */
    this._listeners = new Map();
  }

  /**
   * @param {string} eventName
   * @param {EventEmitter.Listener} listener
   * @return {function():void}
   */
  on(eventName, listener) {
    let listeners = this._listeners.get(eventName);
    if (!listeners) {
      listeners = new Set();
      this._listeners.set(eventName, listeners);
    }
    listeners.add(listener);
    return this.removeListener.bind(this, eventName, listener);
  }

  /**
   * @param {string} eventName
   * @param {EventEmitter.Listener} listener
   */
  removeListener(eventName, listener) {
    let listeners = this._listeners.get(eventName);
    if (!listeners || !listeners.size)
      return;
    listeners.delete(listener);
  }

  /**
   * @param {string} eventName
   * @param {EventEmitter.Listener} listener
   */
  off(eventName, listener) {
    this.removeListener(eventName, listener);
  }

  /**
   * @param {string} eventName
   * @param {...*} args
   */
  emit(eventName, ...args) {
    let listeners = this._listeners.get(eventName);
    if (!listeners || !listeners.size)
      return;
    listeners = new Set(listeners);
    for (const listener of listeners)
      listener.call(null, ...args);
  }

  /**
   * @param {!Array<function():void>} descriptors
   */
  static removeEventListeners(descriptors) {
    for (const descriptor of descriptors)
      descriptor.call(null);
    descriptors.splice(0, descriptors.length);
  }
}

/**
 * @typedef {function(*):any} EventEmitter.Listener
 */
