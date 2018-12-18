import { EventEmitter } from '../core/utils/EventEmitter.mjs';
import { RangeTree } from '../core/utils/RangeTree.mjs';
import { Tokenizer } from "../core/editor/Tokenizer.mjs";
import { Document } from "../core/text/Document.mjs";

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
   * @param {FrameContent} frameContent
   */
  _onDecorate(frameContent) {
    const tokenizer = this._editor.tokenizer();
    if (!this._selectedWord || !tokenizer)
      return null;
    const decorations = new RangeTree();
    const word = this._selectedWord;
    for (const range of frameContent.ranges) {
      const iterator = this._document.text().iterator(range.from - word.length, range.from - word.length, range.to + word.length);
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
        decorations.add(iterator.offset - word.length, iterator.offset, 'search.match');
      }
    }
    frameContent.backgroundDecorations.push(decorations);
  }
};
