import { Chunk } from "./Chunk.mjs";
import { Random } from "./Random.mjs";

/** @type {!Position} */
let origin = { offset: 0, line: 0, column: 0 };
let random = Random(42);

const kDefaultChunkSize = 100;

/**
 * @typedef {{
 *   length: number,
 *   lines: number|undefined,
 *   first: number,
 *   last: number,
 *   longest: number
 * }} Metrics;
 */

/**
 * @typedef {{
 *   chunk: string
 *   metrics: !Metrics,
 *   selfMetrics: !Metrics|undefined,
 *   left: !TreeNode|undefined,
 *   right: !TreeNode|undefined,
 *   h: number
 * }} TreeNode;
 */

/**
 * @typedef {{
 *   offset: number|undefined,
 *   line: number|undefined,
 *   column: number|undefined
 * }} Position;
 */

/**
 * @param {string} s
 * @return {!TreeNode}
 */
function createNode(s) {
  return {
    chunk: s,
    h: random(),
    metrics: Chunk.metrics(s)
  };
}

/**
 * @param {!Position} position
 * @param {!Metrics} metrics
 * @return {!Position}
 */
function advancePosition(position, metrics) {
  return {
    offset: position.offset + metrics.length,
    line: position.line + (metrics.lines || 0),
    column: metrics.last + (metrics.lines ? 0 : position.column)
  };
}

/**
 * @param {!Position} position
 * @param {!Position} key
 */
function greater(position, key) {
  if (key.offset !== undefined)
    return position.offset > key.offset;
  return position.line > key.line || (position.line === key.line && position.column > key.column);
}

/**
 * @param {!Position} position
 * @param {!Position} key
 */
function greaterEqual(position, key) {
  if (key.offset !== undefined)
    return position.offset >= key.offset;
  return position.line > key.line || (position.line === key.line && position.column >= key.column);
}

/**
 * @param {!Metrics} metrics
 * @return {!Metrics}
 */
function cloneMetrics(metrics) {
  let result = {
    length: metrics.length,
    last: metrics.last,
    first: metrics.first,
    longest: metrics.longest
  };
  if (metrics.lines)
    result.lines = metrics.lines;
  return result;
}

/**
 * @param {!TreeNode} parent
 * @param {!TreeNode|undefined} left
 * @param {!TreeNode|undefined} right
 * @param {boolean=} skipClone
 * @return {!TreeNode}
 */
function setChildren(parent, left, right, skipClone) {
  let node = skipClone ? parent : {
    chunk: parent.chunk,
    h: parent.h,
    metrics: cloneMetrics(parent.selfMetrics || parent.metrics)
  };
  if (left || right)
    node.selfMetrics = cloneMetrics(node.metrics);
  if (left) {
    node.left = left;
    let longest = Math.max(left.metrics.longest, left.metrics.last + node.metrics.first);
    node.metrics.longest = Math.max(node.metrics.longest, longest);
    node.metrics.first = left.metrics.first + (left.metrics.lines ? 0 : node.metrics.first);
    node.metrics.last = node.metrics.last + (node.metrics.lines ? 0 : left.metrics.last);
    node.metrics.length += left.metrics.length;
    if (left.metrics.lines)
      node.metrics.lines = left.metrics.lines + (node.metrics.lines || 0);
  }
  if (right) {
    node.right = right;
    let longest = Math.max(right.metrics.longest, node.metrics.last + right.metrics.first);
    node.metrics.longest = Math.max(node.metrics.longest, longest);
    node.metrics.first = node.metrics.first + (node.metrics.lines ? 0 : right.metrics.first);
    node.metrics.last = right.metrics.last + (right.metrics.lines ? 0 : node.metrics.last);
    node.metrics.length += right.metrics.length;
    if (right.metrics.lines)
      node.metrics.lines = right.metrics.lines + (node.metrics.lines || 0);
  }
  return node;
}

/**
 * @param {!Array<!TreeNode>} nodes
 * @return {!TreeNode|undefined}
 */
