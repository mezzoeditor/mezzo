import { Text } from "./Text.mjs";
import { Frame } from "./Frame.mjs";
import { RoundMode, Unicode } from "./Unicode.mjs";

/**
 * @typedef {{
 *   from: number,
 *   to: number,
 *   inserted: number,
 *   removed: string
 * }} Replacement;
 */

export class Document {
  /**
   * @param {function()} invalidateCallback
   */
  constructor(invalidateCallback) {
    this._plugins = [];
    this._invalidateCallback = invalidateCallback;
    this._measurer = new Unicode.CachingMeasurer(1, 1, Unicode.anythingRegex, s => 1, s => 1);
    this._text = Text.withContent('', this._measurer);
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
   * @return {!Measurer}
   */
  measurer() {
    return this._measurer;
  }

  /**
   * @param {!Measurer} measurer
   */
  setMeasurer(measurer) {
    this._measurer = measurer;
    // TODO: this is not quite correct.
    // Instead, we should either rebuild the whole history or mark history states
    // with measurer and rebuild lazily.
    this.reset(this.content());
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
   * @param {string} text
   */
  reset(text) {
    if (this._frozenSymbols.length)
      throw 'Cannot edit while frozen';
    let to = this._text.length();
    let removed = this._text.content();
    this._text = Text.withContent(text, this._measurer);
    let replacement = {from: 0, to, inserted: text.length, removed};
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
    let {text, removed} = this._text.replace(from, to, insertion);
    this._text.resetCache();
    this._text = text;
    let replacement = {from, to, inserted: insertion.length, removed};
    for (let callback of this._replaceCallbacks)
      callback(replacement);
    this.unfreeze(Document._replaceFreeze);
    return removed;
  }

  /**
   * @param {!Plugin} plugin
   */
  addPlugin(plugin) {
    if (this._plugins.indexOf(plugin) !== -1)
      throw 'Duplicate plugin';
    this._plugins.push(plugin);
    if (plugin.onFrame)
      this.invalidate();
  }

  /**
   * @param {!Plugin} plugin
   */
  removePlugin(plugin) {
    let index = this._plugins.indexOf(plugin);
    if (index === -1)
      throw 'No such plugin';
    this._plugins.splice(index, 1);
    if (plugin.onFrame)
      this.invalidate();
  }

  /**
   * @param {number=} from
   * @param {number=} to
   * @return {string}
   */
  content(from, to) {
    return this._text.content(from, to);
  }

  /**
   * @param {number} offset
   * @param {number=} from
   * @param {number=} to
   * @return {!Text.Iterator}
   */
  iterator(offset, from, to) {
    return this._text.iterator(offset, from, to);
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
   * @return {!Location}
   */
  lastLocation() {
    return this._text.lastLocation();
  }

  /**
   * @return {number}
   */
  height() {
    return this._text.lastLocation().y + this._measurer.defaultHeight;
  }

  /**
   * @return {number}
   */
  longestLineWidth() {
    return this._text.longestLineWidth();
  }

  /**
   * @param {number} offset
   * @return {?Position}
   */
  offsetToPosition(offset) {
    return this._text.offsetToLocation(offset);
  }

  /**
   * @param {number} offset
   * @return {?Point}
   */
  offsetToPoint(offset) {
    return this._text.offsetToLocation(offset);
  }

  /**
   * @param {number} offset
   * @return {?Location}
   */
  offsetToLocation(offset) {
    return this._text.offsetToLocation(offset);
  }

  /**
   * @param {!Position} position
   * @param {boolean=} strict
   * @return {number}
   */
  positionToOffset(position, strict) {
    return this._text.positionToLocation(position, strict).offset;
  }

  /**
   * @param {!Position} position
   * @param {boolean=} strict
   * @return {!Location}
   */
  positionToLocation(position, strict) {
    return this._text.positionToLocation(position, strict);
  }

  /**
   * @param {!Point} point
   * @param {!RoundMode=} roundMode
   * @param {boolean=} strict
   * @return {!Position}
   */
  pointToPosition(point, roundMode = RoundMode.Floor, strict) {
    return this._text.pointToLocation(point, roundMode, strict);
  }

  /**
   * @param {!Point} point
   * @param {RoundMode=} roundMode
   * @param {boolean=} strict
   * @return {number}
   */
  pointToOffset(point, roundMode = RoundMode.Floor, strict) {
    return this._text.pointToLocation(point, roundMode, strict).offset;
  }

  /**
   * @param {!Point} point
   * @param {RoundMode=} roundMode
   * @param {boolean=} strict
   * @return {!Location}
   */
  pointToLocation(point, roundMode = RoundMode.Floor, strict) {
    return this._text.pointToLocation(point, roundMode, strict);
  }

  /**
   * @package
   * @param {!Frame} frame
   * @return {{text: !Array<!TextDecorator>, scrollbar: !Array<ScrollbarDecorator>}}
   */
  decorateFrame(frame) {
    this.freeze(Document._decorateFreeze);
    let text = [];
    let scrollbar = [];
    for (let plugin of this._plugins) {
      if (plugin.onFrame) {
        let result = plugin.onFrame(frame);
        text.push(...(result.text || []));
        scrollbar.push(...(result.scrollbar || []));
      }
    }
    this.unfreeze(Document._decorateFreeze);
    return {text, scrollbar};
  }
};

Document._replaceFreeze = Symbol('Document.replace');
Document._decorateFreeze = Symbol('Document.replace');
