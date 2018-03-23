import { Metrics } from './Metrics.mjs';
import { Tree } from './Tree.mjs';
import { TextIterator } from './TextIterator.mjs';

export class Text {
  /**
   * Creates an empty text.
   */
  constructor() {
    this._length = 0;
    /** @type {!Tree<string>|undefined} */
    this._tree;

    /** @type {string|undefined} */
    this._string;

    /** @type {!Array<string>|undefined} */
    this._chunks;

    /** @type {string|undefined} */
    this._left;
    /** @type {!Tree<string>|undefined} */
    this._middle;
    /** @type {string|undefined} */
    this._right;
  }

  /**
   * Creates a text with specified content.
   *
   * @param {string} string
   * @return {!Text}
   */
  static fromString(string) {
    let text = new Text();
    text._string = string;
    text._length = string.length;
    return text;
  }

  /**
   * Creates a text consisting of string chunks.
   * Note that using arbitrary chunks may be inefficient, prefer fromString().
   *
   * @param {!Array<string>} chunks
   * @return {!Text}
   */
  static fromChunks(chunks) {
    let text = new Text();
    text._chunks = chunks;
    text._length = 0;
    chunks.forEach(chunk => text._length += chunk.length);
    return text;
  }

  /**
   * Creates a text with specified content, chunking with specific size.
   * Note that using arbitrary chunk size may be inefficient, prefer fromString().
   *
   * @param {string} string
   * @param {number} chunkSize
   * @return {!Text}
   */
  static fromStringChunked(string, chunkSize) {
    let text = new Text();
    text._tree = buildTree(chunks(string, chunkSize));
    text._length = text._tree.metrics().length;
    return text;
  }

  /**
   * @param {number} from
   * @param {number} to
   * @return {string}
   */
  content(from, to) {
    return this.iterator(from, from, to).substr(to - from);
  }

  /**
   * @param {number} offset
   * @param {number} from
   * @param {number} to
   * @return {!TextIterator}
   */
  iterator(offset, from, to) {
    return new TextIterator(this._build().iterator(offset, from, to), offset, from, to, this._length);
  }

