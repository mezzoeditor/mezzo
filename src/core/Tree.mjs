import { Random } from './Random.mjs';

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
 * Represents metrics of a text chunk. Note that it can be used
 * not only for text, but for any entities interleaving with text.
 *
 * @typedef {{
 *   length: number,
 *   lineBreaks: number|undefined,
 *   firstWidth: number,
 *   lastWidth: number,
 *   longestWidth: number,
 *   startNotIncluded: boolean|undefined,
 *   endIncluded: boolean|undefined,
 * }} TextMetrics;
 */

/** @type {!Location} */
const origin = { offset: 0, x: 0, y: 0 };
/** @type {!TextMetrics} */
const zeroMetrics = { length: 0, firstWidth: 0, lastWidth: 0, longestWidth: 0 };

/**
 * This is a generic metrics-aware immutable tree. Each node in the tree contains
 * data (of type T) and additive metrics (see TextMetrics definition).
 * The tree manages an ordered sequence of nodes and supports efficient
 * constructin, lookup by different metrics, merging and splitting.
 *
 * @template T
 */
export class Tree {
  /**
   * Constructs an empty tree.
   */
  constructor() {
    this._root = undefined;
    this._endLocation = origin;
  }

  /**
   * Constructs a tree from a sequence of |nodes|.
   * Takes ownership of |nodes|, which cannot be used afterwards.
   *
   * @param {!Array<!{data: T, metrics: !TextMetrics}>} nodes
   * @return {!Tree<T>}
   */
  static build(nodes) {
    for (let node of nodes)
      node.h = random();
    return wrap(build(nodes));
  }

  /**
   * Constructs a tree by merging two other trees in the order left -> right.
   * Note that |left| and |right| are not invalidated and can be used
   * afterwards.
   *
   * @param {!Tree<T>} left
   * @param {!Tree<T>} right
   * @return {!Tree<T>}
   */
  static merge(left, right) {
    return wrap(merge(left._root, right._root));
  }

  /**
   * Total metrics of all nodes combined.
   *
   * @return {!TextMetrics}
   */
  metrics() {
    return this._root ? this._root.metrics : zeroMetrics;
  }

  /**
   * Whether the tree has no nodes.
   *
   * @return {boolean}
   */
  empty() {
    return !this._root;
  }

  /**
   * Creates an iterator.
   *
   * @return {!TreeIterator<T>}
   */
  iterator() {
    return new TreeIterator(this._root);
  }

  /**
   * Splits the tree by two anchors, putting the nodes containing |from| and |to|
   * to the middle part.
   *
   * @param {!Anchor} from
   * @param {!Anchor} to
   * @return {!{left: !Tree<T>, right: !Tree<T>, middle: !Tree<T>}}
   */
  split(from, to) {
    let tmp = split(this._root, to, kSplitIntersectionToLeft, 0);
    let right = wrap(tmp.right);
    tmp = split(tmp.left, from, kSplitIntersectionToRight, 0);
    let left = wrap(tmp.left);
    let middle = wrap(tmp.right);
    return {left, right, middle};
  }

  /**
   * Splits the first node of the tree if any.
   *
   * @return {!{first: ?T, metrics: ?TextMetrics, rest: !Tree<T>}}
   */
  splitFirst() {
    let tmp = splitFirst(this._root);
    return {
      first: tmp.left ? tmp.left.data : null,
      metrics: tmp.left ? tmp.left.metrics : null,
      rest: wrap(tmp.right)
    };
  }

  /**
   * Splits the last node of the tree if any.
   *
   * @return {!{last: ?T, metrics: ?TextMetrics, rest: !Tree<T>}}
   */
  splitLast() {
    let tmp = splitLast(this._root);
    return {
      last: tmp.right ? tmp.right.data : null,
      metrics: tmp.right ? tmp.right.metrics : null,
      rest: wrap(tmp.left)
    };
  }

  /**
   * Returns every node's data.
   *
   * @return {!Array<!{data: T, metrics: !TextMetrics}>}
   */
  collect() {
    let list = [];
    if (this._root)
      collect(this._root, list);
    return list;
  }

  /**
   * Combines two additive text metrics in the left->right order.
   *
   * @param {!TextMetrics} left
   * @param {!TextMetrics} right
   * @return {!TextMetrics}
   */
  static combineMetrics(left, right) {
    if (left.endIncluded && !right.startNotIncluded)
      throw new Error('Metrics have intersecting anchors');
    let result = {
      longestWidth: Math.max(Math.max(left.longestWidth, left.lastWidth + right.firstWidth), right.longestWidth),
      firstWidth: left.firstWidth + (left.lineBreaks ? 0 : right.firstWidth),
      lastWidth: right.lastWidth + (right.lineBreaks ? 0 : left.lastWidth),
      length: left.length + right.length
    }
    if (left.lineBreaks || right.lineBreaks)
      result.lineBreaks = (left.lineBreaks || 0) + (right.lineBreaks || 0);
    if (left.startNotIncluded)
      result.startNotIncluded = true;
    if (right.endIncluded)
      result.endIncluded = true;
    return result;
  }
};

