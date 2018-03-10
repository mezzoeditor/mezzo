import { Random } from './Random.mjs';

let random = Random(42);

/**
 * @typedef {{
 *   length: number,
 *   lineBreaks: number|undefined,
 *   firstColumns: number,
 *   firstWidth: number|undefined,
 *   lastColumns: number,
 *   lastWidth: number|undefined,
 *   longestColumns: number,
 *   longestWidth: number|undefined,
 * }} Metrics;
 */

/**
 * @typedef {number} Offset;
 */

/**
 * @typedef {{
 *   line: number,
 *   column: number,
 * }} Position;
 */

/**
 * @typedef {{
 *   x: number,
 *   y: number,
 * }} Point;
 */

 /**
 * @typedef {{
 *   offset: number,
 *   line: number,
 *   column: number,
 *   x: number,
 *   y: number,
 * }} Location;
 */

/**
 * @typedef {{
 *   from: number,
 *   to: number
 * }} Range;
 */

/**
 * @template T
 * @typedef {{
 *   data: T,
 *   metrics: !Metrics,
 *   selfMetrics: !Metrics|undefined,
 *   left: !TreeNode<T>|undefined,
 *   right: !TreeNode<T>|undefined,
 *   h: number
 * }} TreeNode;
 */

/**
 * @typedef {{
 *   offset: number|undefined,
 *   line: number|undefined,
 *   column: number|undefined,
 *   x: number|undefined,
 *   y: number|undefined,
 * }} FindKey;
 */

/** @type {!Metrics} */
let zeroMetrics = { length: 0, firstColumns: 0, lastColumns: 0, longestColumns: 0 };
/** @type {!Location} */
let origin = { offset: 0, line: 0, column: 0, x: 0, y: 0 };

/**
 * @template T
 */
export class Tree {
  /**
   * @param {number} lineHeight
   * @param {number} defaultWidth
   */
  constructor(lineHeight, defaultWidth) {
    this._lineHeight = lineHeight;
    this._defaultWidth = defaultWidth;
    this._root = undefined;
    this._endLocation = origin;
  }

  /**
   * Takes ownership of |nodes| - do not use them after calling this.
   * @param {!Array<!{data: T, metrics: !Metrics}>} nodes
   * @param {number} lineHeight
   * @param {number} defaultWidth
   * @param {!Tree<T>=} left
   * @param {!Tree<T>=} right
   * @return {!Tree<T>}
   */
  static build(nodes, lineHeight, defaultWidth, left, right) {
    let tree = new Tree(lineHeight, defaultWidth);
    let root = tree._build(nodes);
    if (left) {
      if (left._lineHeight !== lineHeight || left._defaultWidth !== defaultWidth)
        throw 'Cannot merge trees with different metrics';
      root = tree._merge(left._root, root);
    }
    if (right) {
      if (right._lineHeight !== lineHeight || right._defaultWidth !== defaultWidth)
        throw 'Cannot merge trees with different metrics';
      root = tree._merge(root, right._root);
    }
    tree._setRoot(root);
    return tree;
  }

  /**
   * @return {!Metrics}
   */
  metrics() {
    return this._root ? this._root.metrics : zeroMetrics;
  }

  /**
   * @return {!Location}
   */
  endLocation() {
    return this._endLocation;
  }

  /**
   * @param {number} offset
   * @param {number} from
   * @param {number} to
   * @return {!TreeIterator<T>}
   */
  iterator(offset, from, to) {
    let it = new TreeIterator(this._root, [], from, to, 0, 0);
    it._init(this._root, offset);
    return it;
  }

  /**
   * @param {number} offset
   * @return {!{data: ?T, location: ?Location}}
   */
  findByOffset(offset) {
    if (!this._root || offset > this._root.metrics.length)
      return {data: null, location: null};
    if (offset === this._root.metrics.length)
      return {data: null, location: this._endLocation};
    let found = this._findNode(this._root, {offset});
    if (!found)
      throw 'Inconsistency';
    return {data: found.node.data, location: found.location};
  }

