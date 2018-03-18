import { Random } from './Random.mjs';
import { Metrics } from './Metrics.mjs';

let random = Random(42);

/**
 * @typedef {number} Offset;
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
 *   metrics: !TextMetrics,
 *   selfMetrics: !TextMetrics|undefined,
 *   left: !TreeNode<T>|undefined,
 *   right: !TreeNode<T>|undefined,
 *   h: number
 * }} TreeNode;
 */

/**
 * @typedef {{
 *   offset: number|undefined,
 *   x: number|undefined,
 *   y: number|undefined,
 * }} FindKey;
 */

const kClone = true;
const kNoClone = false;

const kSplitIntersectionToLeft = true;
const kSplitIntersectionToRight = false;

/**
 * This is a generic metrics-aware immutable tree. Each node in the tree contains
 * data (of type T) and additive metrics (see TextMetrics definition).
 * The tree manages an ordered sequence of nodes and supports efficient
 * constructin, lookup by different metrics, merging and splitting.
 *
 * Tree needs |lineHeight| and |defaultWidth| values to work with metrics:
 * - lineHeight defines conversion between lines and y-coordinate;
 * - defaultWidth defines conversion between columns and missing x-coordinate;
 *   useful for monospace text to save memory.
 *
 * @template T
 */
export class Tree {
  /**
   * Constructs an empty tree.
   * @param {number} lineHeight
   * @param {number} defaultWidth
   */
  constructor(lineHeight, defaultWidth) {
    this._lineHeight = lineHeight;
    this._defaultWidth = defaultWidth;
    this._root = undefined;
    this._endLocation = Metrics.origin;
  }

  /**
   * Constructs a tree from a sequence of |nodes|. Additionally, can
   * merge this tree with |left| and/or |right| trees from the corresponding
   * side.
   *
   * Note that |left| and |right| are not invalidated and can be used
   * afterwards. In contrary, this takes ownership of |nodes|,
   * which cannot be used afterwards.
   *
   * @param {!Array<!{data: T, metrics: !TextMetrics}>} nodes
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
   * Total metrics of all nodes combined.
   * @return {!TextMetrics}
   */
  metrics() {
    return this._root ? this._root.metrics : Metrics.zero;
  }

  /**
   * The location of the last node's end.
   * @return {!Location}
   */
  endLocation() {
    return this._endLocation;
  }

  /**
   * Creates an iterator starting at |offset|, constrained to the range
   * [from, to). All numbers are offsets (as opposite to positions or points).
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
   * Returns a node containing |offset| (start included, end excluded).
   * Returns it's data and exact location of the node's start.
   * Returns nulls if the offset is out of range.
   *
   * When the offset is at the end of the tree, does not return |data|, as
   * this offset does not effectively belong to any node.
   *
   * @param {number} offset
   * @return {!{data: ?T, location: ?Location}}
   */
  findByOffset(offset) {
    if (offset === this._endLocation.offset)
      return {data: null, location: this._endLocation};
    if (!this._root || offset < 0 || offset > this._root.metrics.length)
      return {data: null, location: null};
    let found = this._findNode(this._root, {offset});
    if (!found)
      throw 'Inconsistency';
    return {data: found.node.data, location: found.location};
  }

  /**
   * Returns a node containing |point| (start included, end excluded).
   * Returns it's data and exact location of the node's start.
   *
   * If |strict| is false, |point| is clamped to nearest point which
   * belongs to the tree. This point is returned as |clampedPoint|.
   *
   * When the point is at the end of the tree, does not return |data|, as
   * this point does not effectively belong to any node.
   *
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
   * Splits the tree by two offsets, putting the nodes containing |from| and |to|
   * to the middle part.
   *
   * @param {number} from
   * @param {number} to
   * @return {!{left: !Tree<T>, right: !Tree<T>, middle: !Tree<T>}}
   */
  split(from, to) {
    let tmp = this._split(this._root, to, kSplitIntersectionToLeft);
    let right = this._wrap(tmp.right);
    tmp = this._split(tmp.left, from, kSplitIntersectionToRight);
    let left = this._wrap(tmp.left);
    let middle = this._wrap(tmp.right);
    return {left, right, middle};
  }

  /**
   * Splits the first node of the tree if any.
   * @return {!{first: ?T, rest: !Tree<T>}}
   */
  splitFirst() {
    let tmp = this._splitFirst(this._root);
    return {first: tmp.left ? tmp.left.data : null, rest: this._wrap(tmp.right)};
  }

  /**
   * Splits the last node of the tree if any.
   * @return {!{last: ?T, rest: !Tree<T>}}
   */
  splitLast() {
    let tmp = this._splitLast(this._root);
    return {last: tmp.right ? tmp.right.data : null, rest: this._wrap(tmp.left)};
  }

  /**
   * Returns every node's data.
   * @return {!Array<T>}
   */
  collect() {
    let list = [];
    if (this._root)
      this._collect(this._root, list);
    return list;
  }

  /**
   * @param {!Location} location
   * @param {!FindKey} key
   * @return {boolean}
   */
  _locationIsGreater(location, key) {
    if (key.offset !== undefined)
      return location.offset > key.offset;
    return location.y > key.y || (location.y + this._lineHeight > key.y && location.x > key.x);
  }

