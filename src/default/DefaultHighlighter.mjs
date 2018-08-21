import { TextDecorator } from '../core/Decorator.mjs';

export class DefaultHighlighter {
  constructor(editor) {
    this._onDecorateCallback = this._onDecorate.bind(this);
    this._editor = editor;
    this._editor.addDecorationCallback(this._onDecorateCallback);
  }

  dispose() {
    this._editor.removeDecorationCallback(this._onDecorateCallback);
  }

  /**
   * @param {!VisibleContent} visibleContent
   * @return {!DecorationResult}
   */
  _onDecorate(visibleContent) {
    let {from, to} = visibleContent.range;
    let decorator = new TextDecorator();
    decorator.add(from, to, 'syntax.default');
    return {text: [decorator]};
  }
};