  /**
   * @param {!Position} position
   * @param {boolean} strict
   * @return {!{data: ?T, location: !Location, clampedPosition: !Position}}
   */
  findByPosition(position, strict) {
    if (position.line < 0) {
      if (strict)
        throw 'Position does not belong to the tree';
      position = {line: 0, column: 0};
    }
    if (position.column < 0) {
      if (strict)
        throw 'Position does not belong to the tree';
      position = {line: position.line, column: 0};
    }
    let compare = (position.line - this._endLocation.line) || (position.column - this._endLocation.column);
    if (compare >= 0) {
      if (!strict || compare === 0)
        return {data: null, location: this._endLocation, clampedPosition: position};
      throw 'Position does not belong to the tree';
    }
    let found = this._findNode(this._root, {line: position.line, column: position.column});
    if (!found) {
      if (!strict)
        return {data: null, location: this._endLocation, clampedPosition: position};
      throw 'Position does not belong to the tree';
    }
    return {data: found.node.data, location: found.location, clampedPosition: position};
  }

  /**
   * @param {!Point} point
   * @param {boolean} strict
   * @return {!{data: ?T, location: !Location, clampedPoint: !Point}}
   */
  findByPoint(point, strict) {
    if (point.y < 0) {
      if (strict)
        throw 'Point does not belong to the tree';
      point = {x: 0, y: 0};
    }
    if (point.x < 0) {
      if (strict)
        throw 'Point does not belong to the tree';
      point = {x: 0, y: point.y};
    }

    let outside = false;
    if (point.y >= this._endLocation.y + this._lineHeight) {
      outside = true;
    } else if (point.y >= this._endLocation.y && point.x > this._endLocation.x) {
      outside = true;
    }
    if (outside) {
      if (!strict)
        return {data: null, location: this._endLocation, clampedPoint: point};
      throw 'Point does not belong to the tree';
    }
    if (point.y === this._endLocation.y && point.x === this._endLocation.x)
      return {data: null, location: this._endLocation, clampedPoint: point};

    let found = this._findNode(this._root, {x: point.x, y: point.y});
    if (!found) {
      if (!strict)
        return {data: null, location: this._endLocation, clampedPoint: point};
      throw 'Point does not belong to the tree';
    }
    return {data: found.node.data, location: found.location, clampedPoint: point};
  }

  /**
   * @param {number} from
   * @param {number} to
   * @return {!{left: !Tree<T>, right: !Tree<T>, middle: !Array<T>}}
   */
  split(from, to) {
    let tmp = this._split(this._root, {offset: to}, true /* intersectionToLeft */);
    let right = new Tree(this._lineHeight, this._defaultWidth);
    right._setRoot(tmp.right);
    tmp = this._split(tmp.left, {offset: from}, false /* intersectionToLeft */);
    let left = new Tree(this._lineHeight, this._defaultWidth);
    left._setRoot(tmp.left);
    let middle = [];
    if (tmp.right)
      this._collect(tmp.right, middle);
    return {left, right, middle};
  }

  /**
   * @param {!Location} location
   * @param {!FindKey} key
   * @return {boolean}
   */
  _locationIsGreater(location, key) {
    if (key.offset !== undefined)
      return location.offset > key.offset;
    if (key.line !== undefined)
      return location.line > key.line || (location.line === key.line && location.column > key.column);
    return location.y > key.y || (location.y + this._lineHeight > key.y && location.x > key.x);
  }

  /**
   * @param {!Location} location
   * @param {!FindKey} key
   * @return {boolean}
   */
  _locationIsGreaterOrEqual(location, key) {
    if (key.offset !== undefined)
      return location.offset >= key.offset;
    if (key.line !== undefined)
      return location.line > key.line || (location.line === key.line && location.column >= key.column);
    throw 'locationIsGreaterOrEqual cannot be used for points';
  }

  /**
   * @param {!Metrics} left
   * @param {!Metrics} right
   * @return {!Metrics}
   */
  _combineMetrics(left, right) {
    let defaultWidth = this._defaultWidth;
    let result = {
      longestColumns: Math.max(Math.max(left.longestColumns, left.lastColumns + right.firstColumns), right.longestColumns),
      firstColumns: left.firstColumns + (left.lineBreaks ? 0 : right.firstColumns),
      lastColumns: right.lastColumns + (right.lineBreaks ? 0 : left.lastColumns),
      length: left.length + right.length
    }
    if (left.lineBreaks || right.lineBreaks)
      result.lineBreaks = (left.lineBreaks || 0) + (right.lineBreaks || 0);
    if (left.firstWidth || (!left.lineBreaks && right.firstWidth)) {
      result.firstWidth =
          (left.firstWidth || left.firstColumns * defaultWidth) +
          (left.lineBreaks ? 0 : (right.firstWidth || right.firstColumns * defaultWidth));
    }
    if (right.lastWidth || (!right.lineBreaks && left.lastWidth)) {
      result.lastWidth =
          (right.lastWidth || right.lastColumns * defaultWidth) +
          (right.lineBreaks ? 0 : (left.lastWidth || left.lastColumns * defaultWidth));
    }
    if (left.longestWidth || right.longestWidth || left.lastWidth || right.firstWidth) {
      result.longestWidth = Math.max(
          left.longestWidth || left.longestColumns * defaultWidth,
          right.longestWidth || right.longestColumns * defaultWidth);
      result.longestWidth = Math.max(
          result.longestWidth,
          (left.lastWidth || left.lastColumns * defaultWidth) + (right.firstWidth || right.firstColumns * defaultWidth));
    }
    return result;
  }

