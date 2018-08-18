import { Document } from '../core/Document.mjs';
import { Decorator } from '../core/Decorator.mjs';
import { Input } from './Input.mjs';
import { Search } from './Search.mjs';
import { History } from './History.mjs';
import { DefaultHighlighter } from '../default/DefaultHighlighter.mjs';
import { DefaultTokenizer } from '../default/DefaultTokenizer.mjs';
import { Measurer } from '../core/Markup.mjs';
import { Viewport } from '../core/Viewport.mjs';
import { EventEmitter } from '../core/EventEmitter.mjs';
import { LineDecorator } from '../core/Decorator.mjs';

export class PlatformSupport {
  /**
   * @param {function(?)} callback
   * @return {number}
   */
  requestIdleCallback(callback) { }

  /**
   * @param {number} callbackId
   */
  cancelIdleCallback(id) { }
}

export class Editor {
  /**
   * @param {!Measurer} measurer
   * @param {!Platform} platformSupport
   */
  constructor(measurer, platformSupport) {
    this._handles = new Decorator(true /* createHandles */);
    this._document = new Document();
    this._document.on(Document.Events.Changed, this._onDocumentChanged.bind(this));
    this._platformSupport = platformSupport;

    this._viewport = new Viewport(this._document, measurer);

    this._tokenizer = null;
    this.setTokenizer(new DefaultTokenizer());
    this._highlighter = null;

    this._search = new Search(this);
    this._input = new Input(this);

    // Add viewport decorator to style viewport.
    this._selectionDecorator = new SelectionDecorator(this._document);
    this._selectionDecorator.decorate(this._viewport);

    this.setHighlighter(new DefaultHighlighter(this));

    this._history = new History(this._document);

    this.reset('');
  }

  reset(text) {
    this._document.reset(text);
    this._document.setSelection([{focus: 0, anchor: 0}]);
    this._history.reset();
  }

  history() {
    return this._history;
  }

  /**
   * @return {!PlatformSupport}
   */
  platformSupport() {
    return this._platformSupport;
  }

  revealOffset(offset) {
    this._viewport.reveal({from: offset, to: offset}, {
      left: 10,
      right: 10,
      top: this._viewport.height() / 2,
      bottom: this._viewport.height() / 2,
    });
  }

  /**
   * @return {?Tokenizer}
   */
  tokenizer() {
    return this._tokenizer;
  }

  /**
   * @param {?Tokenizer} tokenizer
   */
  setTokenizer(tokenizer) {
    this._tokenizer = tokenizer;
  }

  /**
   * @return {!Document}
   */
  document() {
    return this._document;
  }

  viewport() {
    return this._viewport;
  }

  /**
   * @return {!Search}
   */
  search() {
    return this._search;
  }

  /**
   * @return {!Input}
   */
  input() {
    return this._input;
  }

  addHandle(from, to, onRemoved) {
    if (to === undefined)
      to = from;
    return new RangeHandle(this._document, this._handles, from, to, onRemoved);
  }

  setHighlighter(highlighter) {
    if (this._highlighter)
      this._highlighter.dispose();
    this._highlighter = highlighter;
  }

  /**
   * @param {!DocumentChangedEvent} event
   */
  _onDocumentChanged({replacements}) {
    for (const {offset, removed, inserted} of replacements) {
      for (let removedHandle of this._handles.replace(offset, offset + removed.length(), inserted.length()))
        removedHandle[RangeHandle._symbol]._wasRemoved();
    }
  }
}

class RangeHandle {
  constructor(document, decorator, from, to, onRemoved) {
    this._document = document;
    this._decorator = decorator;
    this._onRemoved = onRemoved || function() {};
    this._handle = decorator.add(from, to, this);
    this._handle[RangeHandle._symbol] = this;
  }

  remove() {
    if (this.removed())
      return;
    this._decorator.remove(this._handle);
    delete this._handle[RangeHandle._symbol];
    this._onRemoved = undefined;
  }

  resolve() {
    if (this.removed())
      throw new Error('Handle was removed');
    let {from, to, data} = this._decorator.resolve(this._handle);
    return {from, to};
  }

  _wasRemoved() {
    delete this._handle[RangeHandle._symbol];
    let onRemoved = this._onRemoved;
    this._onRemoved = undefined;
    onRemoved();
  }

  removed() {
    return !this._onRemoved;
  }
}

class SelectionDecorator {
  constructor(document) {
    this._document = document;
    this._rangeDecorator = new LineDecorator('selection.range');
    this._focusDecorator = new LineDecorator('selection.focus');
    this._staleDecorations = true;

    document.on(Document.Events.Changed, () => this._staleDecorations = true);
  }

  /**
   * @param {!Viewport} viewport
   */
  decorate(viewport) {
    viewport.addDecorationCallback(this._onDecorate.bind(this));
  }

  /**
   * @param {!Viewport.VisibleContent} visibleContent
   * @return {!Viewport.DecorationResult}
   */
  _onDecorate(visibleContent) {
    if (this._staleDecorations) {
      this._staleDecorations = false;
      this._rangeDecorator.clearAll();
      this._focusDecorator.clearAll();
      for (let range of this._document.selection()) {
        this._focusDecorator.add(range.focus, range.focus);
        let from = Math.min(range.focus, range.anchor);
        let to = Math.max(range.focus, range.anchor);
        if (range.focus !== range.anchor) {
          // This achieves a nice effect of line decorations spanning all the lines
          // of selection range, but not touching the next line when the focus is at
          // just at the start of it.
          this._rangeDecorator.add(from, to);
        } else {
          // On the contrary, collapsed selection at the start of the line
          // wants a full line highlight.
          this._rangeDecorator.add(from, to + 0.5);
        }
      }
    }
    return {background: [this._rangeDecorator, this._focusDecorator], lines: [this._rangeDecorator]};
  }

}

RangeHandle._symbol = Symbol('RangeHandle');
