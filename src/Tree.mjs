import { Random } from "./Types.mjs";

/**
 * @param {function(!Object):!Object} initFrom
 * Inits any auxilary data for the node from another one,
 * not accounting for any subtrees.
 *
 * @param {function(!Object):!Metrics} selfMetrics
 * Returns metrics for the node, not accounting for any subtrees.
 *
 * @param {boolean=} supportLines
 * Whether to support line+column addressing.
 *
 * @param {function(!Object, !Object|undefined, !Object|undefined)|undefined} updateData
 * Updates auxilary data for node from it's left and right
 * subtree (possibly missing).
 */
export let Tree = function(initFrom, selfMetrics, supportLines, updateData) {
  let random = Random(42);

  /**
   * @typedef {{
   *   length: number,
   *
   *   lines: number|undefined,
   *   first: number|undefined,
   *   last: number|undefined,
   *   longest: number|undefined
   * }} Metrics;
   */

  /**
   * @typedef {{
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
   * @param {!Position} position
   * @param {!Metrics} metrics
   * @return {!Position}
   */
  let advance = function(position, metrics) {
    let result = { offset: position.offset + metrics.length };
    if (supportLines) {
      result.line = position.line + (metrics.lines || 0);
      result.column = metrics.last + (metrics.lines ? 0 : position.column);
    }
    return result;
  };


  /**
   * @param {!Position} position
   * @param {!Position} key
   */
  let greater = function(position, key) {
    if (key.offset !== undefined)
      return position.offset > key.offset;
    if (!supportLines)
      throw 'Lines are not supported';
    return position.line > key.line || (position.line === key.line && position.column > key.column);
  };


  /**
   * @param {!Position} position
   * @param {!Position} key
   */
  let greaterEqual = function(position, key) {
    if (key.offset !== undefined)
      return position.offset >= key.offset;
    if (!supportLines)
      throw 'Lines are not supported';
    return position.line > key.line || (position.line === key.line && position.column >= key.column);
  };


  /**
   * @param {!TreeNode} node
   * @param {!TreeNode|undefined} left
   * @param {!TreeNode|undefined} right
   * @return {!TreeNode}
   */
  let setChildren = function(node, left, right) {
    if (left || right) {
      node.selfMetrics = { length: node.metrics.length };
      if (node.metrics.last !== undefined)
        node.selfMetrics.last = node.metrics.last;
      if (node.metrics.first !== undefined)
        node.selfMetrics.first = node.metrics.first;
      if (node.metrics.longest !== undefined)
        node.selfMetrics.longest = node.metrics.longest;
      if (node.metrics.lines !== undefined)
        node.selfMetrics.lines = node.metrics.lines;
    }
    if (left) {
      node.left = left;
      if (supportLines) {
        let longest = Math.max(left.metrics.longest, left.metrics.last + node.metrics.first);
        node.metrics.longest = Math.max(node.metrics.longest, longest);
        node.metrics.first = left.metrics.first + (left.metrics.lines ? 0 : node.metrics.first);
        node.metrics.last = node.metrics.last + (node.metrics.lines ? 0 : left.metrics.last);
      }
      node.metrics.length += left.metrics.length;
      if (left.metrics.lines)
        node.metrics.lines = left.metrics.lines + (node.metrics.lines || 0);
    }
    if (right) {
      node.right = right;
      if (supportLines) {
        let longest = Math.max(right.metrics.longest, node.metrics.last + right.metrics.first);
        node.metrics.longest = Math.max(node.metrics.longest, longest);
        node.metrics.first = node.metrics.first + (node.metrics.lines ? 0 : right.metrics.first);
        node.metrics.last = right.metrics.last + (right.metrics.lines ? 0 : node.metrics.last);
      }
      node.metrics.length += right.metrics.length;
      if (right.metrics.lines)
        node.metrics.lines = right.metrics.lines + (node.metrics.lines || 0);
    }
    if (updateData)
      updateData(node, left, right);
    return node;
  };


  /**
   * @param {!TreeNode} node
   * @return {!TreeNode}
   */
  let clone = function(node) {
    let result = initFrom(node);
    result.metrics = selfMetrics(result);
    result.h = node.h;
    return result;
  };


  /**
   * @param {!Object} node
   * @return {!TreeNode}
   */
  let wrap = function(node) {
    node.h = random();
    node.metrics = selfMetrics(node);
    return node;
  };


  /**
   * @param {!TreeNode} node
   * @return {!Metrics}
   */
  let metrics = function(node) {
    return node.metrics;
  };


  /** @type {!Position} */
  let origin = { offset: 0, line: 0, column: 0 };


  /**
   * @param {!Array<!TreeNode>} nodes
   * @return {!TreeNode}
   */
  let build = function(nodes) {
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

    function fill(i) {
      let left = l[i] === -1 ? undefined : fill(l[i]);
      let right = r[i] === -1 ? undefined : fill(r[i]);
      return setChildren(nodes[i], left, right);
    }
    return fill(root);
  };


  /**
   * @param {!TreeNode|undefined} root
   * @param {!Position} current
   * @param {!Position} key
   * @param {boolean=} intersectionToLeft
   * @return {{left: !TreeNode|undefined, right: !TreeNode|undefined}}
   */
  let innerSplit = function(root, current, key, intersectionToLeft) {
    if (!root)
      return {};
    if (greaterEqual(current, key))
      return {right: root};
    if (!greater(advance(current, root.metrics), key))
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

    let next = root.left ? advance(current, root.left.metrics) : current;
    let rootToLeft = !greaterEqual(next, key);
    next = advance(next, root.selfMetrics || root.metrics);
    if (!intersectionToLeft)
      rootToLeft = !greater(next, key);
    if (rootToLeft) {
      let tmp = innerSplit(root.right, next, key, intersectionToLeft);
      return {left: setChildren(clone(root), root.left, tmp.left), right: tmp.right};
    } else {
      let tmp = innerSplit(root.left, current, key, intersectionToLeft);
      return {left: tmp.left, right: setChildren(clone(root), tmp.right, root.right)};
    }
  };


  /**
   * Left part contains all nodes up to key.
   * If node contains a key position inside, it will be returned in right part,
   * unless |intersectionToLeft| is true.
   * @param {!TreeNode|undefined} root
   * @param {!Position} key
   * @param {boolean=} intersectionToLeft
   * @return {{left: !TreeNode|undefined, right: !TreeNode|undefined}}
   */
  let split = function(root, key, intersectionToLeft) {
    return innerSplit(root, origin, key, intersectionToLeft);
  };


  /**
   * @param {!TreeNode|undefined} left
   * @param {!TreeNode|undefined} right
   * @return {!TreeNode|undefined}
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


  /**
   * @param {!TreeNode} node
   * @param {!Position} key
   * @return {{node: !TreeNode, position: !Position}|undefined}
   */
  let find = function(node, key) {
    // TODO: maybe implement find with innerVisit for additional testing?
    let current = origin;
    while (true) {
      if (node.left) {
        let next = advance(current, node.left.metrics);
        if (greater(next, key)) {
          node = node.left;
          continue;
        }
        current = next;
      }
      let next = advance(current, node.selfMetrics || node.metrics);
      if (greater(next, key))
        return {node, position: current};
      current = next;
      if (!node.right)
        return;
      node = node.right;
    }
  };


  /**
   * @param {!TreeNode} node
   * @param {!Position} current
   * @param {!Position} from
   * @param {!Position} to
   * @param {function(!TreeNode, !Position, !Position)} visitor
   */
  let innerVisit = function(node, current, from, to, visitor) {
    if (node.left) {
      let next = advance(current, node.left.metrics);
      if (greaterEqual(next, from))
        innerVisit(node.left, current, from, to, visitor);
      current = next;
    }

    let next = advance(current, node.selfMetrics || node.metrics);
    if (!greaterEqual(current, to) && greaterEqual(next, from))
      visitor(node, current, next);
    current = next;

    if (node.right && !greaterEqual(current, to))
      innerVisit(node.right, current, from, to, visitor);
  };


  /**
   * @param {!TreeNode} node
   * @param {!Position} from
   * @param {!Position} to
   * @param {function(!TreeNode, !Position, !Position)} visitor
   */
  let visit = function(node, from, to, visitor) {
    innerVisit(node, origin, from, to, visitor);
  };


  return { wrap, build, split, merge, find, visit, metrics };
};
