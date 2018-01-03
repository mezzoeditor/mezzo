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
   * @param {!Viewport} viewport
   */
  onViewport(viewport) {
    let {from, to} = viewport.range();
    this._decorator.clear();
    this._decorator.add(from, to, 'syntax.default');
  }
};