/**
 * Iterator points to a specific node of the Tree, position before the first node
 * or position after the last node. It provides current node's |metrics| and |data|,
 * as well as locations |before| and |after| the node.
 *
 * When pointing after the last node, everything except |before| is undefined.
 * When pointing before the first node, everything except |after| is undefined.
 *
 * @template T
 */
class TreeIterator {
  /**
   * @param {!TreeNode<T>} root
   */
  constructor(root) {
    this._root = root;
    /** @type {!Location|undefined} */
    this.before = undefined;
    /** @type {!Location|undefined} */
    this.after = undefined;
    /** @type {!TextMetrics|undefined} */
    this.metrics = undefined;
    /** @type {T|undefined} */
    this.data = undefined;
    /** !Array<!{node: !TreeNode<T>, location: !Location}> */
    this._stack = null;
  }

  /**
   * @return {!TreeIterator<T>}
   */
  clone() {
    let iterator = new TreeIterator(this._root);
    iterator.before = this.before;
    iterator.after = this.after;
    iterator.metrics = this.metrics;
    iterator.data = this.data;
    iterator._stack = this._stack.slice();
    return iterator;
  }

  /**
   * Moves iterator to a first node which covers |anchor|, or
   * to the position after the last node, if |anchor| is the last anchor.
   *
   * In |strict| mode, does not modify iterator when |anchor| is out of bounds
   * and returns null.
   * In non-|strict| mode, clamps |anchor| to bounds and returns the clamped anchor.
   *
   * @param {!Anchor} anchor
   * @param {boolean=} strict
   * @return {?number}
   */
  locateByOffset(anchor, strict) {
    const min = this._root && this._root.startNotIncluded ? 0.5 : 0;
    if (anchor < min) {
      if (strict)
        return null;
      anchor = min;
    }
    let max = 0;
    if (this._root)
      max = this._root.metrics.length + (this._root.metrics.endIncluded ? 0.5 : 0);
    if (anchor > max) {
      if (strict)
        return null;
      anchor = max;
      this._locate({anchor});
      return anchor;
    }
    this._locate({anchor: anchor - 0.5});
    if (this.metrics) {
      const after = this.after.offset + (this.metrics.endIncluded ? 0.5 : 0);
      const before = this.before.offset + (this.metrics.startNotIncluded ? 0.5 : 0);
      if (after <= anchor && before < anchor)
        this.next();
    }
    return anchor;
  }

  /**
   * Moves iterator to a first node which covers |point|, or
   * to the position after the last node, if |point| is the last point.
   *
   * In |strict| mode, does not modify iterator when |point| is out of bounds
   * and returns false.
   * In non-|strict| mode, clamps |point| to bounds and returns the clamped point.
   *
   * @param {!Point} point
   * @param {boolean=} strict
   * @return {?Point}
   */
  locateByPoint(point, strict) {
    if (point.y < 0) {
      if (strict)
        return null;
      point = {x: 0, y: 0};
    }
    if (point.x < 0) {
      if (strict)
        return null;
      point = {x: 0, y: point.y};
    }
    let maxy = this._root ? (this._root.metrics.lineBreaks || 0) : 0;
    let maxx = this._root ? this._root.metrics.lastWidth : 0;
    if (point.y >= maxy + 1 || (point.y >= maxy && point.x > maxx)) {
      if (strict)
        return null;
      point.x = maxx;
      point.y = maxy;
    }
    this._locate({x: point.x, y: point.y});
    return point;
  }

  /**
   * @param {!FindKey} key
   * @return {boolean}
   */
  _locate(key) {
    if (!this._root)
      return;
    this._stack = [];
    /** @type {!FindLocation} */
    let location = {anchor: 0, x: 0, y: 0};
    let node = this._root;
    while (true) {
      this._stack.push({node, location});
      if (node.left) {
        let next = advanceFindLocation(location, node.left.metrics);
        if (findLocationIsGreater(next, key)) {
          node = node.left;
          continue;
        }
        location = next;
      }
      let next = advanceFindLocation(location, node.selfMetrics || node.metrics);
      if (findLocationIsGreater(next, key)) {
        this.metrics = node.selfMetrics || node.metrics;
        this.data = node.data;
        this.before = findLocationToLocation(location);
        this.after = findLocationToLocation(next);
        return;
      }
      if (!node.right) {
        this.metrics = undefined;
        this.data = undefined;
        this.before = findLocationToLocation(next);
        this.after = undefined;
        return;
      }
      location = next;
      node = node.right;
    }
  }

