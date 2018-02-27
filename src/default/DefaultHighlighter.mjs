import { TextDecorator } from "../core/Decorator.mjs";

export class DefaultHighlighter {
  constructor() {
  }

  /**
   * @param {!Document} document
   */
  install(document) {
    document.addPlugin(this);
  }

  /**
   * @param {!Document} document
   */
  uninstall(document) {
    document.removePlugin(this);
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
