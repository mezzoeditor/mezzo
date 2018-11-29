import { RangeTree } from '../utils/RangeTree.mjs';
import { EventEmitter } from '../utils/EventEmitter.mjs';

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
    let textDecorations = new RangeTree();
    textDecorations.add(from, to, 'syntax.default');
    return {text: [textDecorations]};
  }
};
