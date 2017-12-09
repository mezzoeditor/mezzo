import { Random } from "./Types.mjs";

export let Tree = function(initFrom, combineTo, selfMetrics) {
  let random = Random(42);

  /**
   * @typedef {{
   *   lines: number,
   *   chars: number,
   *   first: number,
   *   last: number
   * }} Metrics;
   */

  /**
   * @typedef {{
   *   metrics: !Metrics,
   *   left: !TreeNode|undefined,
   *   right: !TreeNode|undefined,
   *   h: number
   * }} TreeNode;
   */

  /**
   * @typedef {{
   *   char: number,
   *   line: number,
   *   column: number
   * }} Position;
   */

  /**
   * @param {!TreeNode} node
   * @param {!TreeNode|undefined} left
   * @param {!TreeNode|undefined} right
   * @return {!TreeNode}
   */
  let setChildren = function(node, left, right) {
    if (left) {
      node.left = left;
      node.metrics.first = left.metrics.first + (left.metrics.lines ? 0 : node.metrics.first);
      node.metrics.last = node.metrics.last + (node.metrics.lines ? 0 : left.metrics.last);
      node.metrics.chars += left.metrics.chars;
      node.metrics.lines += left.metrics.lines;
      combineTo(node.left, node);
    }
    if (right) {
      node.right = right;
      node.metrics.first = node.metrics.first + (node.metrics.lines ? 0 : right.metrics.first);
      node.metrics.last = right.metrics.last + (right.metrics.lines ? 0 : node.metrics.last);
      node.metrics.chars += right.metrics.chars;
      node.metrics.lines += right.metrics.lines;
      combineTo(node.right, node);
    }
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
   * @param {!Array<!TreeNode>} nodes
   * @return {!Array<!TreeNode>}
   */
  let build = function(nodes) {
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
   * Left part contains all nodes up to (line - 1).
   * If node spans a split position, it will be returned in right part.
   * @param {!TreeNode|undefined} root
   * @param {number} line
   * @return {{left: !TreeNode|undefined, right: !TreeNode|undefined}}
   */
  let splitLine = function(root, line) {
    if (!root)
      return {};
    if (line >= root.metrics.lines)
      return {left: root};
    if (line < 0)
      return {right: root};

    let leftLines = root.left ? root.left.metrics.lines : 0;
    if (leftLines < line) {
      let tmp = splitLine(root.right, line - leftLines - selfMetrics(root).lines);
      return {left: setChildren(clone(root), root.left, tmp.left), right: tmp.right};
    } else {
      let tmp = splitLine(root.left, line);
      return {left: tmp.left, right: setChildren(clone(root), tmp.right, root.right)};
    }
  };


  /**
   * Left part contains all nodes up to (char - 1).
   * If node spans a split position, it will be returned in right part.
   * @param {!TreeNode|undefined} root
   * @param {number} char
   * @return {{left: !TreeNode|undefined, right: !TreeNode|undefined}}
   */
  let splitChar = function(root, char) {
    if (!root)
      return {};
    if (char >= root.metrics.chars)
      return {left: root};
    if (char < 0)
      return {right: root};

    let leftChars = root.left ? root.left.metrics.chars : 0;
    if (leftChars < char) {
      let tmp = splitChar(root.right, char - leftChars - selfMetrics(root).chars);
      return {left: setChildren(clone(root), root.left, tmp.left), right: tmp.right};
    } else {
      let tmp = splitChar(root.left, char);
      return {left: tmp.left, right: setChildren(clone(root), tmp.right, root.right)};
    }
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
   * @param {!Position} position
   * @param {!Metrics} metrics
   */
  let updatePosition = function(position, metrics) {
    position.column = metrics.last + (metrics.lines ? 0 : position.column);
    position.line += metrics.lines;
    position.char += metrics.chars;
  };


  /**
   * @param {number} line
   * @return {{node: !TreeNode, position: !Position}|undefined}
   */
  let findLine = function(root, line) {
    let position = { char: 0, line: 0, column: 0 };
    while (true) {
      if (root.left) {
        let left = root.left.metrics;
        if (left.lines > line) {
          root = root.left;
          continue;
        }
        line -= left.lines;
        updatePosition(position, left);
      }
      let self = selfMetrics(root);
      if (self.lines > line)
        return {node: root, position};
      line -= self.lines;
      updatePosition(position, self);
      if (!root.right)
        return;
      root = root.right;
    }
  };


  /**
   * @param {number} char
   * @return {{node: !TreeNode, position: !Position}|undefined}
   */
  let findChar = function(root, char) {
    let position = { char: 0, line: 0, column: 0 };
    while (true) {
      if (root.left) {
        let left = root.left.metrics;
        if (left.chars > char) {
          root = root.left;
          continue;
        }
        char -= left.chars;
        updatePosition(position, left);
      }
      let self = selfMetrics(root);
      if (self.chars > char)
        return {node: root, position};
      char -= self.chars;
      updatePosition(position, self);
      if (!root.right)
        return;
      root = root.right;
    }
  };


  /**
   * @param {!TreeNode} node
   * @param {function(!TreeNode)} visitor
   */
  let visit = function(node, visitor) {
    if (node.left)
      visit(node.left);
    visitor(node);
    if (node.right)
      visit(node.right);
  };


  /**
   * @param {!TreeNode} node
   * @return {!Position}
   */
  let endPosition = function(root) {
    return {
      char: root.metrics.chars,
      line: root.metrics.lines,
      column: root.metrics.last
    };
  };


  return { wrap, build, splitLine, splitChar, merge, findLine, findChar, visit, endPosition };
};
