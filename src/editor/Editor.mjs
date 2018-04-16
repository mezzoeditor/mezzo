import { Document } from '../core/Document.mjs';
import { Decorator } from '../core/Decorator.mjs';
import { Selection } from './Selection.mjs';
import { History } from './History.mjs';
import { Editing } from './Editing.mjs';
import { Search } from './Search.mjs';
import { SelectedWordHighlighter } from '../plugins/SelectedWordHighlighter.mjs';
import { SmartBraces } from '../plugins/SmartBraces.mjs';
import { BlockIndentation } from '../plugins/BlockIndentation.mjs';
import { DefaultHighlighter } from '../default/DefaultHighlighter.mjs';
import { DefaultTokenizer } from '../default/DefaultTokenizer.mjs';
import { Viewport, Measurer } from '../core/Viewport.mjs';
import { EventEmitter } from '../core/EventEmitter.mjs';

export class Editor extends EventEmitter {
  /**
   * @param {!Measurer} measurer
   */
  constructor(measurer) {
    super();
    this._handles = new Decorator(true /* createHandles */);
    this._document = new Document();
    this._document.addReplaceCallback(this._onReplace.bind(this));

    this._setupScheduler();

    this._viewport = new Viewport(this._document, measurer);

    this._tokenizer = null;
    this.setTokenizer(new DefaultTokenizer());
    this._highlighter = null;

    this._selection = new Selection(this);
    this._search = new Search(this);
    this.addIdleCallback(() => this._search.searchChunk());
    this._history = new History(this);
    this._editing = new Editing(this);
    this._selectedWordHighlighter = new SelectedWordHighlighter(this);
    this._smartBraces = new SmartBraces(this);
    this._blockIndentation = new BlockIndentation(this);

    this.setHighlighter(new DefaultHighlighter(this));
  }

  invalidate() {
    this.emit(Editor.Events.Invalidate);
  }

  reset(text) {
    this._document.reset(text);
    this._history.reset();
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
   * @return {!Editing}
   */
  editing() {
    return this._editing;
  }

  addIdleCallback(callback) {
    this._idleCallbacks.push(callback);
  }

  removeIdleCallback(callback) {
    let index = this._idleCallbacks.indexOf(callback);
    if (index !== -1)
      this._idleCallbacks.splice(index, 1);
  }

  addDecorationCallback(callback) {
    this._viewport.addDecorationCallback(callback);
    this.invalidate();
  }

  removeDecorationCallback(callback) {
    this._viewport.removeDecorationCallback(callback);
    this.invalidate();
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
    this.invalidate();
  }

  find(query) {
    this._selectedWordHighlighter.setEnabled(false);
    this._search.search({query});
  }

  findCancel() {
    this._selectedWordHighlighter.setEnabled(true);
    this._search.cancel();
  }

  _setupScheduler() {
    this._idleCallbacks = [];
    let scheduleId = null;

    let runCallbacks = (deadline) => {
      scheduleId = null;
      while (true) {
        let hasMore = false;
        for (let idleCallback of this._idleCallbacks)
          hasMore |= idleCallback();
        if (!hasMore || deadline.didTimeout || deadline.timeRemaining() <= 0)
          break;
      }
      schedule();
    };

    let schedule = () => {
      if (!scheduleId)
        scheduleId = self.requestIdleCallback(runCallbacks, {timeout: 1000});
    };

    schedule();
  }

  _onReplace(replacements) {
    for (let {offset, removed, inserted} of replacements) {
      for (let removedHandle of this._handles.replace(offset, offset + removed.length(), inserted.length()))
        removedHandle[RangeHandle._symbol]._wasRemoved();
    }
  }
}

Editor.Events = {
  Invalidate: 'invalidate'
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

RangeHandle._symbol = Symbol('RangeHandle');
