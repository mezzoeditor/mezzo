import { Start } from '../core/Anchor.mjs';
import { TextDecorator } from '../core/Decorator.mjs';
import { Tokenizer } from "../editor/Tokenizer.mjs";
import { Selection } from "../editor/Selection.mjs";

export class SelectedWordHighlighter {
  /**
   * @param {!Editor} editor
   */
  constructor(editor) {
    this._editor = editor;
    this._viewport = editor.viewport();
    this._document = editor.document();
    this._viewport.addDecorationCallback(this._onDecorate.bind(this));
    this._selection = editor.selection();
    this._selection.on(Selection.Events.Changed, this._onSelectionChanged.bind(this));
    this._selectedWord = '';
    this._selectedWordRange = null;
    this._enabled = true;
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
    if (!this._enabled || !this._selection.hasSingleRange())
      return;
    let selectionRange = this._selection.ranges()[0];
    if (selectionRange.from === selectionRange.to)
      return;
    let startPosition = this._document.offsetToPosition(selectionRange.from);
    let endPosition = this._document.offsetToPosition(selectionRange.to);
    if (startPosition.line !== endPosition.line)
      return;
    if (!Tokenizer.isWord(this._document, this._editor.tokenizer(), selectionRange))
      return;
    this._selectedWord = this._document.content(selectionRange.from, selectionRange.to);
    this._selectedWordRange = selectionRange;
  }

  /**
   * @param {!Viewport.VisibleContent} visibleContent
   * @return {?Viewpor.DecorationResult}
   */
  _onDecorate(visibleContent) {
    let tokenizer = this._editor.tokenizer();
    if (!this._selectedWord || !tokenizer)
      return null;
    const decorator = new TextDecorator();
    let word = this._selectedWord;
    for (let range of visibleContent.ranges) {
      let iterator = this._document.iterator(range.from - word.length, range.from - word.length, range.to + word.length);
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
        decorator.add(Start(iterator.offset - word.length), Start(iterator.offset), 'search.match');
      }
    }
    return {background: [decorator]};
  }
};
