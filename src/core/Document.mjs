import { Text } from './Text.mjs';
import { EventEmitter } from './EventEmitter.mjs';

/**
 * @typedef {{
 *   before: !Text,
 *   offset: number,
 *   inserted: !Text,
 *   removed: !Text,
 *   after: !Text,
 *   operation: string,
 * }} Replacement;
 */

/**
 * @typedef {!Array<!Replacement>} Replacements
 */

/**
 * @typedef {{
 *   line: number,
 *   column: number,
 * }} Position;
 */

export class Document extends EventEmitter {
  constructor() {
    super();
    this._text = new Text();
    this._operation = null;
    this._tokenizer = null;
    /** @type {!Map<function(!Replacements), !Replacements>} */
    this._replacements = new Map();
    this._dispatchingReplacements = false;
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
   * Starts an operation named |operation|. Any replacements made during this
   * operation will be atomically dispatched after endOperation() call.
   *
   * Operation must end synchronously. Attempting to create nested operations
   * will throw. This is intended to performs multiple replacements in a loop,
   * so be careful when handling control to some other code which could attempt
   * to modify document during operation.
   *
   * @param {string} operation
   */
  beginOperation(operation) {
    if (this._operation)
      throw new Error(`Another operation in progress, which probably didn't end synchronously`);
    this._operation = operation;
  }

  /**
   * Ends the operation. See beginOperation() for details.
   *
   * @param {string} operation
   */
  endOperation(operation) {
    if (this._operation !== operation)
      throw new Error('Unbalanced operations');
    this._operation = null;
    if (!this._dispatchingReplacements)
      this._dispatchReplacements();
  }

  /**
   * @param {!Text|string} text
   */
  reset(text) {
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
    this._addReplacement(replacement);
  }

  invalidate() {
    this.emit(Document.Events.Invalidate);
  }

  /**
   * Adds a callback to be notified about all replacement operations.
   *
   * Use operations to distinguish between your own and someone else's changes.
   * One-off replacements will have 'unknown' operation name.
   *
   * It is guaranteed that when the callback is executed, last replacement's
   * |after| text is strictly equal to what text() method returns.
   *
   * Note that when call to replace() is wrapped by an operation or made from
   * inside the replace callback, the callback for this new replacement will be
   * executed synchronously, but not necessarily from inside that replace() call.
   *
   * @param {function(!Replacements)} callback
   */
  addReplaceCallback(callback) {
    this._replacements.set(callback, []);
  }

  /**
   * Removed a callback. See addReplaceCallback() for details.
   *
   * @param {function(!Replacements)} callback
   */
  removeReplaceCallback(callback) {
    this._replacements.delete(callback);
  }

  /**
   * @param {number} from
   * @param {number} to
   * @param {!Text|string} insertion
   * @return {!Text}
   */
  replace(from, to, insertion) {
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
    this._addReplacement(replacement);
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

  /**
   * @param {!Replacement} replacement
   */
  _addReplacement(replacement) {
    replacement.operation = this._operation === null ? 'unknown' : this._operation;
    for (let replacements of this._replacements.values())
      replacements.push(replacement);
    if (this._operation === null && !this._dispatchingReplacements)
      this._dispatchReplacements();
  }

  _dispatchReplacements() {
    if (this._dispatchingReplacements || this._operation !== null)
      throw new Error('Inconsistent');
    this._dispatchingReplacements = true;
    let more = true;
    while (more) {
      more = false;
      for (let [callback, replacements] of this._replacements) {
        if (replacements.length) {
          more = true;
          this._replacements.set(callback, []);
          callback(replacements);
        }
      }
    }
    this._dispatchingReplacements = false;
    this.invalidate();
  }
};

Document.Events = {
  Invalidate: 'invalidate'
};

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
