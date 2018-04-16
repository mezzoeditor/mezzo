import { Start } from '../core/Anchor.mjs';
import { TextDecorator } from '../core/Decorator.mjs';

export class DefaultHighlighter {
  constructor(editor) {
    this._onDecorateCallback = this._onDecorate.bind(this);

    this._viewport = editor.viewport();
    this._viewport.addDecorationCallback(this._onDecorateCallback);
  }

  dispose() {
    this._viewport.removeDecorationCallback(this._onDecorateCallback);
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
