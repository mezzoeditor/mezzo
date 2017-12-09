let seed = 42;
let random = function() {
  return seed = seed * 48271 % 2147483647;
};

/**
 * @typedef {{
 *   s: string,
 * }} Line;
 */

 let emptyLine = { s: '' };

/**
 * @typedef {{
 *   line: !Line|undefined,
 *   lineWidget: Object|undefined,
 *
 *   longestLine: number,
 *   lineCount: number,
 *   widgetLineCount: number|undefined,
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
    if (left.widgetLineCount)
      node.widgetLineCount = (node.widgetLineCount || 0) + left.widgetLineCount;
  }
  if (right) {
    node.right = right;
    node.lineCount += right.lineCount;
    node.longestLine = Math.max(node.longestLine, right.longestLine);
    if (right.widgetLineCount)
      node.widgetLineCount = (node.widgetLineCount || 0) + right.widgetLineCount;
  }
  return node;
};


/**
 * @param {!LineNode} node
 * @return {!LineNode}
 */
let clone = function(node) {
  let result = {
    lineCount: 0,
    longestLine: 0,
    h: node.h
  };
  if (node.line) {
    result.line = node.line;
    result.lineCount = 1;
    result.longestLine = node.line.s.length;
  }
  if (node.lineWidget) {
    result.lineWidget = node.lineWidget;
    result.widgetLineCount = 1;
  }
  return result;
};


/**
 * @param {string} s
 * @param {number=} h
 * @return {!LineNode}
 */
let lineNode = function(s, h) {
  return {
    line: s ? {s} : emptyLine,
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
 * @param {!LineNode} root
 * @param {function(!LineNode):*} visitor
 * @param {boolean=} reverse
 * @return {*}
 */
let visit = function(root, visitor, reverse) {
  let {left, right} = root;
  if (reverse) {
    let tmp = left;
    left = right;
    right = tmp;
  }
  let result;

  if (left) {
    result = visit(left, visitor, reverse);
    if (result)
      return result;
  }

  result = visitor(root);
  if (result)
    return result;

  if (right)
    result = visit(right, visitor, reverse);
  return result;
};


/**
 * @param {!LineNode} root
 * @param {number} lineNumber
 * @return {!LineNode|undefined}
 */
let find = function(root, lineNumber) {
  while (true) {
    if (root.left) {
      if (root.left.lineCount > lineNumber) {
        root = root.left;
        continue;
      }
      lineNumber -= root.left.lineCount;
    }
    if (root.line) {
      if (!lineNumber)
        return root;
      lineNumber--;
    }
    if (!root.right)
      return;
    root = root.right;
  }
};


/**
 * Left part contains:
 *   - all lines and widgets up to (lineNumber - 1)
 *   - if |widgetsToLeft| is true, all widgets between (lineNumber - 1) and (lineNumber)
 * @param {!LineNode|undefined} root
 * @param {number} lineNumber
 * @return {{left: !LineNode|undefined, right: !LineNode|undefined}}
 */
let split = function(root, lineNumber, widgetsToLeft) {
  if (!root)
    return {};
  if (lineNumber >= root.lineCount)
    return {left: root};
  if (lineNumber < 0)
    return {right: root};

  let leftCount = root.left ? root.left.lineCount : 0;
  let rootToLeft = (root.line || widgetsToLeft) ? leftCount < lineNumber : leftCount <= lineNumber;
  if (rootToLeft) {
    let tmp = split(root.right, lineNumber - leftCount - (root.line ? 1 : 0), widgetsToLeft);
    return {left: setChildren(clone(root), root.left, tmp.left), right: tmp.right};
  } else {
    let tmp = split(root.left, lineNumber, widgetsToLeft);
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
   * @return {!Line|undefined}
   */
  _line(lineNumber) {
    if (lineNumber >= this._lineCount)
      return;
    if (!this._lineCache[lineNumber])
      this._lineCache[lineNumber] = find(this._root, lineNumber).line;
    return this._lineCache[lineNumber];
  }

  /**
   * @return {string}
   */
  content() {
    let result = [];
    visit(this._root, node => {
      if (node.line)
        result.push(node.line.s);
    });
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
    let line = this._line(lineNumber);
    return line ? line.s : null;
  }

  /**
   * @return {number}
   */
  longestLineLength() {
    return this._root.longestLine;
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
    return {lineNumber: this._lineCount - 1, columnNumber: this._line(this._lineCount - 1).s.length};
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
    if (columnNumber > line.s.length)
      return {lineNumber, columnNumber: line.s.length};
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
    if (pos.columnNumber === this._line(pos.lineNumber).s.length) {
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
        return {lineNumber: pos.lineNumber - 1, columnNumber: this._line(pos.lineNumber - 1).s.length};
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
    return {lineNumber: pos.lineNumber, columnNumber: this._line(pos.lineNumber).s.length};
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

    let tmp = split(this._root, to.lineNumber + 1, false /* widgetsToLeft */);
    let rightText = tmp.right;
    tmp = split(tmp.left, from.lineNumber, true /* widgetsToLeft */);
    let leftText = tmp.left;

    // No widgets on the sides in |middleText|.
    let middleText = tmp.right;

    let fromLine, toLine;
    if (from.lineNumber === to.lineNumber) {
      // |middleText| must contain exactly one node.
      fromLine = toLine = middleText.line.s;
    } else {
      tmp = split(middleText, to.lineNumber - from.lineNumber, true /* widgetsToLeft */);
      toLine = tmp.right.line.s;
      tmp = split(tmp.left, 1, false /* widgetsToLeft */);
      fromLine = tmp.left.line.s;
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
