import { Document } from '../src/core/Document.mjs';
import { Tokenizer } from '../src/editor/Tokenizer.mjs';

export class AddNextOccurence {
  constructor(editor) {
    this._editor = editor;
    this._document = editor.document();

    this._resetState();
    this._muteChanged = false;
    this._document.on(Document.Events.Changed, () => {
      if (!this._muteChanged)
        this._resetState();
    });
  }

  _resetState() {
    this._nextOccurenceText = null;
    this._nextOccurenceGroupOnly = false;
    this._nextOccurenceSearchOffset = 0;
    this._nextOccurenceSearchEnd = 0;
  }

  addNext() {
    let tokenizer = this._editor.tokenizer();
    const selection = this._document.selection();
    if (!selection.length || !tokenizer)
      return false;
    let hasCollapsedRange = false;
    for (let range of selection)
      hasCollapsedRange = hasCollapsedRange || range.anchor === range.focus;
    // Step 1: if at least one range is collapased, then expand to boundaries every where
    if (hasCollapsedRange) {
      let ranges = [];
      for (let range of selection) {
        if (range.anchor === range.focus) {
          let offset = range.anchor;
          // Gravitate towards word selection in borderline cases for collapsed cursors.
          if (offset > 0 && tokenizer.isWordChar(this._document.text().iterator(offset - 1).current))
            --offset;
          let {from, to} = Tokenizer.characterGroupRange(this._document, this._editor.tokenizer(), offset);
          ranges.push({anchor: from, focus: to, upDownX: range.upDownX});
        } else {
          let anchor = Tokenizer.leftBoundary(this._document, this._editor.tokenizer(), Math.min(range.anchor, range.focus));
          let focus = Tokenizer.rightBoundary(this._document, this._editor.tokenizer(), Math.max(range.anchor, range.focus) - 1);
          ranges.push({anchor, focus, upDownX: range.upDownX});
        }
      }
      this._nextOccurenceGroupOnly = true;
      this._muteChanged = true;
      this._document.setSelection(ranges);
      this._muteChanged = false;
      return true;
    }
    // Step 2: if all ranges are non-collapsed, figure the text to search for.
    if (!this._nextOccurenceText) {
      let lastRange = selection[0];
      for (let range of selection) {
        if (range.anchor > lastRange.anchor)
          lastRange = range;
      }
      this._nextOccurenceText = this._document.text().content(Math.min(lastRange.anchor, lastRange.focus), Math.max(lastRange.anchor, lastRange.focus));
      this._nextOccurenceSearchOffset = Math.max(lastRange.anchor, lastRange.focus);
      this._nextOccurenceSearchEnd = Math.min(lastRange.anchor, lastRange.focus);
    }
    // Step 3: search for the text below the initial range, and then from top.
    while (this._nextOccurenceSearchOffset !== this._nextOccurenceSearchEnd) {
      let it = null;
      // Decide which half we should search.
      if (this._nextOccurenceSearchOffset < this._nextOccurenceSearchEnd)
        it = this._document.text().iterator(this._nextOccurenceSearchOffset, this._nextOccurenceSearchOffset, this._nextOccurenceSearchEnd);
      else
        it = this._document.text().iterator(this._nextOccurenceSearchOffset);
      let result = it.find(this._nextOccurenceText);
      if (!result) {
        this._nextOccurenceSearchOffset = it.offset > this._nextOccurenceSearchEnd ? 0 : it.offset;
        continue;
      }
      this._nextOccurenceSearchOffset = it.offset + this._nextOccurenceText.length;
      if (this._nextOccurenceGroupOnly) {
        let range = Tokenizer.characterGroupRange(this._document, this._editor.tokenizer(), it.offset);
        if (range.from !== it.offset || range.to !== it.offset + this._nextOccurenceText.length)
          continue;
      }
      let initialLength = selection.length;
      selection.push({anchor: it.offset, focus: it.offset + this._nextOccurenceText.length});
      this._muteChanged = true;
      this._document.setSelection(selection);
      this._muteChanged = false;

      // If we managed to add a new range - return. Otherwise, continue searching.
      if (this._document.selection().length > initialLength)
        return true;
    }
    return false;
  }
}
