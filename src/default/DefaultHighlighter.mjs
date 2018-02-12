import { TextDecorator } from "../core/Decorator.mjs";

export class DefaultHighlighter {
  constructor() {
  }

  /**
   * @override
   * @param {!Frame} frame
   * @return {!PluginFrameResult}
   */
  onFrame(frame) {
    let {from, to} = frame.range();
    let decorator = new TextDecorator();
    decorator.add(from, to, 'syntax.default');
    return {text: [decorator]};
  }
};
