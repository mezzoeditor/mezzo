import { Start } from '../src/core/Anchor.mjs';
import { TextDecorator } from '../src/core/Decorator.mjs';
import { Tokenizer } from "../src/editor/Tokenizer.mjs";
import { Selection } from "../src/editor/Selection.mjs";
import { Search } from "../src/editor/Search.mjs";

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
    editor.search().on(Search.Events.Changed, this._onSearchChanged.bind(this));
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

  /**
   * @param {!Object} event
   */
  _onSearchChanged({enabled}) {
    this.setEnabled(!enabled);
  }

  _onSelectionChanged() {
    this._selectedWord = '';
    if (!this._enabled || !this._selection.hasSingleRange())
      return;
    let selectionRange = this._selection.ranges()[0];
    if (selectionRange.from === selectionRange.to)
      return;
    let startPosition = this._document.text().offsetToPosition(selectionRange.from);
    let endPosition = this._document.text().offsetToPosition(selectionRange.to);
    if (startPosition.line !== endPosition.line)
      return;
    if (!Tokenizer.isWord(this._document, this._editor.tokenizer(), selectionRange))
      return;
    this._selectedWord = this._document.text().content(selectionRange.from, selectionRange.to);
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
        decorator.add(Start(iterator.offset - word.length), Start(iterator.offset), 'search.match');
      }
    }
    return {background: [decorator]};
  }
};
