import { TextDecorator } from "../core/Decorator.mjs";

export class DefaultHighlighter {
  constructor() {
    this._onFrameCallback = this._onFrame.bind(this);
  }

  /**
   * @param {!Viewport} viewport
   */
  install(viewport) {
    viewport.addFrameDecorationCallback(this._onFrameCallback);
  }

  /**
   * @param {!Viewport} viewport
   */
  uninstall(viewport) {
    viewport.removeFrameDecorationCallback(this._onFrameCallback);
  }

  /**
   * @param {!Frame} frame
   * @return {!FrameDecorationCallback}
   */
  _onFrame(frame) {
    let {from, to} = frame.range();
    let decorator = new TextDecorator();
    decorator.add(from, to, 'syntax.default');
    return {text: [decorator]};
  }
};
