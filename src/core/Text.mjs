import { Tree } from "./Tree.mjs";
import { Chunk } from "./Chunk.mjs";

/**
 * @typedef {{
 *   chunk: string
 * }} TextNode;
 */

const kChunkMin = 50;
const kChunkDefault = kChunkMin * 2;
const kChunkMax = kChunkMin * 4;
const kInfinity = 1000000000;

let tree = Tree(
  /**
   * @param {!TextNode} node
   * @return {!TextNode}
   */
  function initFrom(node) {
    return { chunk: node.chunk };
  },

  /**
   * @param {!TextNode} node
   * @return {!Metrics}
   */
  function selfMetrics(node) {
    return Chunk.metrics(node.chunk);
  },

  true /* supportLines */);

/**
 * @param {string} s
 * @return {!TextNode}
 */
tree.create = function(s) {
  return tree.wrap({ chunk: s });
};

export class Text {
  /**
   * @param {!TextNode} root
   */
  constructor(root) {
    this._root = root;
    let metrics = tree.metrics(this._root);
    this._lineCount = (metrics.lines || 0) + 1;
    this._length = metrics.length;
    this._lastPosition = {line: metrics.lines || 0, column: metrics.last, offset: metrics.length};
    this._longestLine = metrics.longest;
  }

  /**
   * @param {string} content
   * @return {!Text}
   */
  static withContent(content) {
    return new Text(Text._withContent(content));
  }

  /**
   * @param {string} content
   * @return {!TextNode}
   */
  static _withContent(content) {
    let index = 0;
    let nodes = [];
    while (index < content.length) {
      let length = Math.min(content.length - index, kChunkDefault);
      let chunk = content.substring(index, index + length);
      nodes.push(tree.create(chunk));
      index += length;
    }
    if (!nodes.length)
      nodes.push(tree.create(''));
    return tree.build(nodes);
  }

  resetCache() {
  }

  /**
   * @param {number=} from
   * @param {number=} to
   * @return {{from: number, to: number}}
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

  /**
   * @param {number=} fromOffset
   * @param {number=} toOffset
   * @return {string}
   */
  content(fromOffset, toOffset) {
    let {from, to} = this._clamp(fromOffset, toOffset);
    let chunks = [];
    let iterator = tree.iterator(this._root, from, from, to);
    do {
      let chunk = iterator.node().chunk;
      let start = Math.max(0, from - iterator.before());
      let end = chunk.length - Math.max(0, iterator.after() - to);
      chunks.push(chunk.substring(start, end));
    } while (iterator.next());
    return chunks.join('');
  }

  /**
   * @param {number} offset
   * @param {number=} fromOffset
   * @param {number=} toOffset
   * @return {!Text.Iterator}
   */
  iterator(offset, fromOffset, toOffset) {
    let {from, to} = this._clamp(fromOffset, toOffset);
    return new Text.Iterator(this, offset, from, to);
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
  longestLineLength() {
    return this._longestLine;
  }

  /**
   * @return {number}
   */
  length() {
    return this._length;
  }

  /**
   * @param {number=} fromOffset
   * @param {number=} toOffset
   * @param {string} insertion
   * @return {!Text}
   */
  replace(fromOffset, toOffset, insertion) {
    let {from, to} = this._clamp(fromOffset, toOffset);
    let tmp = tree.split(this._root, {offset: to}, true /* intersectionToLeft */);
    let right = tmp.right;
    tmp = tree.split(tmp.left, {offset: from}, false /* intersectionToLeft */);
    let left = tmp.left;
    let middle = tmp.right;
    if (!middle) {
      middle = Text._withContent(insertion);
    } else {
      let leftSize = left ? tree.metrics(left).length : 0;
      let middleSize = tree.metrics(middle).length;
      let first = tree.find(middle, {offset: 0}).node;
      let last = tree.find(middle, {offset: middleSize - 1}).node;
      middle = Text._withContent(
        first.chunk.substring(0, from - leftSize) +
        insertion +
        last.chunk.substring(last.chunk.length - (leftSize + middleSize - to)));
    }
    return new Text(tree.merge(left, tree.merge(middle, right)));
  }

  /**
   * @param {number} offset
   * @return {?Position}
   */
  offsetToPosition(offset) {
    if (offset > this._length)
      return null;
    if (offset === this._length)
      return this._lastPosition;
    let found = tree.find(this._root, {offset});
    if (!found)
      throw 'Inconsistency';
    return Chunk.offsetToPosition(found.node.chunk, found.position, offset);
  }

  /**
   * @param {!Position} position
   * @param {boolean=} clamp
   * @return {number}
   */
  positionToOffset(position, clamp) {
    if (position.offset !== undefined) {
      if ((position.offset < 0 || position.offset > this._length) && !clamp)
        throw 'Position does not belong to text';
      return Math.max(0, Math.min(position.offset, this._length));
    }

    let compare = (position.line - this._lastPosition.line) || (position.column - this._lastPosition.column);
    if (compare >= 0) {
      if (clamp || compare === 0)
        return this._length;
      throw 'Position does not belong to text';
    }
    let found = tree.find(this._root, {line: position.line, column: position.column});
    if (!found) {
      if (clamp)
        return this._length;
      throw 'Position does not belong to text';
    }
    return Chunk.positionToOffset(found.node.chunk, found.position, position, clamp);
  }
}

Text.Iterator = class {
  /**
   * @param {!Text} text
   * @param {number} offset
   * @param {number} from
   * @param {number} to
   */
  constructor(text, offset, from, to) {
    this._iterator = tree.iterator(text._root, offset, from, to);
    this._from = from;
    this._to = to;

    this.offset = offset;
    this._chunk = this._iterator.node().chunk;
    this._pos = offset - this._iterator.before();
    this.current = this._chunk[this._pos];
  }

  next() {
    if (this.offset === this._to)
      return false;
    while (this._pos === this._chunk.length - 1) {
      this._iterator.next();
      this._chunk = this._iterator.node().chunk;
      this._pos = -1;
    }
    ++this.offset;
    ++this._pos;
    this.current = this._chunk[this._pos];
    return true;
  }

  prev() {
    if (this.offset === this._from)
      return false;
    while (!this._pos) {
      this._iterator.prev();
      this._chunk = this._iterator.node().chunk;
      this._pos = this._chunk.length;
    }
    --this.offset;
    --this._pos;
    this.current = this._chunk[this._pos];
    return true;
  }
};