  /**
   * @param {!Location} location
   * @param {!Metrics} metrics
   * @return {!Location}
   */
  _advanceLocation(location, metrics) {
    let result = {
      offset: location.offset + metrics.length,
      line: location.line + (metrics.lineBreaks || 0),
      column: metrics.lastColumns + (metrics.lineBreaks ? 0 : location.column),
      x: (metrics.lastWidth || metrics.lastColumns * this._defaultWidth) + (metrics.lineBreaks ? 0 : location.x)
    };
    result.y = result.line * this._lineHeight;
    return result;
  }

  /**
   * @param {!TreeNode<T>} parent
   * @param {!TreeNode<T>|undefined} left
   * @param {!TreeNode<T>|undefined} right
   * @param {boolean=} skipClone
   * @return {!TreeNode<T>}
   */
  _setChildren(parent, left, right, skipClone) {
    let node = skipClone ? parent : {
      data: parent.data,
      h: parent.h,
      metrics: parent.selfMetrics || parent.metrics
    };
    if (!node.selfMetrics && (left || right))
      node.selfMetrics = node.metrics;
    if (left) {
      node.left = left;
      node.metrics = this._combineMetrics(left.metrics, node.metrics);
    }
    if (right) {
      node.right = right;
      node.metrics = this._combineMetrics(node.metrics, right.metrics);
    }
    return node;
  }

  /**
   * @param {!TreeNode<T>|udnefined} root
   */
  _setRoot(root) {
    this._root = root;
    if (root) {
      this._endLocation = {
        line: root.metrics.lineBreaks || 0,
        column: root.metrics.lastColumns,
        offset: root.metrics.length,
        x: root.metrics.lastWidth || root.metrics.lastColumns * this._defaultWidth,
        y: (root.metrics.lineBreaks || 0) * this._lineHeight
      };
    }
  }

  /**
   * @param {!Array<!{data: T, metrics: !Metrics}>} nodes
   * @return {!TreeNode<T>|undefined}
   */
  _build(nodes) {
    for (let node of nodes)
      node.h = random();
    if (!nodes.length)
      return;
    if (nodes.length === 1)
      return nodes[0];

    let stack = new Int32Array(nodes.length);
    let stackLength = 0;
    let p = new Int32Array(nodes.length);
    for (let i = 0; i < nodes.length; i++) {
      while (stackLength && nodes[stack[stackLength - 1]].h <= nodes[i].h)
        stackLength--;
      p[i] = stackLength ? stack[stackLength - 1] : -1;
      stack[stackLength++] = i;
    }
    stackLength = 0;

    let l = new Int32Array(nodes.length);
    l.fill(-1);
    let r = new Int32Array(nodes.length);
    r.fill(-1);
    let root = -1;
    for (let i = nodes.length - 1; i >= 0; i--) {
      while (stackLength && nodes[stack[stackLength - 1]].h <= nodes[i].h)
        stackLength--;
      let parent = stackLength ? stack[stackLength - 1] : -1;
      if (parent === -1 || (p[i] !== -1 && nodes[p[i]].h < nodes[parent].h))
        parent = p[i];
      if (parent === -1)
        root = i;
      else if (parent > i)
        l[parent] = i;
      else
        r[parent] = i;
      stack[stackLength++] = i;
    }
    stackLength = 0;

    /**
     * @param {number} i
     * @return {!TreeNode<T>}
     */
    let fill = i => {
      let left = l[i] === -1 ? undefined : fill(l[i]);
      let right = r[i] === -1 ? undefined : fill(r[i]);
      return this._setChildren(nodes[i], left, right, true);
    };
    return fill(root);
  }

