import { CreateOrderedMonoidTree } from '../utils/OrderedMonoidTree.js';
import { TextUtils } from './TextUtils.js';
import { TextMetricsMonoid } from './TextMetrics.js';
import { TextMeasurer } from './TextMeasurer.js';
import { TextIterator } from './TextIterator.js';
import { RoundMode } from '../utils/RoundMode.js';

/**
 * @typedef {Mezzo.Tree<string, Mezzo.TextLookupKey, Mezzo.TextMetrics>} Tree
 */
/**
 * @type {Mezzo.TreeFactory<string, Mezzo.TextMetrics, Mezzo.TextLookupKey>}
 */
const TreeFactory = CreateOrderedMonoidTree(new TextMetricsMonoid());

// We should measure performance/memory and consider different chunk sizes
// based on total document length.
const kDefaultChunkSize = 1000;

const measurer = new TextMeasurer(TextUtils.bmpRegex, char => 1, char => 1);
if (measurer.stateTraits() !== null)
  throw new Error('TextMeasurer should not have state');

export class Text {
  /**
   * Creates an empty text.
   */
  constructor() {
    this._length = 0;
    /** @type {Tree|undefined} */
    this._tree;

    /** @type {string|undefined} */
    this._string;

    /** @type {Array<string>|undefined} */
    this._chunks;

    /** @type {string|undefined} */
    this._left;
    /** @type {Tree|undefined} */
    this._middle;
    /** @type {string|undefined} */
    this._right;
  }

  /**
   * Creates a text with specified content.
   * @param {string} string
   * @return {Text}
   */
  static fromString(string) {
    const text = new Text();
    text._string = string;
    text._length = string.length;
    return text;
  }

  /**
   * @param {Mezzo.Offset=} from
   * @param {Mezzo.Offset=} to
   * @return {string}
   */
  content(from, to) {
    from = Math.max(0, from || 0);
    to = Math.min(this._length, to === undefined ? this._length : to);
    return this.iterator(from, from, to).substr(to - from);
  }

  /**
   * @param {Mezzo.Offset} offset
   * @param {Mezzo.Offset=} from
   * @param {Mezzo.Offset=} to
   * @return {TextIterator}
   */
  iterator(offset, from, to) {
    from = Math.max(0, from || 0);
    to = Math.min(this._length, to === undefined ? this._length : to);
    offset = Math.min(to, Math.max(from, offset));
    const iterator = this._build().iterator();
    iterator.locate({offset});
    return new TextIterator(iterator, offset, from, to, this._length);
  }

  /**
   * @param {Mezzo.Offset} from
   * @param {Mezzo.Offset} to
   * @param {Text} insertion
   * @return {{removed: Text, result: Text}}
   */
  replace(from, to, insertion) {
    const split = this._build().split({offset: from}, {offset: to});
    const leftLength = from - split.left.value().length;
    const rightLength = this._length - split.right.value().length - to;

    let left = '';
    let right = '';
    let leftRemoved = '';
    let rightRemoved = '';
    let tmp = split.middle.splitFirst();
    if (tmp.data !== null) {
      const leftChunk = tmp.data;
      if (leftLength > leftChunk.length)
        throw new Error('Inconsistent');
      left = leftChunk.substring(0, leftLength);
      tmp = tmp.tree.splitLast();
      if (tmp.data !== null) {
        const rightChunk = tmp.data;
        if (rightLength > rightChunk.length)
          throw new Error('Inconsistent');
        right = rightChunk.substring(rightChunk.length - rightLength, rightChunk.length);
        leftRemoved = leftChunk.substring(leftLength, leftChunk.length);
        rightRemoved = rightChunk.substring(0, rightChunk.length - rightLength);
      } else {
        if (leftLength + rightLength > leftChunk.length)
          throw new Error('Inconsistent');
        right = leftChunk.substring(leftChunk.length - rightLength, leftChunk.length);
        leftRemoved = leftChunk.substring(leftLength, leftChunk.length - rightLength);
      }
    } else {
      if (leftLength + rightLength > 0)
        throw new Error('Inconsistent');
    }

    const middle = insertion._buildWithChunks(left, right);
    return {
      result: Text._fromTree(TreeFactory.merge(split.left, TreeFactory.merge(middle, split.right))),
      removed: Text._fromLMR(leftRemoved, tmp.tree, rightRemoved)
    };
  }

  /**
   * @param {Mezzo.Offset} from
   * @param {Mezzo.Offset} to
   * @return {Text}
   */
  subtext(from, to) {
    throw new Error('NOT IMPLEMENTED!');
    // TODO: we'll need this eventually.
  }

  /**
   * @param {Mezzo.Offset} offset
   * @return {Mezzo.Position}
   */
  offsetToPosition(offset) {
    offset = Math.max(0, Math.min(offset, this._length));
    const iterator = this._build().iterator();
    iterator.locate({offset});
    if (iterator.data === undefined) {
      if (iterator.before)
        return {line: iterator.before.lineBreaks || 0, column: iterator.before.lastWidth};
      return {line: 0, column: 0};
    }
    const point = measurer.locateByOffset(iterator.data, null, iterator.before, offset);
    return {line: point.y, column: point.x};
  }

