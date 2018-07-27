import { Text } from './Text.mjs';
import { EventEmitter } from './EventEmitter.mjs';

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

export class Document extends EventEmitter {
  constructor() {
    super();
    this._text = new Text();
    this._tokenizer = null;
    this._dispatchingOnReplace = false;
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
   * @param {!Text|string} text
   */
  reset(text) {
    if (this._dispatchingOnReplace)
      throw new Error('Cannot replace from replacement callback');
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
    this._dispatchingOnReplace = true;
    this.emit(Document.Events.Replaced, replacement);
    this._dispatchingOnReplace = false;
  }

  /**
   * @param {number} from
   * @param {number} to
   * @param {!Text|string} insertion
   * @return {!Text}
   */
  replace(from, to, insertion) {
    if (this._dispatchingOnReplace)
      throw new Error('Cannot replace from replacement callback');
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
    this._dispatchingOnReplace = true;
    this.emit(Document.Events.Replaced, replacement);
    this._dispatchingOnReplace = false;
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

Document.Events = {
  Replaced: 'Replaced'
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
