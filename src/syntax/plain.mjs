import { Decorator } from "../core/Decorator.mjs";

export default class {
  constructor() {
  }

  /**
   * @override
   * @param {!Frame} frame
   * @return {!Array<!Decorator>}
   */
  onFrame(frame) {
    let {from, to} = frame.range();
    let decorator = new Decorator();
    decorator.add(from, to, 'syntax.default');
    return [decorator];
  }
};
