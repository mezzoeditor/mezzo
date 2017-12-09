import { Tree } from "./Tree.mjs";

/**
 * @typedef {{
 *   line: string,
 *   longestLine: number,
 *   lineCount: number
 * }} LineNode;
 */

 /**
 * @param {!LineNode} from
 * @param {!LineNode} to
 */
let combineTo = function(from, to) {
  to.longestLine = Math.max(to.longestLine, from.longestLine);
  to.lineCount += from.lineCount;
}

/**
 * @param {!LineNode} node
 * @return {!LineNode}
 */
let initFrom = function(node) {
  return {
    line: node.line,
    longestLine: node.line.length,
    lineCount: 1
  };
};

/**
 * @param {!LineNode} node
 * @return {!LineNode}
 */
let selfSize = function(node) {
  return 1;
};

/**
 * @param {!LineNode} node
 * @return {!LineNode}
 */
let treeSize = function(node) {
  return node.lineCount;
};

let { wrap, build, split, merge, find, visit } = Tree(initFrom, combineTo);

/**
 * @param {string} s
 * @return {!LineNode}
 */
let create = function(s) {
  return wrap({
    line: s,
    longestLine: s.length,
    lineCount: 1
  });
};

export class Text {
  /**
   * @param {!LineNode} root
   */
  constructor(root) {
    this._root = root;
    this._lineCount = treeSize(this._root);
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
    return new Text(build(lines.map(create)));
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
      let node = find(this._root, lineNumber, selfSize, treeSize);
      this._lineCache[lineNumber] = node ? node.line : null;
    }
    return this._lineCache[lineNumber];
  }

  /**
   * @return {string}
   */
  content() {
    let result = [];
    visit(this._root, node => result.push(node.line));
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
   * @return {!TextPosition}
   */
  firstPosition() {
    return {lineNumber: 0, columnNumber: 0};
  }

  /**
   * @return {!TextPosition}
   */
  lastPosition() {
    return {lineNumber: this._lineCount - 1, columnNumber: this._line(this._lineCount - 1).length};
  }

  /**
   * @param {!TextPosition} position
   * @return {?TextPosition}
   */
  clampPositionIfNeeded(position) {
    let {lineNumber, columnNumber} = position;
    if (lineNumber < 0)
      return this.firstPosition();
    if (lineNumber >= this._lineCount)
      return this.lastPosition();
    if (columnNumber < 0)
      return {lineNumber, columnNumber: 0};
    let line = this._line(lineNumber);
    if (columnNumber > line.length)
      return {lineNumber, columnNumber: line.length};
    return null;
  }

  /**
   * @param {!TextRange} range
   * @return {?TextRange}
   */
  clampRangeIfNeeded(range) {
    let from = this.clampPositionIfNeeded(range.from);
    let to = this.clampPositionIfNeeded(range.to);
    if (!from && !to)
      return null;
    return {from: from || range.from, to: to || range.to};
  }

  /**
   * @param {!TextPosition} pos
   * @return {!TextPosition}
   */
  nextPosition(pos) {
    if (pos.columnNumber === this._line(pos.lineNumber).length) {
      if (pos.lineNumber !== this._lineCount)
        return {lineNumber: pos.lineNumber + 1, columnNumber: 0};
      else
        return {lineNumber: pos.lineNumber, columnNumber: pos.columnNumber};
    } else {
      return {lineNumber: pos.lineNumber, columnNumber: pos.columnNumber + 1};
    }
  }

  /**
   * @param {!TextPosition} pos
   * @return {!TextPosition}
   */
  previousPosition(pos) {
    if (!pos.columnNumber) {
      if (pos.lineNumber)
        return {lineNumber: pos.lineNumber - 1, columnNumber: this._line(pos.lineNumber - 1).length};
      else
        return {lineNumber: pos.lineNumber, columnNumber: pos.columnNumber};
    } else {
      return {lineNumber: pos.lineNumber, columnNumber: pos.columnNumber - 1};
    }
  }

  /**
   * @param {!TextPosition} pos
   * @return {!TextPosition}
   */
  lineStartPosition(pos) {
    return {lineNumber: pos.lineNumber, columnNumber: 0};
  }

  /**
   * @param {!TextPosition} pos
   * @return {!TextPosition}
   */
  lineEndPosition(pos) {
    return {lineNumber: pos.lineNumber, columnNumber: this._line(pos.lineNumber).length};
  }

  /**
   * @param {!TextRange} range
   * @param {string} first
   * @param {?Text} insertionText
   * @param {?string} last
   * @return {!Text}
   */
  replaceRange(range, first, insertionText, last) {
    let {from, to} = range;
    let insertion = insertionText ? insertionText._root : undefined;

    let tmp = split(this._root, to.lineNumber + 1, selfSize, treeSize);
    let rightText = tmp.right;
    tmp = split(tmp.left, from.lineNumber, selfSize, treeSize);
    let leftText = tmp.left;

    let middleText = tmp.right;

    let fromLine, toLine;
    if (from.lineNumber === to.lineNumber) {
      // |middleText| must contain exactly one node.
      fromLine = toLine = middleText.line;
    } else {
      tmp = split(middleText, to.lineNumber - from.lineNumber, selfSize, treeSize);
      toLine = tmp.right.line;
      tmp = split(tmp.left, 1, selfSize, treeSize);
      fromLine = tmp.left.line;
      // tmp.right is dropped altogether.
    }

    if (last === null) {
      let line = fromLine.substring(0, from.columnNumber) + first + toLine.substring(to.columnNumber);
      middleText = create(line);
    } else {
      let leftLine = fromLine.substring(0, from.columnNumber) + first;
      let rightLine = last + toLine.substring(to.columnNumber);
      middleText = merge(create(leftLine), merge(insertion, create(rightLine)));
    }

    return new Text(merge(leftText, merge(middleText, rightText)));
  }
}
