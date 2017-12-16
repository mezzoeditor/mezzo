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
    this._lastOffset = metrics.length;
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
      to = this._lastOffset;
    to = Math.min(this._lastOffset, to);
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
    let iterator = tree.iterator(this._root, {offset: from}, {offset: to});
    while (iterator.next()) {
      let chunk = iterator.node().chunk;
      let start = Math.max(0, from - iterator.before().offset);
      let end = chunk.length - Math.max(0, iterator.after().offset - to);
      chunks.push(chunk.substring(start, end));
    }
    return chunks.join('');
  }

  /**
   * @param {number=} fromOffset
   * @param {number=} toOffset
   * @return {!Text.Iterator}
   */
  iterator(fromOffset, toOffset) {
    let {from, to} = this._clamp(fromOffset, toOffset);
    return new Text.Iterator(this, from, to);
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
  lastOffset() {
    return this._lastOffset;
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
    if (offset > this._lastOffset)
      return null;
    if (offset === this._lastOffset)
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
      if ((position.offset < 0 || position.offset > this._lastOffset) && !clamp)
        throw 'Position does not belong to text';
      return Math.max(0, Math.min(position.offset, this._lastOffset));
    }

    let compare = (position.line - this._lastPosition.line) || (position.column - this._lastPosition.column);
    if (compare >= 0) {
      if (clamp || compare === 0)
        return this._lastOffset;
      throw 'Position does not belong to text';
    }
    let found = tree.find(this._root, {line: position.line, column: position.column});
    if (!found) {
      if (clamp)
        return this._lastOffset;
      throw 'Position does not belong to text';
    }
    return Chunk.positionToOffset(found.node.chunk, found.position, position, clamp);
  }
}

Text.Iterator = class {
  /**
   * @param {!Text} text
   * @param {number} from
   * @param {number} to
   */
  constructor(text, from, to) {
    this._iterator = tree.iterator(text._root, {offset: from}, {offset: to});
    this._to = to;

    this._offset = from;
    this._chunks = [];
    this._pos = 0;
    if (this._iterator.next()) {
      this._chunks.push(this._iterator.node().chunk);
      this._pos = from - this._iterator.before().offset;
    }
  }

  /**
   * @param {number} count
   * @return {number}
   */
  advance(count = 1) {
    count = Math.min(count, this._to - this._offset);
    let result = count;
    while (count > 0) {
      if (!this._chunks.length) {
        if (!this._iterator.next())
          throw 'There should be something';
        this._chunks.push(this._iterator.node().chunk);
      }
      let len = this._chunks[0].length - this._pos;
      if (count >= len) {
        this._chunks.shift();
        this._pos = 0;
        this._offset += len;
        count -= len;
      } else {
        this._offset += count;
        count = 0;
      }
    }
    return result;
  }

  /**
   * @return {number}
   */
  offset() {
    return this._offset;
  }

  /**
   * @param {number} count
   * @return {string}
   */
  peek(count = 1) {
    count = Math.min(count, this._to - this._offset);
    let result = [];
    let index = 0;
    let pos = this._pos;
    while (count > 0) {
      if (index === this._chunks.length) {
        if (!this._iterator.next())
          throw 'There should be something';
        this._chunks.push(this._iterator.node().chunk);
      }
      let len = this._chunks[index].length - pos;
      if (count >= len) {
        result.push(this._chunks[index].substring(pos));
        index++;
        pos = 0;
        count -= len;
      } else {
        result.push(this._chunks[index].substring(pos, pos + count));
        count = 0;
      }
    }
    return result.join('');
  }
};
