import { EventEmitter } from './EventEmitter.mjs';
import { Decorator } from './Decorator.mjs';
import { Metrics } from './Metrics.mjs';
import { Tree } from './Tree.mjs';

/**
 * @typedef {{
 *   width: number
 * }} Mark
 */

export class TextView extends EventEmitter {
  /**
   * @param {!Metrics} metrics
   * @param {!Text} text
   */
  constructor(metrics, text) {
    super();
    this._metrics = metrics;
    this._text = text;
    this._marks = new Decorator(true /* createHandles */);
    let nodes = this._createNodes(text, 0, text.length(), kDefaultChunkSize);
    this._setTree(Tree.build(nodes));
  }

  iterator() {
    // TODO: remove this one.
    return this._tree.iterator();
  }

  /**
   * @param {!Replacement} replacement
   */
  replace(replacement) {
    let from = replacement.offset;
    let to = from + replacement.removed.length();
    let inserted = replacement.inserted.length();

    for (let mark of this._marks.replace(from, to, inserted)) {
      delete mark[kMarkSymbol];
      this.emit(TextView.Events.MarkCleared, mark);
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
   * @return {!TextMetrics}
   */
  metrics() {
    return this._tree.metrics();
  }

  /**
   * @param {!Point} point
   * @param {RoundMode} roundMode
   * @param {boolean} strict
   * @return {number}
   */
  pointToOffset(point, roundMode = RoundMode.Floor, strict = false) {
    let iterator = this._tree.iterator();
    let clamped = iterator.locateByPoint(point, strict);
    if (clamped === null)
      throw 'Point does not belong to the TextView';
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
    this.emit(TextView.Events.Changed);
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
      let width = mark.width / 1; /* should be this._defaultWidth */
      let metrics = {length: 0, firstWidth: width, lastWidth: width, longestWidth: width};
      nodes.push({metrics, data: mark});
    });
    addNodes(to);
    return nodes;
  }
};

TextView.Events = {
  Changed: 'changed',
  MarkCleared: 'markCleared',
};

const kMarkSymbol = Symbol('mark');
const kDefaultChunkSize = 1000;

TextView.test = {};

/**
 * @param {!TextView} textView
 * @param {number} chunkSize
 */
TextView.test.rechunk = function(textView, chunkSize) {
  let nodes = textView._createNodes(textView._text, 0, textView._text.length(), chunkSize);
  textView._setTree(Tree.build(nodes));
};
