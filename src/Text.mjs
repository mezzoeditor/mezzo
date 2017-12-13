import { Tree } from "./Tree.mjs";

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
    let metrics = {
      length: node.chunk.length,
      first: 0,
      last: 0,
      longest: 0
    };
    let lines = 0;
    let index = 0;
    while (true) {
      let nextLine = node.chunk.indexOf('\n', index);
      if (index === 0) {
        metrics.first = nextLine === -1 ? node.chunk.length : nextLine;
        metrics.longest = metrics.first;
      }
      if (nextLine === -1) {
        metrics.last = node.chunk.length - index;
        metrics.longest = Math.max(metrics.longest, metrics.last);
        break;
      }
      metrics.longest = Math.max(metrics.longest, nextLine - index);
      lines++;
      index = nextLine + 1;
    }
    if (lines)
      metrics.lines = lines;
    return metrics;
  });

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
    tree.visit(this._root, from, to, (node, before, after) => {
      let s = node.chunk;

      let start = 0;
      if (from.offset !== undefined && from.offset > before.offset) {
        start = from.offset - before.offset;
      } else if (from.line === before.line && from.column > before.column) {
        let lineEnd = s.indexOf('\n');
        if (lineEnd === -1)
          lineEnd = s.length;
        start = Math.min(lineEnd, from.column - before.column);
      } else if (from.line > before.line) {
        for (let line = before.line; line < from.line; line++)
          start = s.indexOf('\n', start) + 1;
        start += from.column;
      }

      let end = s.length;
      if (to.offset !== undefined && to.offset < after.offset) {
        end = s.length - (after.offset - to.offset);
      } else if (to.line === after.line && to.column < after.column) {
        end = s.length - (after.column - to.column);
      } else if (to.line < after.line) {
        for (let line = after.line; line > to.line; line--)
          end = s.lastIndexOf('\n', end - 1);
        let lineStart = s.lastIndexOf('\n', end - 1) + 1;
        end = Math.min(lineStart + to.column, end);
      }

      chunks.push(s.substring(start, end));
    });
    return chunks.join('');
  }

  /**
   * @return {string}
   */
  content() {
    return this._content({offset: 0}, {offset: this._lastOffset});
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
    return this.lineChunk(line, 0, kInfinity);
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
    return this._content({line, column: from}, {line, column: to});
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

    if (found.node.chunk.length < offset - found.position.offset)
      throw 'Inconsistent';
    let chunk = found.node.chunk.substring(0, offset - found.position.offset);
    let {line, column} = found.position;
    let index = 0;
    while (true) {
      let nextLine = chunk.indexOf('\n', index);
      if (nextLine !== -1) {
        line++;
        column = 0;
        index = nextLine + 1;
      } else {
        column += chunk.length - index;
        break;
      }
    }
    return {line, column};
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

    let chunk = found.node.chunk;
    let {line, column, offset} = found.position;
    let index = 0;
    while (line < position.line) {
      let nextLine = chunk.indexOf('\n', index);
      if (nextLine === -1)
        throw 'Inconsistent';
      offset += (nextLine - index + 1);
      index = nextLine + 1;
      line++;
      column = 0;
    }

    let lineEnd = chunk.indexOf('\n', index);
    if (lineEnd === -1)
      lineEnd = chunk.length;
    if (lineEnd < index + (position.column - column)) {
      if (clamp)
        return offset + lineEnd - index;
      throw 'Position does not belong to text';
    }
    return offset + position.column - column;
  }
}
