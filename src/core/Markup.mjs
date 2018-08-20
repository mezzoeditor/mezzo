import { EventEmitter } from './EventEmitter.mjs';
import { Document } from './Document.mjs';
import { Decorator } from './Decorator.mjs';
import { Metrics } from './Metrics.mjs';
import { Tree } from './Tree.mjs';

/**
 * @typedef {{
 *   width: number
 * }} Mark
 */

 /**
 * Measurer converts strings to widths and provides line height.
 *
 * @interface
 */
export class Measurer {
  /**
   * The default width of a code point, should be a positive number.
   * Note that code points from Supplementary Planes cannot be given default width.
   * The total width of a |string| with all code points of default width will be
   * |string.length * defaultWidth|.
   *
   * @return {number}
   */
  defaultWidth() {
  }

  /**
   * Regex for strings which consist only of characters with default width and height.
   * Used for fast-path calculations.
   *
   * @return {?RegExp}
   */
  defaultWidthRegex() {
  }

  /**
   * Measures the width of a string.
   * @param {string} s
   */
  measureString(s) {
  }
};

export class Markup extends EventEmitter {
  /**
   * @param {!Measurer} measurer
   * @param {!Document} document
   */
  constructor(measurer, document) {
    super();
    this._document = document;
    this._document.on(Document.Events.Changed, ({replacements}) => {
      for (const replacement of replacements)
        this._replace(replacement);
    });
    this._text = document.text();
    this._marks = new Decorator(true /* createHandles */);
    this.setMeasurer(measurer);
  }

  /**
   * @param {!Measurer} measurer
   */
  setMeasurer(measurer) {
    this._lineHeight = measurer.lineHeight();
    this._defaultWidth = measurer.defaultWidth();
    let measure = s => measurer.measureString(s) / this._defaultWidth;
    this._metrics = new Metrics(measurer.defaultWidthRegex(), measure, measure);
    let nodes = this._createNodes(this._text, 0, this._text.length(), kDefaultChunkSize);
    this._setTree(Tree.build(nodes));
  }

  iterator() {
    // TODO: remove this one.
    return this._tree.iterator();
  }

  /**
   * @param {!Replacement} replacement
   */
  _replace(replacement) {
    let from = replacement.offset;
    let to = from + replacement.removed.length();
    let inserted = replacement.inserted.length();

    for (let mark of this._marks.replace(from, to, inserted)) {
      delete mark[kMarkSymbol];
      this.emit(Markup.Events.MarkCleared, mark);
    }

    this._rechunk(replacement.after, from, to, inserted);
    this._text = replacement.after;
  }

  /**
   * @param {!Anchor} from
   * @param {!Anchor} to
   * @param {!Mark} mark
   */
  markRange(from, to, mark) {
    if (from !== to)
      throw new Error('Only empty ranges are supported for now');
    if (mark[kMarkSymbol])
      throw new Error('This mark is already used');
    mark[kMarkSymbol] = this._marks.add(from, to, mark);
    this._rechunk(this._text, from, to, to - from);
  }

  /**
   * @param {!Mark} mark
   */
  clearMark(mark) {
    if (!mark[kMarkSymbol])
      throw new Error('The mark is not set');

    let {from, to} = this._marks.resolve(mark[kMarkSymbol]);
    this._marks.remove(mark[kMarkSymbol]);
    delete mark[kMarkSymbol];
    if (from !== to)
      throw new Error('Inconsistent');

    let split = this._tree.split(from, from);
    let nodes = split.middle.collect();
    if (nodes.some(node => !node.data))
      throw new Error('Inconsistent');
    let index = nodes.findIndex(node => node.data === mark);
    if (index === -1)
      throw new Error('Inconsistent');
    nodes.splice(index, 1);
    this._setTree(Tree.merge(split.left, Tree.merge(Tree.build(nodes), split.right)));
  }

  /**
   * @param {!Point} point
   * @param {RoundMode} roundMode
   * @param {boolean} strict
   * @return {number}
   */
  pointToOffset(point, roundMode = RoundMode.Floor, strict = false) {
    return this._virtualPointToOffset({
      x: point.x / this._defaultWidth,
      y: point.y / this._lineHeight
    }, roundMode, strict);
  }

  /**
   * @param {!Point} point
   * @param {RoundMode} roundMode
   * @param {boolean} strict
   * @return {number}
   */
  _virtualPointToOffset(point, roundMode, strict) {
    let iterator = this._tree.iterator();
    let clamped = iterator.locateByPoint(point, strict);
    if (clamped === null)
      throw 'Point does not belong to the Markup';
    if (iterator.data === undefined)
      return iterator.before ? iterator.before.offset : 0;
    let from = iterator.before.offset;
    let textChunk = this._text.content(from, from + iterator.metrics.length);
    return this._metrics.locateByPoint(textChunk, iterator.before, clamped, roundMode, strict).offset;
  }

