import { Document } from '../core/Document.mjs';
import { Decorator } from '../core/Decorator.mjs';
import { Selection } from './Selection.mjs';
import { History } from './History.mjs';
import { Input } from './Input.mjs';
import { Search } from './Search.mjs';
import { DefaultHighlighter } from '../default/DefaultHighlighter.mjs';
import { DefaultTokenizer } from '../default/DefaultTokenizer.mjs';
import { Viewport, Measurer } from '../core/Viewport.mjs';
import { EventEmitter } from '../core/EventEmitter.mjs';

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
    this._document.addReplaceCallback(this._onReplace.bind(this));
    this._platformSupport = platformSupport;

    this._viewport = new Viewport(this._document, measurer);

    this._tokenizer = null;
    this.setTokenizer(new DefaultTokenizer());
    this._highlighter = null;

    this._selection = new Selection(this);
    this._search = new Search(this);
    this._history = new History(this);
    this._input = new Input(this);

    this.setHighlighter(new DefaultHighlighter(this));
  }

  reset(text) {
    this._document.reset(text);
    this._history.reset();
  }

  /**
   * @return {!PlatformSupport}
   */
  platformSupport() {
    return this._platformSupport;
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
   * @return {!Selection}
   */
  selection() {
    return this._selection;
  }

  /**
   * @return {!History}
   */
  history() {
    return this._history;
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

  _onReplace(replacements) {
    for (let {offset, removed, inserted} of replacements) {
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

RangeHandle._symbol = Symbol('RangeHandle');
