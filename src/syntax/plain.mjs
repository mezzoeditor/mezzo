import { Decorator } from "../core/Decorator.mjs";

export default class {
  constructor() {
    this._decorator = new Decorator();
  }

  /**
   * @override
   * @param {!Document} document
   */
  onAdded(document) {
    document.addDecorator(this._decorator);
  }

  /**
   * @override
   * @param {!Document} document
   */
  onRemoved(document) {
    document.removeDecorator(this._decorator);
  }

  /**
   * @override
   * @param {!Frame} frame
   */
  onFrame(frame) {
    let {from, to} = frame.range();
    this._decorator.clearAll();
    this._decorator.add(from, to, 'syntax.default');
  }
};
