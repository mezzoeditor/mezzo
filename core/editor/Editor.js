import { Document } from '../text/Document.js';
import { RangeTree } from '../utils/RangeTree.js';
import { Input } from './Input.js';
import { DefaultTokenizer } from './Tokenizer.js';
import { Markup} from '../markup/Markup.js';
import { EventEmitter } from '../utils/EventEmitter.js';

export class Editor extends EventEmitter {
  /**
   * @param {!Mezzo.Measurer} measurer
   * @param {!Mezzo.PlatformSupport} platformSupport
   * @param {!Mezzo.Thread} thread
   * @return {!Promise<!Editor>}
   */
  static async createWithRemoteDocument(measurer, platformSupport, thread) {
    const remoteDocument = await thread.evaluate((t, Document) => {
      return t.expose(new Document());
    }, Document);
    return new Editor(new Document(), measurer, platformSupport, remoteDocument);
  }

  /**
   * @param {!Mezzo.Measurer} measurer
   * @param {!Mezzo.PlatformSupport} platformSupport
   * @return {!Editor}
   */
  static create(measurer, platformSupport) {
    return new Editor(new Document(), measurer, platformSupport, null);
  }

  /**
   * @param {!Mezzo.Document} document
   * @param {!Mezzo.Measurer} measurer
   * @param {!Mezzo.PlatformSupport} platformSupport
   * @param {?Mezzo.RemoteObject<Mezzo.Document>} remoteDocument
   */
  constructor(document, measurer, platformSupport, remoteDocument) {
    super();
    this._handles = new RangeTree(true /* createHandles */);
    this._document = document;
    this._document.on(Document.Events.Changed, this._onDocumentChanged.bind(this));
    this._platformSupport = platformSupport;
    /** @type {!Array<Mezzo.FrameDecorationCallback>} */
    this._decorationCallbacks = [this._onDecorate.bind(this)];

    this._markup = new Markup(measurer, this._document, platformSupport);

    this._tokenizer = null;
    this.setTokenizer(new DefaultTokenizer());
    this._highlighter = null;

    this._input = new Input(this);

    this._remoteDocument = remoteDocument;

    this.reset('');
  }

  /**
   * @param {Mezzo.FrameContent} frameContent
   */
  _onDecorate(frameContent) {
    // If there's no highlighter - just draw a black text.
    if (!this._highlighter) {
      const {from, to} = frameContent.range;
      const decorations = new RangeTree();
      decorations.add(from, to, 'syntax.default');
      frameContent.textDecorations.push(decorations);
    } else {
      for (const range of frameContent.ranges)
        frameContent.textDecorations.push(this._highlighter.highlight(range));
    }
  }

  remoteDocument() {
    return this._remoteDocument;
  }

  reset(text, selection = [{focus: 0, anchor: 0}]) {
    this._document.reset(text, selection);
  }

  /**
   * @return {!Mezzo.PlatformSupport}
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
   * @param {!Mezzo.Range} range
   * @param {!{left: number, right: number, top: number, bottom: number}=} padding
   */
  revealRange(range, padding) {
    this.emit(Editor.Events.Reveal, range, padding);
  }

  /**
   * @param {Mezzo.FrameDecorationCallback} callback
   * @return {function()}
   */
  addDecorationCallback(callback) {
    this._decorationCallbacks.push(callback);
    this.raf();
    return this.removeDecorationCallback.bind(this, callback);
  }

  /**
   * @param {Mezzo.FrameDecorationCallback} callback
   */
  removeDecorationCallback(callback) {
    let index = this._decorationCallbacks.indexOf(callback);
    if (index !== -1)
      this._decorationCallbacks.splice(index, 1);
    this.raf();
  }

  /**
   * @return {!Array<Mezzo.FrameDecorationCallback>}
   */
  decorationCallbacks() {
    return this._decorationCallbacks;
  }

  /**
   * @return {?Mezzo.Tokenizer}
   */
  tokenizer() {
    return this._tokenizer;
  }

  /**
   * @param {?Mezzo.Tokenizer} tokenizer
   */
  setTokenizer(tokenizer) {
    this._tokenizer = tokenizer;
  }

  /**
   * @return {!Mezzo.Document}
   */
  document() {
    return this._document;
  }

  /**
   * @return {!Mezzo.Markup}
   */
  markup() {
    return this._markup;
  }

  /**
   * @return {!Mezzo.Input}
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

  highlighter() {
    return this._highlighter;
  }

  /**
   * @param {!Mezzo.DocumentChangedEvent} event
   */
  _onDocumentChanged({replacements}) {
    for (const {offset, removed, inserted} of replacements) {
      for (let removedHandle of this._handles.replace(offset, offset + removed.length(), inserted.length()))
        removedHandle[RangeHandle._symbol]._wasRemoved();
      if (this._remoteDocument)
        this._remoteDocument.rpcIgnoreResult['replace'](offset, offset + removed.length(), inserted.content());
    }
  }
}

Editor.Events = {
  Raf: 'raf',
  Reveal: 'reveal',
};

class RangeHandle {
  constructor(document, tree, from, to, onRemoved) {
    this._document = document;
    this._tree = tree;
    this._onRemoved = onRemoved || function() {};
    this._handle = tree.add(from, to, this);
    this._handle[RangeHandle._symbol] = this;
  }

  remove() {
    if (this.removed())
      return;
    this._tree.remove(this._handle);
    delete this._handle[RangeHandle._symbol];
    this._onRemoved = undefined;
  }

  resolve() {
    if (this.removed())
      throw new Error('Handle was removed');
    let {from, to, data} = this._tree.resolve(this._handle);
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

RangeHandle._symbol = Symbol('RangeHandle');
