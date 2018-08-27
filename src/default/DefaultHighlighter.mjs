import { TextDecorator } from '../core/Decorator.mjs';
import { EventEmitter } from '../core/EventEmitter.mjs';

export class DefaultHighlighter {
  constructor(editor) {
    this._eventListeners = [
      editor.addDecorationCallback(this._onDecorate.bind(this)),
    ];
  }

  dispose() {
    EventEmitter.removeEventListeners(this._eventListeners);
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
