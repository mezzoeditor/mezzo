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
    this._lastPosition = {line: metrics.lines || 0, column: metrics.last};
    this._longestLine = metrics.longest;

    this._lineLengths = [];
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
    this._lineLengths = [];
  }

  /**
   * @param {!Position} from
   * @param {!Position} to
   * @return {string}
   */
  _content(from, to) {
    let chunks = [];
    let iterator = tree.iterator(this._root, from, to);
    while (iterator.next())
      chunks.push(Chunk.content(iterator.node().chunk, iterator.before(), iterator.after(), from, to));
    return chunks.join('');
  }

  /**
   * @param {!OffsetRange=} range
   * @return {string}
   */
  content(range) {
    if (!range)
      return this._content({offset: 0}, {offset: this._lastOffset});
    let from = Math.max(0, range.from);
    let to = Math.min(this._lastOffset, range.to);
    if (from >= to)
      return '';
    return this._content({offset: from}, {offset: to});
  }

  /**
   * @return {number}
   */
  lineCount() {
    return this._lineCount;
  }

  /**
   * @param {number} line
   * @return {?string}
   */
  line(line) {
    if (line >= this._lineCount)
      return null;
    let from = this.positionToOffset({line, column: 0});
    let to = this.positionToOffset({line: line + 1, column: 0}, true /* clamp */);
    return this._content({offset: from}, {offset: to});
  }

  /**
   * @return {number}
   */
  longestLineLength() {
    return this._longestLine;
  }

  /**
   * @param {number} line
   * @return {number}
   */
  lineLength(line) {
    if (line >= this._lineCount)
      return 0;
    if (this._lineLengths[line] === undefined) {
      let start = this.positionToOffset({line, column: 0}, true /* clamp */);
      let end = this.positionToOffset({line: line + 1, column: 0}, true /* clamp */);
      this._lineLengths[line] = start === end ? 0 : end - start - 1;
    }
    return this._lineLengths[line];
  }

  /**
   * @param {number} line
   * @param {number} from
   * @param {number} to
   * @return {?string}
   */
  lineChunk(line, from, to) {
    if (line >= this._lineCount)
      return null;
    from = this.positionToOffset({line, column: from}, true /* clamp */);
    to = this.positionToOffset({line, column: to}, true /* clamp */);
    return this._content({offset: from}, {offset: to});
  }

  /**
   * @return {number}
   */
  lastOffset() {
    return this._lastOffset;
  }

  /**
   * @return {!OffsetRange}
   */
  fullRange() {
    return {from: 0, to: this._lastOffset};
  }

  /**
   * @param {number} offset
   * @return {number}
   */
  clampOffset(offset) {
    return offset < 0 ? 0 : (offset > this._lastOffset ? this._lastOffset : offset);
  }

  /**
   * @param {!OffsetRange} range
   * @return {!OffsetRange}
   */
  clampRange(range) {
    return {from: this.clampOffset(range.from), to: this.clampOffset(range.to)};
  }

  /**
   * @param {number} offset
   * @return {number}
   */
  previousOffset(offset) {
    return offset ? offset - 1 : 0;
  }

  /**
   * @param {number} offset
   * @return {number}
   */
  nextOffset(offset) {
    return offset < this._lastOffset ? offset + 1 : this._lastOffset;
  }

  /**
   * @param {number} offset
   * @return {number}
   */
  lineStartOffset(offset) {
    let position = this.offsetToPosition(offset);
    return offset - position.column;
  }

  /**
   * @param {number} offset
   * @return {number}
   */
  lineEndOffset(offset) {
    let position = this.offsetToPosition(offset);
    if (position.line == this._lineCount - 1)
      return this._lastOffset;
    return this.positionToOffset({line: position.line + 1, column: 0}) - 1;
  }

  /**
   * @param {!OffsetRange} range
   * @param {string} insertion
   * @return {!Text}
   */
  replaceRange(range, insertion) {
    let tmp = tree.split(this._root, {offset: range.to}, true /* intersectionToLeft */);
    let right = tmp.right;
    tmp = tree.split(tmp.left, {offset: range.from}, false /* intersectionToLeft */);
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
        first.chunk.substring(0, range.from - leftSize) +
        insertion +
        last.chunk.substring(last.chunk.length - (leftSize + middleSize - range.to)));
    }
    return new Text(tree.merge(left, tree.merge(middle, right)));
  }

  /**
   * @param {number} offset
   * @return {?TextPosition}
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
   * @param {TextPosition} position
   * @param {boolean=} clamp
   * @return {number}
   */
  positionToOffset(position, clamp) {
    let found = tree.find(this._root, {line: position.line, column: position.column});
    if (!found) {
      if (clamp)
        return this._lastOffset;
      throw 'Position does not belong to text';
    }
    return Chunk.positionToOffset(found.node.chunk, found.position, position, clamp);
  }
}
