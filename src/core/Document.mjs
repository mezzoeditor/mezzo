import { Text } from './Text.mjs';

/**
 * @typedef {{
 *   before: !Text,
 *   offset: number,
 *   inserted: !Text,
 *   removed: !Text,
 *   after: !Text,
 * }} Replacement;
 */

/**
 * @typedef {{
 *   line: number,
 *   column: number,
 * }} Position;
 */

export class Document {
  /**
   * @param {function()} invalidateCallback
   */
  constructor(invalidateCallback) {
    this._invalidateCallback = invalidateCallback;
    this._text = new Text();
    this._frozenSymbols = [];
    this._tokenizer = null;
    this._replaceCallbacks = [];
  }

  /**
   * @return {!Text}
   */
  text() {
    return this._text;
  }

  /**
   * @param {number=} fromOffset
   * @param {number=} toOffset
   * @return {string}
   */
  content(fromOffset, toOffset) {
    let {from, to} = this._clamp(fromOffset, toOffset);
    return this._text.content(from, to);
  }

  /**
   * @param {number} offset
   * @param {number=} fromOffset
   * @param {number=} toOffset
   * @return {!TextIterator}
   */
  iterator(offset, fromOffset, toOffset) {
    let {from, to} = this._clamp(fromOffset, toOffset);
    offset = Math.max(from, offset);
    offset = Math.min(to, offset);
    return this._text.iterator(offset, from, to);
  }

  /**
   * @param {number} offset
   * @return {?Position}
   */
  offsetToPosition(offset) {
    return this._text.offsetToPosition(offset);
  }

  /**
   * @param {!Position} position
   * @param {boolean=} strict
   * @return {number}
   */
  positionToOffset(position, strict) {
    return this._text.positionToOffset(position, strict);
  }

  /**
   * @return {number}
   */
  lineCount() {
    return this._text.lineCount();
  }

  /**
   * @return {number}
   */
  length() {
    return this._text.length();
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
   * @param {symbol} symbol
   */
  freeze(symbol) {
    this._frozenSymbols.push(symbol);
  }

  /**
   * @param {symbol} symbol
   */
  unfreeze(symbol) {
    if (this._frozenSymbols.pop() !== symbol)
      throw new Error('Unbalanced unfreeze');
  }

  /**
   * @param {!Text|string} text
   */
  reset(text) {
    if (this._frozenSymbols.length)
      throw new Error('Cannot edit while frozen');
    if (typeof text === 'string')
      text = Text.fromString(text);
    let replacement = {
      before: this._text,
      offset: 0,
      inserted: text,
      removed: this._text,
      after: text
    };
    this._text = text;
    for (let callback of this._replaceCallbacks)
      callback(replacement);
    this.invalidate();
  }

  invalidate() {
    this._invalidateCallback.call(null);
  }

  /**
   * @param {function(!Replacement)} callback
   */
  addReplaceCallback(callback) {
    this._replaceCallbacks.push(callback);
  }

  /**
   * @param {function(!Replacement)} callback
   */
  removeReplaceCallback(callback) {
    let index = this._replaceCallbacks.indexOf(callback);
    if (index !== -1)
      this._replaceCallbacks.splice(index, 1);
  }

  /**
   * @param {number} from
   * @param {number} to
   * @param {!Text|string} insertion
   * @param {symbol=} symbol
   * @return {!Text}
   */
  replace(from, to, insertion, symbol) {
    if (this._frozenSymbols.length && this._frozenSymbols[this._frozenSymbols.length - 1] !== symbol)
      throw new Error('Cannot edit while frozen');
    this.freeze(Document._replaceFreeze);
    if (typeof insertion === 'string')
      insertion = Text.fromString(insertion);
    let {result, removed} = this._text.replace(from, to, insertion);
    let replacement = {
      before: this._text,
      offset: from,
      removed: removed,
      inserted: insertion,
      after: result
    };
    this._text = result;
    for (let callback of this._replaceCallbacks)
      callback(replacement);
    this.unfreeze(Document._replaceFreeze);
    this.invalidate();
    return removed;
  }

  /**
   * @param {number=} from
   * @param {number=} to
   * @return {!Range}
   */
  _clamp(from, to) {
    if (from === undefined)
      from = 0;
    from = Math.max(0, from);
    if (to === undefined)
      to = this._text.length();
    to = Math.min(this._text.length(), to);
    return {from, to};
  }
};

Document._replaceFreeze = Symbol('Document.replace');

Document.test = {};

/**
 * @param {!Document} document
 * @param {!Array<string>} chunks
 */
Document.test.setChunks = function(document, chunks) {
  document._text = Text.fromChunks(chunks);
};

/**
 * @param {!Document} document
 * @param {string} content
 * @param {number} chunkSize
 */
Document.test.setContent = function(document, content, chunkSize) {
  document._text = Text.fromString(content, chunkSize);
};