  /**
   * @param {Mezzo.Position} position
   * @return {Mezzo.Offset}
   */
  positionToOffset(position) {
    if (position.line < 0)
      position = {line: 0, column: 0};
    if (position.column < 0)
      position = {line: position.line, column: 0};
    const metrics = this._build().value();
    const max = {line: metrics.lineBreaks || 0, column: metrics.lastWidth};
    if (position.line > max.line)
      position = max;
    const point = {x: position.column, y: position.line};
    const iterator = this._build().iterator();
    iterator.locate(point);
    if (iterator.data === undefined)
      return iterator.before ? iterator.before.length : 0;
    return measurer.locateByPoint(iterator.data, null, iterator.before, point, RoundMode.Round).offset;
  }

  /**
   * @return {number}
   */
  lineCount() {
    return (this._build().value().lineBreaks || 0) + 1;
  }

  /**
   * @return {number}
   */
  length() {
    return this._length;
  }

  /**
   * @return {Tree}
   */
  _build() {
    if (this._tree)
      return this._tree;
    if (this._string) {
      this._tree = chunkedTree(this._string);
      this._string = undefined;
    } else if (this._chunks) {
      const values = this._chunks.map(chunk => measurer.mapValue(chunk).value);
      this._tree = TreeFactory.build(this._chunks, values);
      this._chunks = undefined;
    } else if (this._middle) {
      const leftTree = chunkedTree(this._left);
      const rightTree = chunkedTree(this._right);
      this._tree = TreeFactory.merge(leftTree, TreeFactory.merge(this._middle, rightTree));
      this._left = undefined;
      this._right = undefined;
      this._middle = undefined;
    } else {
      this._tree = TreeFactory.build([], []);
    }
    return this._tree;
  }

  /**
   * @param {string} left
   * @param {string} right
   * @return {Tree}
   */
  _buildWithChunks(left, right) {
    // For typical editing scenarios, we are most likely to replace at the
    // start of |right| next time, so there is no reason to merge |right| with
    // anything unless the whole content is too short.
    const combine = left.length + this._length + right.length <= kDefaultChunkSize;

    if (this._tree) {
      if (combine)
        return chunkedTree(left + this.content(0, this._length) + right);
      if (left.length + this._length <= kDefaultChunkSize)
        return chunkedTree(left + this.content(0, this._length), right);
      return TreeFactory.merge(chunkedTree(left), TreeFactory.merge(this._tree, chunkedTree(right)));
    }

    if (this._middle) {
      if (combine)
        return chunkedTree(left + this.content(0, this._length) + right);
      // TODO: might make sense to rechunk (left + this._left + this._middle) if too short.
      return TreeFactory.merge(chunkedTree(left + this._left), TreeFactory.merge(this._middle, chunkedTree(this._right + right)));
    }

    if (this._string) {
      if (combine)
        return chunkedTree(left + this._string + right);
      if (left.length + this._length <= kDefaultChunkSize)
        return chunkedTree(left + this._string, right);
      // Avoid concatenating |left| and |this._string| to not duplicate possibly long
      // |this._string|.
      return chunkedTree(left, this._string, right);
    }

    if (this._chunks) {
      const data = [];
      const values = [];
      chunkContent(left, data, values);
      data.push(...this._chunks);
      values.push(...this._chunks.map(chunk => measurer.mapValue(chunk).value));
      chunkContent(right, data, values);
      return TreeFactory.build(data, values);
    }

    if (combine)
      return chunkedTree(left + right);
    return chunkedTree(left, right);
  }

  /**
   * @param {Tree} tree
   * @return {Text}
   */
  static _fromTree(tree) {
    let text = new Text();
    text._tree = tree;
    text._length = tree.value().length;
    return text;
  }

  /**
   * @param {string} left
   * @param {Tree} middle
   * @param {string} right
   * @return {Text}
   */
  static _fromLMR(left, middle, right) {
    let text = new Text();
    text._left = left;
    text._middle = middle;
    text._right = right;
    text._length = left.length + middle.value().length + right.length;
    return text;
  }
};

/**
 * @param {...string} content
 * @return {Tree}
 */
function chunkedTree(...content) {
  const data = [];
  const values = [];
  for (const s of content)
    chunkContent(s, data, values);
  return TreeFactory.build(data, values);
}

/**
 * @param {string} content
 * @param {Array<string>} data
 * @param {Array<Mezzo.TextMetrics>} values
 */
function chunkContent(content, data, values, chunkSize = kDefaultChunkSize) {
  let index = 0;
  while (index < content.length) {
    let length = Math.min(content.length - index, chunkSize);
    if (!TextUtils.isValidOffset(content, index + length))
      length++;
    const chunk = content.substring(index, index + length);
    data.push(chunk);
    values.push(measurer.mapValue(chunk).value);
    index += length;
  }
};

Text.test = {};

Text.test.toChunks = function(content, chunkSize) {
  const data = [];
  const values = [];
  chunkContent(content, data, values, chunkSize);
  return data;
};

Text.test.fromStringChunked = function(string, chunkSize) {
  const text = new Text();
  const data = [];
  const values = [];
  chunkContent(string, data, values, chunkSize);
  text._tree = TreeFactory.build(data, values);
  text._length = text._tree.value().length;
  return text;
};

Text.test.fromChunks = function(chunks) {
  const text = new Text();
  text._chunks = chunks;
  text._length = 0;
  chunks.forEach(chunk => text._length += chunk.length);
  return text;
};
