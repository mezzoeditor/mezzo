import { Tree } from "./Tree.mjs";

/**
 * @typedef {{
 *   line: string
 * }} LineNode;
 */

const kChunkMin = 50;
const kChunkDefault = kChunkMin * 2;
const kChunkMax = kChunkMin * 4;
const kInfinity = 1000000000;

let tree = Tree(
  /**
   * @param {!LineNode} node
   * @return {!LineNode}
   */
  function initFrom(node) {
    return { line: node.line };
  },

  /**
   * @param {!LineNode} node
   * @return {!Metrics}
   */
  function selfMetrics(node) {
    let metrics = {
      lines: 0,
      chars: node.line.length,
      first: 0,
      last: 0,
      longest: 0
    };
    let index = 0;
    while (true) {
      let nextLine = node.line.indexOf('\n', index);
      if (index === 0)
        metrics.first = nextLine === -1 ? node.line.length : nextLine;
      if (nextLine === -1) {
        metrics.last = node.line.length - index;
        break;
      }
      metrics.lines++;
      index = nextLine + 1;
    }
    metrics.longest = Math.max(metrics.longest, metrics.first);
    metrics.longest = Math.max(metrics.longest, metrics.last);
    return metrics;
  });

/**
 * @param {string} s
 * @return {!LineNode}
 */
tree.create = function(s) {
  return tree.wrap({ line: s });
};

export class Text {
  /**
   * @param {!LineNode} root
   */
  constructor(root) {
    this._root = root;
    let metrics = tree.metrics(this._root);
    this._lineCount = metrics.lines + 1;
    this._lastOffset = metrics.chars;
    this._lastPosition = {lineNumber: metrics.lines, columnNumber: metrics.last};
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
   * @return {!LineNode}
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
      let s = node.line;

      let start = 0;
      if (from.char !== undefined && from.char > before.char) {
        start = from.char - before.char;
      } else if (from.line === before.line && from.column > before.column) {
        start = from.column - before.column;
      } else if (from.line > before.line) {
        for (let line = before.line; line < from.line; line++)
          start = s.indexOf('\n', start) + 1;
        start += from.column;
      }

      let end = s.length;
      if (to.char !== undefined && to.char < after.char) {
        end = s.length - (after.char - to.char);
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
    return this._content({char: 0}, {char: this._lastOffset});
  }

  /**
   * @return {number}
   */
  lineCount() {
    return this._lineCount;
  }

  /**
   * @param {number} lineNumber
   * @return {?string}
   */
  line(lineNumber) {
    return this.lineChunk(lineNumber, 0, kInfinity);
  }

  /**
   * @return {number}
   */
  longestLineLength() {
    return this._longestLine;
  }

  /**
   * @param {number} lineNumber
   * @return {number}
   */
  lineLength(lineNumber) {
    if (lineNumber >= this._lineCount)
      return 0;
    if (this._lineLengths[lineNumber] === undefined) {
      let start = this.positionToOffset({lineNumber, columnNumber: 0}, true /* clamp */);
      let end = this.positionToOffset({lineNumber: lineNumber + 1, columnNumber: 0}, true /* clamp */);
      this._lineLengths[lineNumber] = start === end ? 0 : end - start - 1;
    }
    return this._lineLengths[lineNumber];
  }

  /**
   * @param {number} lineNumber
   * @param {number} from
   * @param {number} to
   * @return {?string}
   */
  lineChunk(lineNumber, from, to) {
    if (lineNumber >= this._lineCount)
      return null;
    return this._content({line: lineNumber, column: from}, {line: lineNumber, column: to});
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
    return offset - position.columnNumber;
  }

  /**
   * @param {number} offset
   * @return {number}
   */
  lineEndOffset(offset) {
    let position = this.offsetToPosition(offset);
    if (position.lineNumber == this._lineCount - 1)
      return this._lastOffset;
    return this.positionToOffset({lineNumber: position.lineNumber + 1, columnNumber: 0}) - 1;
  }

  /**
   * @param {!OffsetRange} range
   * @param {string} insertion
   * @return {!Text}
   */
  replaceRange(range, insertion) {
    let tmp = tree.split(this._root, {char: range.to}, true /* intersectionToLeft */);
    let right = tmp.right;
    tmp = tree.split(tmp.left, {char: range.from}, false /* intersectionToLeft */);
    let left = tmp.left;
    let middle = tmp.right;
    if (!middle) {
      middle = Text._withContent(insertion);
    } else {
      let leftSize = left ? tree.metrics(left).chars : 0;
      let middleSize = tree.metrics(middle).chars;
      let first = tree.find(middle, {char: 0}).node;
      let last = tree.find(middle, {char: middleSize - 1}).node;
      middle = Text._withContent(
        first.line.substring(0, range.from - leftSize) +
        insertion +
        last.line.substring(last.line.length - (leftSize + middleSize - range.to)));
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

    let found = tree.find(this._root, {char: offset});
    if (!found)
      throw 'Inconsistency';

    if (found.node.line.length < offset - found.position.char)
      throw 'Inconsistent';
    let chunk = found.node.line.substring(0, offset - found.position.char);
    let lineNumber = found.position.line;
    let columnNumber = found.position.column;
    let index = 0;
    while (true) {
      let nextLine = chunk.indexOf('\n', index);
      if (nextLine !== -1) {
        lineNumber++;
        columnNumber = 0;
        index = nextLine + 1;
      } else {
        columnNumber += chunk.length - index;
        break;
      }
    }
    return {lineNumber, columnNumber};
  }

  /**
   * @param {TextPosition} position
   * @param {boolean=} clamp
   * @return {number}
   */
  positionToOffset(position, clamp) {
    let found = tree.find(this._root, {line: position.lineNumber, column: position.columnNumber});
    if (!found) {
      if (clamp)
        return this._lastOffset;
      throw 'Position does not belong to text';
    }

    let chunk = found.node.line;
    let lineNumber = found.position.line;
    let columnNumber = found.position.column;
    let offset = found.position.char;
    let index = 0;
    while (lineNumber < position.lineNumber) {
      let nextLine = chunk.indexOf('\n', index);
      if (nextLine === -1)
        throw 'Inconsistent';
      offset += (nextLine - index + 1);
      index = nextLine + 1;
      lineNumber++;
      columnNumber = 0;
    }

    let lineEnd = chunk.indexOf('\n', index);
    if (lineEnd === -1)
      lineEnd = chunk.length;
    if (lineEnd < index + (position.columnNumber - columnNumber)) {
      if (clamp)
        return offset + lineEnd - index;
      throw 'Position does not belong to text';
    }
    return offset + position.columnNumber - columnNumber;
  }
}
