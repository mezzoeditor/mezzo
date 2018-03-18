import { RoundMode, Metrics } from './Metrics.mjs';
import { Tree } from './Tree.mjs';
import { TextIterator } from './TextIterator.mjs';

/**
 * @typedef {{
 *   from: number,
 *   to: number,
 *   inserted: number,
 *   removed: string
 * }} Replacement;
 */

/**
 * @typedef {{
 *   line: number,
 *   column: number,
 * }} Position;
 */

class CharactersMeasurer {
  defaultWidth() {
    return 1;
  }

  defaultRegex() {
    return Metrics.bmpRegex;
  }

  measureBMP(char) {
    return 1;
  }

  measureSupplementary(char) {
    return 1;
  }
};

export class Document {
  /**
   * @param {function()} invalidateCallback
   */
  constructor(invalidateCallback) {
    this._invalidateCallback = invalidateCallback;
    this._metrics = new Metrics(new CharactersMeasurer());
    this._setTree(this._treeWithContent(''));
    this._frozenSymbols = [];
    this._tokenizer = null;
    this._replaceCallbacks = [];
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
      throw 'Unbalanced unfreeze';
  }

  /**
   * @param {string} content
   */
  reset(content) {
    if (this._frozenSymbols.length)
      throw 'Cannot edit while frozen';
    let to = this._length;
    let removed = this.content();
    this._setTree(this._treeWithContent(content));
    let replacement = {from: 0, to, inserted: content.length, removed};
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
   * @param {string} insertion
   * @param {symbol=} symbol
   * @return {string}
   */
  replace(from, to, insertion, symbol) {
    if (this._frozenSymbols.length && this._frozenSymbols[this._frozenSymbols.length - 1] !== symbol)
      throw 'Cannot edit while frozen';
    this.freeze(Document._replaceFreeze);
    let removed = this._replaceRange(from, to, insertion);
    let replacement = {from, to, inserted: insertion.length, removed};
    for (let callback of this._replaceCallbacks)
      callback(replacement);
    this.unfreeze(Document._replaceFreeze);
    this.invalidate();
    return removed;
  }

  /**
   * @param {number=} fromOffset
   * @param {number=} toOffset
   * @return {string}
   */
  content(fromOffset, toOffset) {
    let {from, to} = this._clamp(fromOffset, toOffset);
    let iterator = this.iterator(from, from, to);
    return iterator.substr(to - from);
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
    let it = this._tree.iterator(offset, from, to);
    return new TextIterator(it, offset, from, to, this._length);
  }

  /**
   * @return {number}
   */
  lineCount() {
    return this._lineCount;
  }

  /**
   * @return {number}
   */
  length() {
    return this._length;
  }

  /**
   * @param {number} offset
   * @return {?Position}
   */
  offsetToPosition(offset) {
    let found = this._tree.findByOffset(offset);
    if (found.location === null)
      return null;
    if (found.data === null)
      return {line: found.location.y, column: found.location.x};
    let location = this._metrics.locateByOffset(found.data, found.location, offset);
    return {line: location.y, column: location.x};
  }

  /**
   * @param {!Position} position
   * @param {boolean=} strict
   * @return {number}
   */
  positionToOffset(position, strict) {
    let found = this._tree.findByPoint({x: position.column, y: position.line}, !!strict);
    if (found.data === null)
      return found.location.offset;
    return this._metrics.locateByPoint(found.data, found.location, found.clampedPoint, strict).offset;
  }

  /**
   * @param {!Tree<string>} tree
   */
  _setTree(tree) {
    this._tree = tree;
    let metrics = tree.metrics();
    this._lineCount = (metrics.lineBreaks || 0) + 1;
    this._length = metrics.length;
  }

  /**
   * @param {string} content
   * @return {!Tree<string>}
   */
  _treeWithContent(content) {
    let chunks = this._metrics.chunkString(kDefaultChunkSize, content);
    return Tree.build(chunks, this._metrics.defaultWidth);
  }

  /**
   * @param {number} from
   * @param {number} to
   * @param {string} insertion
   * @return string
   */
  _replaceRange(from, to, insertion) {
    let split = this._tree.split(from, to);

    let removed = '';
    let first = '';
    let last = '';
    let middle = split.middle.collect();
    for (let i = 0; i < middle.length; i++) {
      let data = middle[i];
      let fromOffset = 0;
      let toOffset = data.length;
      if (i === 0) {
        fromOffset = from - split.left.metrics().length;
        first = data.substring(0, fromOffset);
      }
      if (i === middle.length - 1) {
        toOffset = data.length - (this._length - split.right.metrics().length - to);
        last = data.substring(toOffset);
      }
      removed += data.substring(fromOffset, toOffset);
    }

    let chunks = [];
    if (first.length + insertion.length + last.length > kDefaultChunkSize &&
        first.length + insertion.length <= kDefaultChunkSize) {
      // For typical editing scenarios, we are most likely to replace at the
      // end of |insertion| next time.
      chunks = this._metrics.chunkString(kDefaultChunkSize, last, first + insertion);
    } else {
      chunks = this._metrics.chunkString(kDefaultChunkSize, first + insertion + last);
    }

    this._setTree(Tree.build(chunks, this._metrics.defaultWidth, split.left, split.right));
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
      to = this._length;
    to = Math.min(this._length, to);
    return {from, to};
  }
};

Document._replaceFreeze = Symbol('Document.replace');

// This is very efficient for loading large files and memory consumption.
// It might slow down common operations though. We should measure that and
// consider different chunk sizes based on total document length.
let kDefaultChunkSize = 1000;

Document.test = {};

/**
 * @param {!Document} document
 * @param {!Array<string>} chunks
 */
Document.test.setChunks = function(document, chunks) {
  let nodes = chunks.map(chunk => ({data: chunk, metrics: document._metrics.forString(chunk)}));
  document._setTree(Tree.build(nodes, document._metrics.defaultWidth));
};

Document.test.setContent = function(document, content, chunkSize) {
  let chunks = document._metrics.chunkString(chunkSize, content);
  document._setTree(Tree.build(chunks, document._metrics.defaultWidth));
};