  /**
   * Moves iterator to the next node or to the position after the last node.
   * Returns whether new position does point to a node.
   *
   * @return {boolean}
   */
  next() {
    if (!this._root || this.after === undefined)
      return false;

    let {node, location} = this._stack[this._stack.length - 1];
    if (this.before === undefined) {
      // |node| is a first node already.
    } else if (node.right) {
      if (node.left)
        location = advanceFindLocation(location, node.left.metrics);
      location = advanceFindLocation(location, node.selfMetrics || node.metrics);
      node = node.right;
      while (true) {
        this._stack.push({node, location});
        if (!node.left)
          break;
        node = node.left;
      }
    } else {
      let len = this._stack.length;
      while (len > 1 && this._stack[len - 2].node.right === this._stack[len - 1].node)
        len--;
      if (len === 1) {
        this.metrics = undefined;
        this.data = undefined;
        this.before = this.after;
        this.after = undefined;
        return false;
      }
      node = this._stack[len - 2].node;
      location = this._stack[len - 2].location;
      this._stack.length = len - 1;
    }

    if (node.left)
      location = advanceFindLocation(location, node.left.metrics);
    this.metrics = node.selfMetrics || node.metrics;
    this.data = node.data;
    this.before = this.after;
    this.after = findLocationToLocation(advanceFindLocation(location, this.metrics));
    return true;
  }

  /**
   * Moves iterator to the next node or to the position before the first node.
   * Returns whether new position does point to a node.
   *
   * @return {boolean}
   */
  prev() {
    if (!this._root || this.before === undefined)
      return false;

    let {node, location} = this._stack[this._stack.length - 1];
    if (this.after === undefined) {
      // |node| is a last node already.
    } else if (node.left) {
      node = node.left;
      while (true) {
        this._stack.push({node, location});
        if (!node.right)
          break;
        if (node.left)
          location = advanceFindLocation(location, node.left.metrics);
        location = advanceFindLocation(location, node.selfMetrics || node.metrics);
        node = node.right;
      }
    } else {
      let len = this._stack.length;
      while (len > 1 && this._stack[len - 2].node.left === this._stack[len - 1].node)
        len--;
      if (len === 1) {
        this.metrics = undefined;
        this.data = undefined;
        this.after = this.before;
        this.before = undefined;
        return false;
      }
      node = this._stack[len - 2].node;
      location = this._stack[len - 2].location;
      this._stack.length = len - 1;
    }

    if (node.left)
      location = advanceFindLocation(location, node.left.metrics);
    this.metrics = node.selfMetrics || node.metrics;
    this.data = node.data;
    this.after = this.before;
    this.before = findLocationToLocation(location);
    return true;
  }
};

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
 *   anchor: Anchor|undefined,
 *   x: number|undefined,
 *   y: number|undefined,
 * }} FindKey;
 */

/**
 * @typedef {{
 *   anchor: Anchor,
 *   x: number,
 *   y: number,
 * }} FindLocation;
 */

const kClone = true;
const kNoClone = false;

const kSplitIntersectionToLeft = true;
const kSplitIntersectionToRight = false;

/**
 * @param {!FindLocation} location
 * @return {!Location}
 */
function findLocationToLocation(location) {
  return {
    offset: Math.floor(location.anchor),
    y: location.y,
    x: location.x
  };
}

/**
 * @param {!FindLocation} location
 * @param {!TextMetrics} metrics
 * @return {!FindLocation}
 */
function advanceFindLocation(location, metrics) {
  return {
    anchor: Math.floor(location.anchor) + metrics.length + (metrics.endIncluded ? 0.5 : 0),
    y: location.y + (metrics.lineBreaks || 0),
    x: metrics.lastWidth + (metrics.lineBreaks ? 0 : location.x)
  };
}

/**
 * @param {!FindLocation} location
 * @param {!FindKey} key
 * @return {boolean}
 */
function findLocationIsGreater(location, key) {
  if (key.anchor !== undefined)
    return location.anchor > key.anchor;
  return location.y > key.y || (location.y + 1 > key.y && location.x > key.x);
}

/**
 * @param {!TreeNode<T>} parent
 * @param {!TreeNode<T>|undefined} left
 * @param {!TreeNode<T>|undefined} right
 * @param {boolean} clone
 * @return {!TreeNode<T>}
 */
