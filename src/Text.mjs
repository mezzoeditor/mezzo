import { Random } from "./Types.mjs";
let random = Random(42);

/**
 * @typedef {{
 *   line: string,
 *
 *   longestLine: number,
 *   lineCount: number,
 *
 *   left: !LineNode|undefined,
 *   right: !LineNode|undefined,
 *   h: number,
 * }} LineNode;
 */


/**
 * @param {!LineNode} node
 * @param {!LineNode|undefined} left
 * @param {!LineNode|undefined} right
 * @return {!LineNode}
 */
let setChildren = function(node, left, right) {
  if (left) {
    node.left = left;
    node.lineCount += left.lineCount;
    node.longestLine = Math.max(node.longestLine, left.longestLine);
  }
  if (right) {
    node.right = right;
    node.lineCount += right.lineCount;
    node.longestLine = Math.max(node.longestLine, right.longestLine);
  }
  return node;
};


/**
 * @param {!LineNode} node
 * @return {!LineNode}
 */
let clone = function(node) {
  return {
    line: node.line,
    lineCount: 1,
    longestLine: node.line.length,
    h: node.h
  };
};


/**
 * @param {string} s
 * @param {number=} h
 * @return {!LineNode}
 */
let lineNode = function(s, h) {
  return {
    line: s,
    longestLine: s.length,
    lineCount: 1,
    h: h === undefined ? random() : h
  };
};


/**
 * @param {!Array<string>} lines
 * @return {!Array<!LineNode>}
 */
let build = function(lines) {
  let h = lines.map(() => random());

  let stack = [];
  let p = Array(h.length);
  for (let i = 0; i < h.length; i++) {
    while (stack.length && h[stack[stack.length - 1]] <= h[i])
      stack.pop();
    p[i] = stack.length ? stack[stack.length - 1] : -1;
    stack.push(i);
  }
  stack = [];

  let l = Array(h.length).fill(-1);
  let r = Array(h.length).fill(-1);
  let root = -1;
  for (let i = h.length - 1; i >= 0; i--) {
    while (stack.length && h[stack[stack.length - 1]] <= h[i])
      stack.pop();
    let parent = stack.length ? stack[stack.length - 1] : -1;
    if (parent === -1 || (p[i] !== -1 && h[p[i]] < h[parent]))
      parent = p[i];
    if (parent === -1)
      root = i;
    else if (parent > i)
      l[parent] = i;
    else
      r[parent] = i;
    stack.push(i);
  }
  stack = [];

  function fill(i) {
    let node = lineNode(lines[i], h[i]);
    let left = l[i] === -1 ? undefined : fill(l[i]);
    let right = r[i] === -1 ? undefined : fill(r[i]);
    return setChildren(node, left, right);
  }
  return fill(root);
};


/**
 * Left part contains all linesup to (lineNumber - 1)
 * @param {!LineNode|undefined} root
 * @param {number} lineNumber
 * @return {{left: !LineNode|undefined, right: !LineNode|undefined}}
 */
let split = function(root, lineNumber) {
  if (!root)
    return {};
  if (lineNumber >= root.lineCount)
    return {left: root};
  if (lineNumber < 0)
    return {right: root};

  let leftCount = root.left ? root.left.lineCount : 0;
  if (leftCount < lineNumber) {
    let tmp = split(root.right, lineNumber - leftCount - 1);
    return {left: setChildren(clone(root), root.left, tmp.left), right: tmp.right};
  } else {
    let tmp = split(root.left, lineNumber);
    return {left: tmp.left, right: setChildren(clone(root), tmp.right, root.right)};
  }
};


/**
 * @param {!LineNode|undefined} left
 * @param {!LineNode|undefined} right
 * @return {!LineNode|undefined}
 */
let merge = function(left, right) {
  if (!left)
    return right;
  if (!right)
    return left;
  if (left.h > right.h)
    return setChildren(clone(left), left.left, merge(left.right, right));
  else
    return setChildren(clone(right), merge(left, right.left), right.right);
};


export class Text {
  /**
   * @param {!LineNode} root
   */
  constructor(root) {
    this._root = root;
    this._lineCount = this._root.lineCount;
    this._lineCache = [];
  }

  /**
   * @param {string} content
   * @return {!Text}
   */
  static withContent(content) {
    return new Text(build(content.split('\n')));
  }

  /**
   * @param {!Array<string>} lines
   * @return {!Text}
   */
  static withLines(lines) {
    if (!lines.length)
      throw 'Text does not support zero lines';
    return new Text(build(lines));
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
    if (this._lineCache[lineNumber] === undefined)
      this._lineCache[lineNumber] = this._find(lineNumber);
    return this._lineCache[lineNumber];
  }

  /**
   * @param {number} lineNumber
   * @return {?string}
   */
  _find(lineNumber) {
    let root = this._root;
    while (true) {
      if (root.left) {
        if (root.left.lineCount > lineNumber) {
          root = root.left;
          continue;
        }
        lineNumber -= root.left.lineCount;
      }
      if (!lineNumber)
        return root.line;
      lineNumber--;
      if (!root.right)
        return null;
      root = root.right;
    }
    return null;
  }

  /**
   * @return {string}
   */
  content() {
    let result = [];
    let visit = function(node) {
      if (node.left)
        visit(node.left);
      result.push(node.line);
      if (node.right)
        visit(node.right);
    }
    visit(this._root);
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

    let tmp = split(this._root, to.lineNumber + 1);
    let rightText = tmp.right;
    tmp = split(tmp.left, from.lineNumber);
    let leftText = tmp.left;

    let middleText = tmp.right;

    let fromLine, toLine;
    if (from.lineNumber === to.lineNumber) {
      // |middleText| must contain exactly one node.
      fromLine = toLine = middleText.line;
    } else {
      tmp = split(middleText, to.lineNumber - from.lineNumber);
      toLine = tmp.right.line;
      tmp = split(tmp.left, 1);
      fromLine = tmp.left.line;
      // tmp.right is dropped altogether.
    }

    if (last === null) {
      let line = fromLine.substring(0, from.columnNumber) + first + toLine.substring(to.columnNumber);
      middleText = lineNode(line);
    } else {
      let leftLine = fromLine.substring(0, from.columnNumber) + first;
      let rightLine = last + toLine.substring(to.columnNumber);
      middleText = merge(lineNode(leftLine), merge(insertion, lineNode(rightLine)));
    }

    return new Text(merge(leftText, merge(middleText, rightText)));
  }
}