function buildTree(nodes) {
  if (!nodes.length)
    return;
  if (nodes.length === 1)
    return nodes[0];

  let stack = [];
  let p = Array(nodes.length);
  for (let i = 0; i < nodes.length; i++) {
    while (stack.length && nodes[stack[stack.length - 1]].h <= nodes[i].h)
      stack.pop();
    p[i] = stack.length ? stack[stack.length - 1] : -1;
    stack.push(i);
  }
  stack = [];

  let l = Array(nodes.length).fill(-1);
  let r = Array(nodes.length).fill(-1);
  let root = -1;
  for (let i = nodes.length - 1; i >= 0; i--) {
    while (stack.length && nodes[stack[stack.length - 1]].h <= nodes[i].h)
      stack.pop();
    let parent = stack.length ? stack[stack.length - 1] : -1;
    if (parent === -1 || (p[i] !== -1 && nodes[p[i]].h < nodes[parent].h))
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

  /**
   * @param {number} i
   * @return {!TreeNode}
   */
  function fill(i) {
    let left = l[i] === -1 ? undefined : fill(l[i]);
    let right = r[i] === -1 ? undefined : fill(r[i]);
    return setChildren(nodes[i], left, right, false);
  }
  return fill(root);
}

/**
 * Left part contains all nodes up to key.
 * If node contains a key position inside, it will be returned in right part,
 * unless |intersectionToLeft| is true.
 * @param {!TreeNode|undefined} root
 * @param {!Position} key
 * @param {boolean} intersectionToLeft
 * @param {!Position=} current
 * @return {{left: !TreeNode|undefined, right: !TreeNode|undefined}}
 */
function splitTree(root, key, intersectionToLeft, current) {
  if (!root)
    return {};
  if (!current)
    current = origin;
  if (greaterEqual(current, key))
    return {right: root};
  if (!greater(advancePosition(current, root.metrics), key))
    return {left: root};

  // intersection to left:
  //   key a b  ->  root to right
  //   a key b  ->  root to left
  //   a b key  ->  root to left
  //   rootToLeft = (key > a) == (a < key) == !(a >= key)

  // intersection to right:
  //   key a b  ->  root to right
  //   a key b  ->  root to right
  //   a b key  ->  root to left
  //   rootToLeft = (key >= b) == (b <= key) == !(b > key)

  let next = root.left ? advancePosition(current, root.left.metrics) : current;
  let rootToLeft = !greaterEqual(next, key);
  next = advancePosition(next, root.selfMetrics || root.metrics);
  if (!intersectionToLeft)
    rootToLeft = !greater(next, key);
  if (rootToLeft) {
    let tmp = splitTree(root.right, key, intersectionToLeft, next);
    return {left: setChildren(root, root.left, tmp.left), right: tmp.right};
  } else {
    let tmp = splitTree(root.left, key, intersectionToLeft, current);
    return {left: tmp.left, right: setChildren(root, tmp.right, root.right)};
  }
}

/**
 * @param {!TreeNode|undefined} left
 * @param {!TreeNode|undefined} right
 * @return {!TreeNode|undefined}
 */
function mergeTrees(left, right) {
  if (!left)
    return right;
  if (!right)
    return left;
  if (left.h > right.h)
    return setChildren(left, left.left, mergeTrees(left.right, right));
  else
    return setChildren(right, mergeTrees(left, right.left), right.right);
}

/**
 * @param {!TreeNode} node
 * @param {!Position} key
 * @return {{node: !TreeNode, position: !Position}|undefined}
 */
function findNode(node, key) {
  let current = origin;
  while (true) {
    if (node.left) {
      let next = advancePosition(current, node.left.metrics);
      if (greater(next, key)) {
        node = node.left;
        continue;
      }
      current = next;
    }
    let next = advancePosition(current, node.selfMetrics || node.metrics);
    if (greater(next, key))
      return {node, position: current};
    current = next;
    if (!node.right)
      return;
    node = node.right;
  }
}

const kLeft = 0;
const kSelf = 1;
const kRight = 2;

class TreeIterator {
  /**
   * @param {!TreeNode} node
   * @param {!Array<!TreeNode>} stack
   * @param {number} from
   * @param {number} to
   * @param {number} before
   * @param {number} after
   */
  constructor(node, stack, from, to, before, after) {
    this._node = node;
    this._stack = stack;
    this._from = from;
    this._to = to;
    this._before = before;
    this._after = after;
  }

  /**
   * @param {!TreeNode} root
   * @param {number} position
   * @param {number} from
   * @param {number} to
   * @return {!TreeIterator}
   */
  static create(root, position, from, to) {
    let it = new TreeIterator(root, [], from, to, 0, 0);
    it._init(root, position);
    return it;
  }

  /**
   * @return {!TreeIterator}
   */
  clone() {
    return new TreeIterator(this._node, this._stack.slice(), this._from, this._to, this._before, this._after);
  }

  /**
   * @param {!TreeNode} node
   * @param {number} position
   */
  _init(node, position) {
    this._stack = [];
    let current = 0;
    while (true) {
      this._stack.push(node);
      if (node.left) {
        let next = current + node.left.metrics.length;
        if (next > position) {
          node = node.left;
          continue;
        }
        current = next;
      }
      let next = current + (node.selfMetrics || node.metrics).length;
      if (next > position || !node.right) {
        this._node = node;
        this._before = current;
        this._after = next;
        return;
      }
      current = next;
      node = node.right;
    }
  }

  /**
   * @return {boolean}
   */
  next() {
    if (this._after > this._to)
      return false;

    if (this._node.right) {
      let right = this._node.right;
      while (right.left) {
        this._stack.push(right);
        right = right.left;
      }
      this._stack.push(right);
      this._before = this._after;
      this._after += (right.selfMetrics || right.metrics).length;
      this._node = right;
      return true;
    }

    let len = this._stack.length;
    while (len > 1 && this._stack[len - 2].right === this._stack[len - 1]) {
      this._stack.pop();
      len--;
    }
    if (len === 1)
      return false;

    let next = this._stack[len - 2];
    this._stack.pop();
    this._before = this._after;
    this._after += (next.selfMetrics || next.metrics).length;
    this._node = next;
    return true;
  }

  /**
   * @return {boolean}
   */
  prev() {
    if (this._before < this._from)
      return false;

    if (this._node.left) {
      let left = this._node.left;
      while (left.right) {
        this._stack.push(right);
        left = left.right;
      }
      this._stack.push(left);
      this._after = this._before;
      this._before -= (left.selfMetrics || left.metrics).length;
      this._node = left;
      return true;
    }

    let len = this._stack.length;
    while (len > 1 && this._stack[len - 2].left === this._stack[len - 1]) {
      this._stack.pop();
      len--;
    }
    if (len === 1)
      return false;

    let next = this._stack[len - 2];
    this._stack.pop();
    this._after = this._before;
    this._before -= (next.selfMetrics || next.metrics).length;
    this._node = next;
    return true;
  }

  /**
   * @return {!TreeNode}
   */
  node() {
    return this._node;
  }

  /**
   * @return {number}
   */
  before() {
    return this._before;
  }

  /**
   * @return {number}
   */
  after() {
    return this._after;
  }
};

export class Text {
  /**
   * @param {!TreeNode} root
   */
  constructor(root) {
    this._root = root;
    let metrics = this._root.metrics;
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
   * @return {!TreeNode}
   */
  static _withContent(content) {
    let index = 0;
    let nodes = [];
    while (index < content.length) {
      let length = Math.min(content.length - index, kDefaultChunkSize);
      let chunk = content.substring(index, index + length);
      nodes.push(createNode(chunk));
      index += length;
    }
    if (!nodes.length)
      nodes.push(createNode(''));
    return buildTree(nodes);
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
    let iterator = TreeIterator.create(this._root, from, from, to);
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
    offset = Math.max(from, offset);
    offset = Math.min(to, offset);
    let it = TreeIterator.create(this._root, offset, from, to);
    return new Text.Iterator(it, offset, from, to);
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
    let tmp = splitTree(this._root, {offset: to}, true /* intersectionToLeft */);
    let right = tmp.right;
    tmp = splitTree(tmp.left, {offset: from}, false /* intersectionToLeft */);
    let left = tmp.left;
    let middle = tmp.right;
    if (!middle) {
      middle = Text._withContent(insertion);
    } else {
      let leftSize = left ? left.metrics.length : 0;
      let middleSize = middle.metrics.length;
      let first = findNode(middle, {offset: 0}).node;
      let last = findNode(middle, {offset: middleSize - 1}).node;
      middle = Text._withContent(
        first.chunk.substring(0, from - leftSize) +
        insertion +
        last.chunk.substring(last.chunk.length - (leftSize + middleSize - to)));
    }
    return new Text(mergeTrees(left, mergeTrees(middle, right)));
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
    let found = findNode(this._root, {offset});
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
    let found = findNode(this._root, {line: position.line, column: position.column});
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
   * @param {!TreeIterator} iterator
   * @param {number} offset
   * @param {number} from
   * @param {number} to
   */
  constructor(iterator, offset, from, to) {
    this._iterator = iterator;
    this._from = from;
    this._to = to;

    this.offset = offset;
    this._chunk = this._iterator.node().chunk;
    this._pos = offset - this._iterator.before();
    this.current = this._chunk[this._pos];
  }

  /**
   * @return {!Text.Iterator}
   */
  clone() {
    let it = this._iterator.clone();
    return new Text.Iterator(it, this.offset, this._from, this._to);
  }

  /**
   * @return {boolean}
   */
  next() {
    return this.advance(1);
  }

  /**
   * @return {boolean}
   */
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

  /**
   * @param {number} x
   * @return {boolean}
   */
  advance(x) {
    if (this.offset + x > this._to)
      return false;
    this.offset += x;
    this._pos += x;
    while (this._pos >= this._chunk.length) {
      this._pos -= this._chunk.length - 1;
      this._iterator.next();
      this._chunk = this._iterator.node().chunk;
    }
    this.current = this._chunk[this._pos];
    return true;
  }

  /**
   * @return {number}
   */
  length() {
    return this._to - this._from + 1;
  }
};
