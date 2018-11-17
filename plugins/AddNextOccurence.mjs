import { Document } from '../src/text/Document.mjs';
import { Tokenizer } from '../src/editor/Tokenizer.mjs';

export class AddNextOccurence {
  constructor(editor) {
    this._metadataSymbol = Symbol('AddNextOccurence.metadata');
    this._editor = editor;
    this._document = editor.document();
  }

  _state() {
    const state = this._document.metadata(this._metadataSymbol);
    if (state)
      return Object.assign({}, state);
    return {
      nextOccurenceText: null,
      nextOccurenceGroupOnly: false,
      nextOccurenceSearchOffset: 0,
      nextOccurenceSearchEnd: 0
    };
  }

  addNext() {
    let tokenizer = this._editor.tokenizer();
    const selection = this._document.selection();
    if (!selection.length || !tokenizer)
      return false;
    const state = this._state();
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
      state.nextOccurenceGroupOnly = true;
      this._document.setSelection(ranges);
      this._document.setMetadata(this._metadataSymbol, state);
      return true;
    }
    // Step 2: if all ranges are non-collapsed, figure the text to search for.
    if (!state.nextOccurenceText) {
      let lastRange = selection[0];
      for (let range of selection) {
        if (range.anchor > lastRange.anchor)
          lastRange = range;
      }
      state.nextOccurenceText = this._document.text().content(Math.min(lastRange.anchor, lastRange.focus), Math.max(lastRange.anchor, lastRange.focus));
      state.nextOccurenceSearchOffset = Math.max(lastRange.anchor, lastRange.focus);
      state.nextOccurenceSearchEnd = Math.min(lastRange.anchor, lastRange.focus);
    }
    // Step 3: search for the text below the initial range, and then from top.
    while (state.nextOccurenceSearchOffset !== state.nextOccurenceSearchEnd) {
      let it = null;
      // Decide which half we should search.
      if (state.nextOccurenceSearchOffset < state.nextOccurenceSearchEnd)
        it = this._document.text().iterator(state.nextOccurenceSearchOffset, state.nextOccurenceSearchOffset, state.nextOccurenceSearchEnd);
      else
        it = this._document.text().iterator(state.nextOccurenceSearchOffset);
      let result = it.find(state.nextOccurenceText);
      if (!result) {
        state.nextOccurenceSearchOffset = it.offset > state.nextOccurenceSearchEnd ? 0 : it.offset;
        continue;
      }
      state.nextOccurenceSearchOffset = it.offset + state.nextOccurenceText.length;
      if (state.nextOccurenceGroupOnly) {
        let range = Tokenizer.characterGroupRange(this._document, this._editor.tokenizer(), it.offset);
        if (range.from !== it.offset || range.to !== it.offset + state.nextOccurenceText.length)
          continue;
      }
      selection.push({anchor: it.offset, focus: it.offset + state.nextOccurenceText.length});
      // If we managed to add a new range - return. Otherwise, continue searching.
      if (this._document.setSelection(selection)) {
        this._document.setMetadata(this._metadataSymbol, state);
        return true;
      }
    }
    return false;
  }
}