  /**
   * @param {!Location} location
   * @param {!TextMetrics} metrics
   * @return {!Location}
   */
  _advanceLocation(location, metrics) {
    let result = {
      offset: location.offset + metrics.length,
      y: location.y + (metrics.lineBreaks || 0) * this._lineHeight,
      x: metrics.lastWidth + (metrics.lineBreaks ? 0 : location.x),
    };
    return result;
  }

  /**
   * @param {!TreeNode<T>} parent
   * @param {!TreeNode<T>|undefined} left
   * @param {!TreeNode<T>|undefined} right
   * @param {boolean} clone
   * @return {!TreeNode<T>}
   */
  _setChildren(parent, left, right, clone) {
    let node = clone === kClone ? {
      data: parent.data,
      h: parent.h,
      metrics: parent.selfMetrics || parent.metrics
    } : parent;
    if (!node.selfMetrics && (left || right))
      node.selfMetrics = node.metrics;
    if (left) {
      node.left = left;
      node.metrics = Metrics.combine(left.metrics, node.metrics);
    }
    if (right) {
      node.right = right;
      node.metrics = Metrics.combine(node.metrics, right.metrics);
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
        offset: root.metrics.length,
        x: root.metrics.lastWidth,
        y: (root.metrics.lineBreaks || 0) * this._lineHeight
      };
    }
  }

  /**
   * @param {!Array<!{data: T, metrics: !TextMetrics}>} nodes
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
      return this._setChildren(nodes[i], left, right, kNoClone);
    };
    return fill(root);
  }

  /**
   * Left part contains all nodes up to key.
   * If node contains a key location inside, it will be returned in right part,
   * unless |intersectionToLeft| is true.
   * @param {!TreeNode<T>|undefined} root
   * @param {number} offset
   * @param {boolean} intersectionToLeft
   * @param {!Location=} current
   * @return {{left: !TreeNode<T>|undefined, right: !TreeNode<T>|undefined}}
   */
  _split(root, offset, intersectionToLeft, current) {
    if (!root)
      return {};
    if (!current)
      current = Metrics.origin;
    if (current.offset >= offset)
      return {right: root};
    if (current.offset + root.metrics.length <= offset)
      return {left: root};

    // intersection to left:
    //   offset a b  ->  root to right
    //   a offset b  ->  root to left
    //   a b offset  ->  root to left
    //   rootToLeft = (offset > a) == (a < offset) == !(a >= offset)

    // intersection to right:
    //   offset a b  ->  root to right
    //   a offset b  ->  root to right
    //   a b offset  ->  root to left
    //   rootToLeft = (offset >= b) == (b <= offset) == !(b > offset)

    let next = root.left ? this._advanceLocation(current, root.left.metrics) : current;
    let rootToLeft = next.offset < offset;
    next = this._advanceLocation(next, root.selfMetrics || root.metrics);
    if (intersectionToLeft === kSplitIntersectionToRight)
      rootToLeft = next.offset <= offset;
    if (rootToLeft) {
      let tmp = this._split(root.right, offset, intersectionToLeft, next);
      return {left: this._setChildren(root, root.left, tmp.left, kClone), right: tmp.right};
    } else {
      let tmp = this._split(root.left, offset, intersectionToLeft, current);
      return {left: tmp.left, right: this._setChildren(root, tmp.right, root.right, kClone)};
    }
  }

  /**
   * @param {!TreeNode<T>|undefined} root
   * @return {{left: !TreeNode<T>|undefined, right: !TreeNode<T>|undefined}}
   */
  _splitFirst(root) {
    if (!root)
      return {};
    if (root.left) {
      let tmp = this._splitFirst(root.left);
      return {left: tmp.left, right: this._setChildren(root, tmp.right, root.right, kClone)};
    } else {
      return {left: this._setChildren(root, undefined, undefined, kClone), right: root.right};
    }
  }

  /**
   * @param {!TreeNode<T>|undefined} root
   * @return {{left: !TreeNode<T>|undefined, right: !TreeNode<T>|undefined}}
   */
  _splitLast(root) {
    if (!root)
      return {};
    if (root.right) {
      let tmp = this._splitLast(root.right);
      return {left: this._setChildren(root, root.left, tmp.left, kClone), right: tmp.right};
    } else {
      return {left: root.left, right: this._setChildren(root, undefined, undefined, kClone)};
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
      return this._setChildren(left, left.left, this._merge(left.right, right), kClone);
    else
      return this._setChildren(right, this._merge(left, right.left), right.right, kClone);
  }

  /**
   * @param {!TreeNode<T>} node
   * @param {!FindKey} key
   * @return {{node: !TreeNode<T>, location: !Location}|undefined}
   */
  _findNode(node, key) {
    let current = Metrics.origin;
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

  /**
   * @param {!TreeNode<T>|undefined} root
   * @return {!Tree<T>}
   */
  _wrap(root) {
    let tree = new Tree(this._lineHeight, this._defaultWidth);
    tree._setRoot(root);
    return tree;
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
