import { EventEmitter } from '../src/core/EventEmitter.mjs';
import { TextDecorator } from '../src/core/Decorator.mjs';
import { Tokenizer } from "../src/editor/Tokenizer.mjs";
import { Document } from "../src/core/Document.mjs";

export class SelectedWordHighlighter {
  /**
   * @param {!Editor} editor
   */
  constructor(editor) {
    this._editor = editor;
    this._document = editor.document();
    this._selectedWord = '';
    this._selectedWordRange = null;
    this._enabled = true;

    this._eventListeners = [
      this._editor.addDecorationCallback(this._onDecorate.bind(this)),
      this._document.on(Document.Events.Changed, ({selectionChanged}) => {
        if (selectionChanged)
          this._onSelectionChanged();
      })
    ];
  }

  dispose() {
    EventEmitter.removeEventListeners(this._eventListeners);
    this._editor.raf();
  }

  /**
   * @param {boolean} enabled
   */
  setEnabled(enabled) {
    if (this._enabled === enabled)
      return;
    this._enabled = enabled;
    this._onSelectionChanged();
  }

  _onSelectionChanged() {
    this._selectedWord = '';
    if (!this._enabled || !this._document.hasSingleCursor())
      return;
    let selectionRange = this._document.selection()[0];
    if (selectionRange.focus === selectionRange.anchor)
      return;
    if (this._editor.markup().offsetToPoint(selectionRange.anchor).y !==
        this._editor.markup().offsetToPoint(selectionRange.focus).y)
      return;
    const range = {
      from: Math.min(selectionRange.anchor, selectionRange.focus),
      to: Math.max(selectionRange.anchor, selectionRange.focus)
    };
    if (!Tokenizer.isWord(this._document, this._editor.tokenizer(), range))
      return;
    this._selectedWord = this._document.text().content(range.from, range.to);
    this._selectedWordRange = range;
  }

  /**
   * @param {!VisibleContent} visibleContent
   * @return {?DecorationResult}
   */
  _onDecorate(visibleContent) {
    let tokenizer = this._editor.tokenizer();
    if (!this._selectedWord || !tokenizer)
      return null;
    const decorator = new TextDecorator();
    let word = this._selectedWord;
    for (let range of visibleContent.ranges) {
      let iterator = this._document.text().iterator(range.from - word.length, range.from - word.length, range.to + word.length);
      while (iterator.find(word)) {
        if (iterator.offset === this._selectedWordRange.from) {
          iterator.next();
          continue;
        }
        if (iterator.offset > 0 && tokenizer.isWordChar(iterator.charAt(-1))) {
          iterator.next();
          continue;
        }
        iterator.advance(word.length);
        if (tokenizer.isWordChar(iterator.current))
          continue;
        decorator.add(iterator.offset - word.length, iterator.offset, 'search.match');
      }
    }
    return {background: [decorator]};
  }
};
