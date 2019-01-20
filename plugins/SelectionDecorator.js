import { Document } from '../core/text/Document.js';
import { RangeTree } from '../core/utils/RangeTree.js';
import { EventEmitter } from '../core/utils/EventEmitter.js';

export class SelectionDecorator {
  constructor(editor) {
    this._editor = editor;
    this._document = editor.document();
    this._ranges = new RangeTree();
    this._focus = new RangeTree();
    this._staleDecorations = true;

    this._focusVisible = true;

    this._eventListeners = [
      this._document.on(Document.Events.Changed, this._onDocumentChanged.bind(this)),
      editor.addDecorationCallback(this._onDecorate.bind(this)),
    ];
  }

  editor() {
    return this._editor;
  }

  setRenderSelectionFocus(visible) {
    if (this._focusVisible === visible)
      return;
    this._focusVisible = visible;
    this._editor.raf();
  }

  _onDocumentChanged() {
    this._staleDecorations = true;
  }

  dispose() {
    EventEmitter.removeEventListeners(this._eventListeners);
  }

  /**
   * @param {FrameContent} frameContent
   */
  _onDecorate(frameContent) {
    if (this._staleDecorations) {
      this._staleDecorations = false;
      this._ranges.clearAll();
      this._focus.clearAll();
      for (let range of this._document.selection()) {
        this._focus.add(range.focus, range.focus, 'selection.focus');
        let from = Math.min(range.focus, range.anchor);
        let to = Math.max(range.focus, range.anchor);
        if (range.focus !== range.anchor) {
          // This achieves a nice effect of line decorations spanning all the lines
          // of selection range, but not touching the next line when the focus is at
          // just at the start of it.
          this._ranges.add(from, to, 'selection.range');
        } else {
          // On the contrary, collapsed selection at the start of the line
          // wants a full line highlight.
          this._ranges.add(from, to + 0.5, 'selection.range');
        }
      }
    }
    frameContent.backgroundDecorations.push(this._ranges);
    if (this._focusVisible)
      frameContent.backgroundDecorations.push(this._focus);
    frameContent.lineDecorations.push({style: 'selection.range', ranges: this._ranges});
  }
}