  /**
   * @param {number} from
   * @param {number} to
   * @param {!Text} insertion
   * @return {!{removed: !Text, result: !Text}}
   */
  replace(from, to, insertion) {
    let split = this._build().split(from, to);
    let leftLength = from - split.left.metrics().length;
    let rightLength = this._length - split.right.metrics().length - to;

    let left = '';
    let right = '';
    let leftRemoved = '';
    let rightRemoved = '';
    let tmp = split.middle.splitFirst();
    if (tmp.first) {
      let leftChunk = tmp.first;
      if (leftLength > leftChunk.length)
        throw new Error('Inconsistent');
      left = leftChunk.substring(0, leftLength);
      tmp = tmp.rest.splitLast();
      if (tmp.last) {
        let rightChunk = tmp.right;
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

    let middle = insertion._buildWithChunks(left, right);
    return {
      result: Text._fromTree(Tree.merge(split.left, Tree.merge(middle, split.right))),
      removed: Text._fromLMR(leftRemoved, tmp.rest, rightRemoved)
    };
  }

  /**
   * @param {number} from
   * @param {number} to
   * @return {!Text}
   */
  subtext(from, to) {
    // TODO: we'll need this eventually.
  }

  /**
   * @param {number} offset
   * @return {?Position}
   */
  offsetToPosition(offset) {
    let found = this._build().findByOffset(offset);
    if (found.location === null)
      return null;
    if (found.data === null)
      return {line: found.location.y, column: found.location.x};
    let location = metrics.locateByOffset(found.data, found.location, offset);
    return {line: location.y, column: location.x};
  }

  /**
   * @param {!Position} position
   * @param {boolean=} strict
   * @return {number}
   */
  positionToOffset(position, strict) {
    let found = this._build().findByPoint({x: position.column, y: position.line}, !!strict);
    if (found.data === null)
      return found.location.offset;
    return metrics.locateByPoint(found.data, found.location, found.clampedPoint, strict).offset;
  }

  /**
   * @return {number}
   */
  lineCount() {
    return (this._build().metrics().lineBreaks || 0) + 1;
  }

  /**
   * @return {number}
   */
  length() {
    return this._length;
  }

  /**
   * @return {!Tree<string>}
   */
  _build() {
    if (this._tree)
      return this._tree;
    if (this._string) {
      this._tree = buildTree(chunks(this._string));
      delete this._string;
    } else if (this._chunks) {
      let chunks = this._chunks.map(chunk => ({data: chunk, metrics: metrics.forString(chunk)}));
      this._tree = buildTree(chunks);
      delete this._chunks;
    } else if (this._middle) {
      let leftTree = buildTree(chunks(this._left));
      let rightTree = buildTree(chunks(this._right));
      this._tree = Tree.merge(leftTree, Tree.merge(this._middle, rightTree));
      delete this._left;
      delete this._right;
      delete this._middle;
    } else {
      this._tree = buildTree([]);
    }
    return this._tree;
  }

  /**
   * @param {string} left
   * @param {string} right
   * @return {!Tree<string>}
   */
  _buildWithChunks(left, right) {
    // For typical editing scenarios, we are most likely to replace at the
    // start of |right| next time, so there is no reason to merge |right| with
    // anything unless the whole content is too short.
    let combine = left.length + this._length + right.length <= kDefaultChunkSize;

    if (this._tree) {
      if (combine)
        return buildTree(chunks(left + this.content() + right));
      if (left.length + this._length <= kDefaultChunkSize)
        return buildTree(chunks(left + this.content()).concat(chunks(right)));
      return Tree.merge(buildTree(chunks(left)), Tree.merge(this._tree, buildTree(chunks(right))));
    }

    if (this._middle) {
      if (combine)
        return buildTree(chunks(left + this.content() + right));
      // TODO: might make sense to rechunk (left + this._left + this._middle) if too short.
      return Tree.merge(buildTree(chunks(left + this._left)), Tree.merge(this._middle, buildTree(chunks(this._right + right))));
    }

    if (this._string) {
      if (combine)
        return buildTree(chunks(left + this._string + right));
      if (left.length + this._length <= kDefaultChunkSize)
        return buildTree(chunks(left + this._string).concat(chunks(right)));
      // Avoid concatenating |left| and |this._string| to not duplicate possibly long
      // |this._string|.
      return buildTree(chunks(left).concat(chunks(this._string)).concat(chunks(right)));
    }

    if (this._chunks) {
      let chunks = this._chunks.map(chunk => ({data: chunk, metrics: metrics.forString(chunk)}));
      return buildTree(chunks(left).concat(chunks).concat(chunks(right)));
    }

    if (combine)
      return buildTree(chunks(left + right));
    return buildTree(chunks(left).concat(chunks(right)));
  }

  /**
   * @param {!Tree<string>} tree
   * @return {!Text}
   */
  static _fromTree(tree) {
    let text = new Text();
    text._tree = tree;
    text._length = tree.metrics().length;
    return text;
  }

  /**
   * @param {string} left
   * @param {!Tree<string>} middle
   * @param {string} right
   * @return {!Text}
   */
  static _fromLMR(left, middle, right) {
    let text = new Text();
    text._left = left;
    text._middle = middle;
    text._right = right;
    text._length = left.length + middle.metrics().length + right.length;
    return text;
  }
};

// This is very efficient for loading large files and memory consumption.
// It might slow down common operations though. We should measure that and
// consider different chunk sizes based on total document length.
let kDefaultChunkSize = 1000;
let metrics = new Metrics(Metrics.bmpRegex, char => 1, char => 1);

/**
 * @param {string} content
 * @param {number} chunkSize
 * @return {!Array<!{data: string, metrics: !TextMetrics}>}
 */
function chunks(content, chunkSize) {
  chunkSize = chunkSize || kDefaultChunkSize;
  let index = 0;
  let chunks = [];
  while (index < content.length) {
    let length = Math.min(content.length - index, chunkSize);
    if (!Metrics.isValidOffset(content, index + length))
      length++;
    let chunk = content.substring(index, index + length);
    chunks.push({data: chunk, metrics: metrics.forString(chunk)});
    index += length;
  }
  return chunks;
}

/**
 * @param {!Array<!{data: string, metrics: !TextMetrics}>} chunks
 * @return {!Tree<string>}
 */
function buildTree(chunks) {
  if (!chunks.length)
    return Tree.build([{data: '', metrics: metrics.forString('')}]);
  return Tree.build(chunks);
}

Text.test = {};
Text.test.chunks = chunks;
