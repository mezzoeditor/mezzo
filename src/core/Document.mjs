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

export class Document extends EventEmitter {
  constructor() {
    super();
    this._text = new Text();
    this._dispatchingOnReplace = false;

    this._operation = 0;
    this._operationReplacements = [];
  }

  /**
   * @return {!Text}
   */
  text() {
    return this._text;
  }

  /**
   * @param {function()} fun
   */
  operation(fun) {
    ++this._operation;
    const result = fun();
    --this._operation;
    this._maybeEmit();
  }

  _maybeEmit() {
    if (this._operation)
      return;
    const replacements = this._operationReplacements;
    this._operationReplacements = [];
    this._dispatchingOnReplace = true;
    this.emit(Document.Events.Replaced, replacements);
    this._dispatchingOnReplace = false;
  }

  /**
   * @param {!Text|string} text
   */
  reset(text) {
    if (this._dispatchingOnReplace)
      throw new Error('Cannot replace from replacement callback');
    if (typeof text === 'string')
      text = Text.fromString(text);
    const removed = this._text;
    this._operationReplacements.push({
      before: this._text,
      offset: 0,
      removed: this._text,
      inserted: text,
      after: text
    });
    this._text = text;
    this._maybeEmit();
    return removed;
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
    this._operationReplacements.push({
      before: this._text,
      offset: from,
      removed: removed,
      inserted: insertion,
      after: result
    });
    this._text = result;
    this._maybeEmit();
    return removed;
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
