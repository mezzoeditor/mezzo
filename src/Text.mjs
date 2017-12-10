import { Tree } from "./Tree.mjs";

/**
 * @typedef {{
 *   line: string,
 *   longestLine: number,
 * }} LineNode;
 */

 /**
 * @param {!LineNode} from
 * @param {!LineNode} to
 */
let combineTo = function(from, to) {
  to.longestLine = Math.max(to.longestLine, from.longestLine);
}

/**
 * @param {!LineNode} node
 * @return {!LineNode}
 */
let initFrom = function(node) {
  return {
    line: node.line,
    longestLine: node.line.length
  };
};

let selfMetrics = function(node) {
  return {
    lines: 1,
    chars: node.line.length + 1,
    first: node.line.length,
    last: 0
  };
};

let tree = Tree(initFrom, combineTo, selfMetrics);

/**
 * @param {string} s
 * @return {!LineNode}
 */
tree.create = function(s) {
  return tree.wrap({
    line: s,
    longestLine: s.length
  });
};

export class Text {
  /**
   * @param {!LineNode} root
   */
  constructor(root) {
    this._root = root;
    let position = tree.end(this._root);
    this._lineCount = position.line + 1;
    this._lastOffset = position.char;
    this._lastPosition = {lineNumber: position.line, columnNumber: position.column};
    this._lineCache = [];
  }

  /**
   * @param {string} content
   * @return {!Text}
   */
  static withContent(content) {
    return Text.withLines(content.split('\n'));
  }

  /**
   * @param {!Array<string>} lines
   * @return {!Text}
   */
  static withLines(lines) {
    if (!lines.length)
      throw 'Text does not support zero lines';
    return new Text(tree.build(lines.map(tree.create)));
  }

  resetCache() {
    this._lineCache = [];
  }

  /**
   * @param {number} lineNumber
   * @return {?string}
   */
  _line(lineNumber) {
    if (lineNumber >= this._lineCount)
      return null;
    if (this._lineCache[lineNumber] === undefined) {
      if (lineNumber === this._lineCount - 1 && this._lastPosition.columnNumber === 0) {
        this._lineCache[lineNumber] = '';
      } else {
        let found = tree.find(this._root, {line: lineNumber, column: 0});
        this._lineCache[lineNumber] = found ? found.node.line : null;
      }
    }
    return this._lineCache[lineNumber];
  }

  /**
   * @return {string}
   */
  content() {
    let result = [];
    tree.visit(this._root, node => result.push(node.line));
    return result.join('\n');
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
    return this._line(lineNumber);
  }

  /**
   * @return {number}
   */
  longestLineLength() {
    return this._root.longestLine;
  }

  /**
   * @param {number} lineNumber
   * @return {number}
   */
  lineLength(lineNumber) {
    let line = this._line(lineNumber);
    return line ? line.length : 0;
  }

  /**
   * @param {number} lineNumber
   * @param {number} from
   * @param {number} to
   * @return {?string}
   */
  lineChunk(lineNumber, from, to) {
    let line = this._line(lineNumber);
    return line !== null ? line.substring(from, to) : null;
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
    if (position.lineNumber == this._lineCount)
      return this._lastOffset;
    return this.positionToOffset({lineNumber: position.lineNumber + 1, columnNumber: 0}) - 1;
  }

  /**
   * @param {!OffsetRange} range
   * @param {string} first
   * @param {?Text} insertionText
   * @param {?string} last
   * @return {!Text}
   */
  replaceRange(range, first, insertionText, last) {
    let from = this.offsetToPosition(range.from);
    let to = this.offsetToPosition(range.to);
    let insertion = insertionText ? insertionText._root : undefined;

    let tmp = tree.split(this._root, {line: to.lineNumber + 1, column: 0});
    let rightText = tmp.right;
    tmp = tree.split(tmp.left, {line: from.lineNumber, column: 0});
    let leftText = tmp.left;

    let middleText = tmp.right;

    let fromLine, toLine;
    if (from.lineNumber === to.lineNumber) {
      // |middleText| must contain exactly one node.
      fromLine = toLine = middleText ? middleText.line : '';
    } else {
      tmp = tree.split(middleText, {line: to.lineNumber - from.lineNumber, column: 0});
      toLine = tmp.right ? tmp.right.line : '';
      tmp = tree.split(tmp.left, {line: 1, column: 0});
      fromLine = tmp.left.line;
      // tmp.right is dropped altogether.
    }

    if (last === null) {
      let line = fromLine.substring(0, from.columnNumber) + first + toLine.substring(to.columnNumber);
      middleText = tree.create(line);
    } else {
      let leftLine = fromLine.substring(0, from.columnNumber) + first;
      let rightLine = last + toLine.substring(to.columnNumber);
      middleText = tree.merge(tree.create(leftLine), tree.merge(insertion, tree.create(rightLine)));
    }

    return new Text(tree.merge(leftText, tree.merge(middleText, rightText)));
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
    if (chunk.length < index + (position.columnNumber - columnNumber)) {
      if (clamp)
        return offset + chunk.length - index;
      throw 'Position does not belong to text';
    }
    return offset + position.columnNumber - columnNumber;
  }
}
