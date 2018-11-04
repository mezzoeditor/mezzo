import { Document } from '../core/Document.mjs';
import { Decorator } from '../core/Decorator.mjs';
import { Input } from './Input.mjs';
import { DefaultHighlighter } from '../default/DefaultHighlighter.mjs';
import { DefaultTokenizer } from '../default/DefaultTokenizer.mjs';
import { Markup, Measurer } from '../core/Markup.mjs';
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

  /**
   * @param {number} ms
   */
  throttle(ms) { }

  /**
   * @param {function(port)} workerFunction
   * @return {?Worker}
   */
  createWorker(workerFunction) { }

  debugLogger(namespace) { return () => {} }
}

export class Editor extends EventEmitter {
  /**
   * @param {!Measurer} measurer
   * @param {!Platform} platformSupport
   * @param {!Thread} thread
   * @return {!Promise<!Editor>}
   */
  static async createWithRemoteDocument(measurer, platformSupport, thread) {
    const remoteDocument = await thread.evaluate((t, Document) => {
      return t.expose(new Document());
    }, Document);
    return new Editor(new Document(), measurer, platformSupport, remoteDocument);
  }

  /**
   * @param {!Measurer} measurer
   * @param {!Platform} platformSupport
   * @return {!Editor}
   */
  static create(measurer, platformSupport) {
    return new Editor(new Document(), measurer, platformSupport, null);
  }

  /**
   * @param {!Document} document
   * @param {!Measurer} measurer
   * @param {!Platform} platformSupport
   * @param {?Handle} remoteDocument
   */
  constructor(document, measurer, platformSupport, remoteDocument) {
    super();
    this._handles = new Decorator(true /* createHandles */);
    this._document = document;
    this._document.on(Document.Events.Changed, this._onDocumentChanged.bind(this));
    this._platformSupport = platformSupport;
    /** @type {!Array<DecorationCallback>} */
    this._decorationCallbacks = [];

    this._markup = new Markup(measurer, this._document, platformSupport);

    this._tokenizer = null;
    this.setTokenizer(new DefaultTokenizer());
    this._highlighter = null;

    this._input = new Input(this);

    this._selectionDecorator = new SelectionDecorator(this._document);
    this._selectionDecorator.decorate(this);

    this.setHighlighter(new DefaultHighlighter(this));

    this._remoteDocument = remoteDocument;

    this.reset('');
  }

  remoteDocument() {
    return this._remoteDocument;
  }

  reset(text, selection = [{focus: 0, anchor: 0}]) {
    this._document.reset(text, selection);
  }

  /**
   * @return {!PlatformSupport}
   */
  platformSupport() {
    return this._platformSupport;
  }

  raf() {
    this.emit(Editor.Events.Raf);
  }

  /**
   * @param {number} offset
   * @param {!{left: number, right: number, top: number, bottom: number}=} padding
   */
  revealOffset(offset, padding) {
    this.revealRange({from: offset, to: offset}, padding);
  }

  /**
   * @param {!Range} range
   * @param {!{left: number, right: number, top: number, bottom: number}=} padding
   */
  revealRange(range, padding) {
    this.emit(Editor.Events.Reveal, range, padding);
  }

  /**
   * @param {DecorationCallback} callback
   * @return {function()}
   */
  addDecorationCallback(callback) {
    this._decorationCallbacks.push(callback);
    this.raf();
    return this.removeDecorationCallback.bind(this, callback);
  }

  /**
   * @param {DecorationCallback} callback
   */
  removeDecorationCallback(callback) {
    let index = this._decorationCallbacks.indexOf(callback);
    if (index !== -1)
      this._decorationCallbacks.splice(index, 1);
    this.raf();
  }

  /**
   * @return {!Array<DecorationCallback>}
   */
  decorationCallbacks() {
    return this._decorationCallbacks;
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

  /**
   * @return {!Markup}
   */
  markup() {
    return this._markup;
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
      if (this._remoteDocument)
        this._remoteDocument.rpc.replace(offset, offset + removed.length(), inserted.content());
    }
  }
}

Editor.Events = {
  Raf: 'raf',
  Reveal: 'reveal',
};

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
   * @param {!Editor} editor
   */
  decorate(editor) {
    editor.addDecorationCallback(this._onDecorate.bind(this));
  }

  /**
   * @param {!VisibleContent} visibleContent
   * @return {!DecorationResult}
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