  /**
   * Left part contains all nodes up to key.
   * If node contains a key location inside, it will be returned in right part,
   * unless |intersectionToLeft| is true.
   * @param {!TreeNode<T>|undefined} root
   * @param {!FindKey} key
   * @param {boolean} intersectionToLeft
   * @param {!Location=} current
   * @return {{left: !TreeNode<T>|undefined, right: !TreeNode<T>|undefined}}
   */
  _split(root, key, intersectionToLeft, current) {
    if (!root)
      return {};
    if (!current)
      current = origin;
    if (this._locationIsGreaterOrEqual(current, key))
      return {right: root};
    if (!this._locationIsGreater(this._advanceLocation(current, root.metrics), key))
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

    let next = root.left ? this._advanceLocation(current, root.left.metrics) : current;
    let rootToLeft = !this._locationIsGreaterOrEqual(next, key);
    next = this._advanceLocation(next, root.selfMetrics || root.metrics);
    if (!intersectionToLeft)
      rootToLeft = !this._locationIsGreater(next, key);
    if (rootToLeft) {
      let tmp = this._split(root.right, key, intersectionToLeft, next);
      return {left: this._setChildren(root, root.left, tmp.left), right: tmp.right};
    } else {
      let tmp = this._split(root.left, key, intersectionToLeft, current);
      return {left: tmp.left, right: this._setChildren(root, tmp.right, root.right)};
    }
  }

  /**
   * @param {!TreeNode<T>|undefined} left
   * @param {!TreeNode<T>|undefined} right
   * @return {!TreeNode<T>|undefined}
   */
  _merge(left, right) {
    if (!left)
      return right;
    if (!right)
      return left;
    if (left.h > right.h)
      return this._setChildren(left, left.left, this._merge(left.right, right));
    else
      return this._setChildren(right, this._merge(left, right.left), right.right);
  }

  /**
   * @param {!TreeNode<T>} node
   * @param {!FindKey} key
   * @return {{node: !TreeNode<T>, location: !Location}|undefined}
   */
  _findNode(node, key) {
    let current = origin;
    while (true) {
      if (node.left) {
        let next = this._advanceLocation(current, node.left.metrics);
        if (this._locationIsGreater(next, key)) {
          node = node.left;
          continue;
        }
        current = next;
      }
      let next = this._advanceLocation(current, node.selfMetrics || node.metrics);
      if (this._locationIsGreater(next, key))
        return {node, location: current};
      current = next;
      if (!node.right)
        return;
      node = node.right;
    }
  }

  /**
   * @param {!TreeNode<T>} node
   * @param {!Array<T>} list
   */
  _collect(node, list) {
    if (node.left)
      this._collect(node.left, list);
    list.push(node.data);
    if (node.right)
      this._collect(node.right, list);
  }
};

/**
 * @template T
 */
class TreeIterator {
  /**
   * @param {!TreeNode<T>} node
   * @param {!Array<!TreeNode<T>>} stack
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
    this.before = before;
    this.after = after;
    this.data = node.data;
  }

  /**
   * @return {!TreeIterator<T>}
   */
  clone() {
    return new TreeIterator(this._node, this._stack.slice(), this._from, this._to, this.before, this.after);
  }

  /**
   * @param {!TreeNode<T>} node
   * @param {number} offset
   */
  _init(node, offset) {
    this._stack = [];
    let current = 0;
    while (true) {
      this._stack.push(node);
      if (node.left) {
        let next = current + node.left.metrics.length;
        if (next > offset) {
          node = node.left;
          continue;
        }
        current = next;
      }
      let next = current + (node.selfMetrics || node.metrics).length;
      if (next > offset || !node.right) {
        this._node = node;
        this.data = node.data;
        this.before = current;
        this.after = next;
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
    if (this.after > this._to)
      return false;

    if (this._node.right) {
      let right = this._node.right;
      while (right.left) {
        this._stack.push(right);
        right = right.left;
      }
      this._stack.push(right);
      this.before = this.after;
      this.after += (right.selfMetrics || right.metrics).length;
      this._node = right;
      this.data = right.data;
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
    this.before = this.after;
    this.after += (next.selfMetrics || next.metrics).length;
    this._node = next;
    this.data = next.data;
    return true;
  }

  /**
   * @return {boolean}
   */
  prev() {
    if (this.before < this._from)
      return false;

    if (this._node.left) {
      let left = this._node.left;
      while (left.right) {
        this._stack.push(left);
        left = left.right;
      }
      this._stack.push(left);
      this.after = this.before;
      this.before -= (left.selfMetrics || left.metrics).length;
      this._node = left;
      this.data = left.data;
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
    this.after = this.before;
    this.before -= (next.selfMetrics || next.metrics).length;
    this._node = next;
    this.data = next.data;
    return true;
  }
};
