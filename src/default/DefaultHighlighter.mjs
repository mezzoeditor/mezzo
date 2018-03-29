import { Start } from '../core/Anchor.mjs';
import { TextDecorator } from '../core/Decorator.mjs';

export class DefaultHighlighter {
  constructor() {
    this._onDecorateCallback = this._onDecorate.bind(this);
  }

  /**
   * @param {!Viewport} viewport
   */
  install(viewport) {
    viewport.addDecorationCallback(this._onDecorateCallback);
  }

  /**
   * @param {!Viewport} viewport
   */
  uninstall(viewport) {
    viewport.removeDecorationCallback(this._onDecorateCallback);
  }

  /**
   * @param {!Viewport.VisibleContent} visibleContent
   * @return {!Viewport.DecorationResult}
   */
  _onDecorate(visibleContent) {
    let {from, to} = visibleContent.range;
    let decorator = new TextDecorator();
    decorator.add(Start(from), Start(to), 'syntax.default');
    return {text: [decorator]};
  }
};