  /**
   * @param {number} offset
   * @return {?Point}
   */
  offsetToPoint(offset) {
    let point = this._offsetToVirtualPoint(offset);
    return point === null ? null : {x: point.x * this._defaultWidth, y: point.y * this._lineHeight};
  }

  /**
   * @param {number} offset
   * @return {?Point}
   */
  _offsetToVirtualPoint(offset) {
    let iterator = this._tree.iterator();
    if (iterator.locateByOffset(offset, true /* strict */) === null)
      return null;
    if (iterator.data === undefined)
      return iterator.before || {x: 0, y: 0};
    let from = iterator.before.offset;
    let textChunk = this._text.content(from, from + iterator.metrics.length);
    return this._metrics.locateByOffset(textChunk, iterator.before, offset);
  }

  /**
   * @param {!Tree<?Mark>} tree
   */
  _setTree(tree) {
    this._tree = tree;
    let metrics = tree.metrics();
    let contentWidth = metrics.longestWidth * this._defaultWidth;
    let contentHeight = (1 + (metrics.lineBreaks || 0)) * this._lineHeight;
    this.emit(Markup.Events.Changed, contentWidth, contentHeight);
  }

  /**
   * @param {!Text} text
   * @param {number} from
   * @param {number} to
   * @param {number} inserted
   */
  _rechunk(text, from, to, inserted) {
    let split = this._tree.split(from, to);
    let newFrom = split.left.metrics().length;
    let newTo = text.length() - split.right.metrics().length;

    let tmp = split.left.split(newFrom, newFrom);
    if (!tmp.right.empty())
      throw new Error('Inconsistent');
    split.left = tmp.left;

    tmp = split.right.split(0, 0);
    if (!tmp.left.empty())
      throw new Error('Inconsistent');
    split.right = tmp.right;

    let nodes;
    if (newTo - newFrom > kDefaultChunkSize && from - newFrom + inserted <= kDefaultChunkSize) {
      // For typical editing scenarios, we are most likely to replace at the
      // end of insertion next time.
      nodes = this._createNodes(text, newFrom, newTo, kDefaultChunkSize, from - newFrom + inserted);
    } else {
      nodes = this._createNodes(text, newFrom, newTo, kDefaultChunkSize);
    }

    this._setTree(Tree.merge(split.left, Tree.merge(Tree.build(nodes), split.right)));
  }

  /**
   * @param {!Text} text
   * @param {number} from
   * @param {number} to
   * @param {number} chunkSize
   * @param {number=} firstChunkSize
   * @return {!Array<!{metrics: !TextMetrics, data: ?Mark}>}
   */
  _createNodes(text, from, to, chunkSize, firstChunkSize) {
    let iterator = text.iterator(from, 0, text.length());
    let nodes = [];

    let addNodes = upTo => {
      while (iterator.offset < upTo) {
        let offset = iterator.offset;
        let size = chunkSize;
        if (offset === from && firstChunkSize != undefined)
          size = firstChunkSize;
        size = Math.min(upTo - iterator.offset, size);
        let chunk = iterator.read(size);
        if (Metrics.isSurrogate(chunk.charCodeAt(chunk.length - 1))) {
          chunk += iterator.current;
          iterator.next();
        }
        nodes.push({metrics: this._metrics.forString(chunk), data: null});
      }
    };

    this._marks.visitTouching(from - 0.5, to + 1, decoration => {
      if (decoration.from < from || decoration.to > to + 0.5)
        return;
      addNodes(Math.floor(decoration.from));
      let mark = decoration.data;
      let width = mark.width / this._defaultWidth;
      let metrics = {length: 0, firstWidth: width, lastWidth: width, longestWidth: width};
      nodes.push({metrics, data: mark});
    });
    addNodes(to);
    return nodes;
  }
};

Markup.Events = {
  Changed: 'changed',
  MarkCleared: 'markCleared',
};

const kMarkSymbol = Symbol('mark');
const kDefaultChunkSize = 1000;

Markup.test = {};

/**
 * @param {!Markup} Markup
 * @param {number} chunkSize
 */
Markup.test.rechunk = function(Markup, chunkSize) {
  let nodes = Markup._createNodes(Markup._text, 0, Markup._text.length(), chunkSize);
  Markup._setTree(Tree.build(nodes));
};