function setChildren(parent, left, right, clone) {
  let node = clone === kClone ? {
    data: parent.data,
    h: parent.h,
    metrics: parent.selfMetrics || parent.metrics
  } : parent;
  if (!node.selfMetrics && (left || right))
    node.selfMetrics = node.metrics;
  if (left) {
    node.left = left;
    node.metrics = Tree.combineMetrics(left.metrics, node.metrics);
  }
  if (right) {
    node.right = right;
    node.metrics = Tree.combineMetrics(node.metrics, right.metrics);
  }
  return node;
}

/**
 * @param {!TreeNode<T>|undefined} root
 * @return {!Tree<T>}
 */
function wrap(root) {
  let tree = new Tree();
  tree._root = root;
  if (root) {
    tree._endLocation = {
      offset: root.metrics.length,
      x: root.metrics.lastWidth,
      y: root.metrics.lineBreaks || 0
    };
  }
  return tree;
}

/**
 * @param {!Array<!{data: T, metrics: !TextMetrics}>} nodes
 * @return {!TreeNode<T>|undefined}
 */
function build(nodes) {
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
    return setChildren(nodes[i], left, right, kNoClone);
  };
  return fill(root);
}

/**
 * Left part contains all nodes up to key.
 * If node contains a key location inside, it will be returned in right part,
 * unless |intersectionToLeft| is true.
 *
 * @param {!TreeNode<T>|undefined} root
 * @param {!Anchor} anchor
 * @param {boolean} intersectionToLeft
 * @param {number} current
 * @return {{left: !TreeNode<T>|undefined, right: !TreeNode<T>|undefined}}
 */
function split(root, anchor, intersectionToLeft, current) {
  if (!root)
    return {};

  let before = current + (root.left ? root.left.metrics.length : 0);
  let after = before + (root.selfMetrics || root.metrics).length;
  if ((root.selfMetrics || root.metrics).startNotIncluded)
    before += 0.5;
  if ((root.selfMetrics || root.metrics).endIncluded)
    after += 0.5;
  let rootToLeft = before >= anchor ? false :
      (after <= anchor ? true : intersectionToLeft === kSplitIntersectionToLeft);
  if (rootToLeft) {
    let tmp = split(root.right, anchor, intersectionToLeft, Math.floor(after));
    return {left: setChildren(root, root.left, tmp.left, kClone), right: tmp.right};
  } else {
    let tmp = split(root.left, anchor, intersectionToLeft, current);
    return {left: tmp.left, right: setChildren(root, tmp.right, root.right, kClone)};
  }
}

/**
 * @param {!TreeNode<T>|undefined} root
 * @return {{left: !TreeNode<T>|undefined, right: !TreeNode<T>|undefined}}
 */
function splitFirst(root) {
  if (!root)
    return {};
  if (root.left) {
    let tmp = splitFirst(root.left);
    return {left: tmp.left, right: setChildren(root, tmp.right, root.right, kClone)};
  } else {
    return {left: setChildren(root, undefined, undefined, kClone), right: root.right};
  }
}

/**
 * @param {!TreeNode<T>|undefined} root
 * @return {{left: !TreeNode<T>|undefined, right: !TreeNode<T>|undefined}}
 */
function splitLast(root) {
  if (!root)
    return {};
  if (root.right) {
    let tmp = splitLast(root.right);
    return {left: setChildren(root, root.left, tmp.left, kClone), right: tmp.right};
  } else {
    return {left: root.left, right: setChildren(root, undefined, undefined, kClone)};
  }
}

/**
 * @param {!TreeNode<T>|undefined} left
 * @param {!TreeNode<T>|undefined} right
 * @return {!TreeNode<T>|undefined}
 */
function merge(left, right) {
  if (!left)
    return right;
  if (!right)
    return left;
  if (left.h > right.h)
    return setChildren(left, left.left, merge(left.right, right), kClone);
  else
    return setChildren(right, merge(left, right.left), right.right, kClone);
}

/**
 * @param {!TreeNode<T>} node
 * @param {!Array<!{data: T, metrics: !TextMetrics}>} list
 */
function collect(node, list) {
  if (node.left)
    collect(node.left, list);
  list.push({data: node.data, metrics: node.selfMetrics || node.metrics});
  if (node.right)
    collect(node.right, list);
}

Tree.test = {};

/**
 * @param {!Array<!{data: T, metrics: !TextMetrics, h: number}>} nodes
 * @return {!Tree<T>}
 */
Tree.test.build = nodes => wrap(build(nodes));
