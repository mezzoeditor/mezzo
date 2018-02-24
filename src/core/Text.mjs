import { Random } from "./Random.mjs";
import { Metrics } from "./Metrics.mjs";
import { RoundMode, Unicode } from "./Unicode.mjs";
import { trace } from "../core/Trace.mjs";

let random = Random(42);

// This is very efficient for loading large files and memory consumption.
// It might slow down common operations though. We should measure that and
// consider different chunk sizes based on total document length.
let kDefaultChunkSize = 1000;

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
 *   column: number|undefined,
 *   x: number|undefined,
 *   y: number|undefined,
 * }} FindKey;
 */

 /**
 * @param {!Location} location
 * @param {!FindKey} key
 * @param {!Measurer} measurer
 * @return {boolean}
 */
function locationIsGreater(location, key, measurer) {
  if (key.offset !== undefined)
    return location.offset > key.offset;
  if (key.line !== undefined)
    return location.line > key.line || (location.line === key.line && location.column > key.column);
  return location.y > key.y || (location.y + measurer.defaultHeight > key.y && location.x > key.x);
};

/**
 * @param {!Location} location
 * @param {!FindKey} key
 * @return {boolean}
 */
function locationIsGreaterOrEqual(location, key) {
  if (key.offset !== undefined)
    return location.offset >= key.offset;
  if (key.line !== undefined)
    return location.line > key.line || (location.line === key.line && location.column >= key.column);
  throw 'locationIsGreaterOrEqual cannot be used for points';
};


/**
 * @param {string} s
 * @param {!Measurer} measurer
 * @return {!TreeNode}
 */
function createNode(s, measurer) {
  return {
    chunk: s,
    h: random(),
    metrics: Metrics.fromString(s, measurer)
  };
}

/**
 * @param {!TreeNode} parent
 * @param {!TreeNode|undefined} left
 * @param {!TreeNode|undefined} right
 * @param {!Measurer} measurer
 * @param {boolean=} skipClone
 * @return {!TreeNode}
 */
function setChildren(parent, left, right, measurer, skipClone) {
  let node = skipClone ? parent : {
    chunk: parent.chunk,
    h: parent.h,
    metrics: parent.selfMetrics || parent.metrics
  };
  if (!node.selfMetrics && (left || right))
    node.selfMetrics = node.metrics;
  if (left) {
    node.left = left;
    node.metrics = Metrics.combine(left.metrics, node.metrics, measurer);
  }
  if (right) {
    node.right = right;
    node.metrics = Metrics.combine(node.metrics, right.metrics, measurer);
  }
  return node;
}

/**
 * @param {!Array<!TreeNode>} nodes
 * @param {!Measurer} measurer
 * @return {!TreeNode|undefined}
 */
function buildTree(nodes, measurer) {
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
   * @return {!TreeNode}
   */
  function fill(i) {
    let left = l[i] === -1 ? undefined : fill(l[i]);
    let right = r[i] === -1 ? undefined : fill(r[i]);
    return setChildren(nodes[i], left, right, measurer, true);
  }
  return fill(root);
}

/**
 * Left part contains all nodes up to key.
 * If node contains a key location inside, it will be returned in right part,
 * unless |intersectionToLeft| is true.
 * @param {!TreeNode|undefined} root
 * @param {!PartialLocation} key
 * @param {boolean} intersectionToLeft
 * @param {!Measurer} measurer
 * @param {!Location=} current
 * @return {{left: !TreeNode|undefined, right: !TreeNode|undefined}}
 */
function splitTree(root, key, intersectionToLeft, measurer, current) {
  if (!root)
    return {};
  if (!current)
    current = Metrics.origin;
  if (locationIsGreaterOrEqual(current, key))
    return {right: root};
  if (!locationIsGreater(Metrics.advanceLocation(current, root.metrics, measurer), key, measurer))
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

  let next = root.left ? Metrics.advanceLocation(current, root.left.metrics, measurer) : current;
  let rootToLeft = !locationIsGreaterOrEqual(next, key);
  next = Metrics.advanceLocation(next, root.selfMetrics || root.metrics, measurer);
  if (!intersectionToLeft)
    rootToLeft = !locationIsGreater(next, key, measurer);
  if (rootToLeft) {
    let tmp = splitTree(root.right, key, intersectionToLeft, measurer, next);
    return {left: setChildren(root, root.left, tmp.left, measurer), right: tmp.right};
  } else {
    let tmp = splitTree(root.left, key, intersectionToLeft, measurer, current);
    return {left: tmp.left, right: setChildren(root, tmp.right, root.right, measurer)};
  }
}

/**
 * @param {!TreeNode|undefined} left
 * @param {!TreeNode|undefined} right
 * @param {!Measurer} measurer
 * @return {!TreeNode|undefined}
 */
function mergeTrees(left, right, measurer) {
  if (!left)
    return right;
  if (!right)
    return left;
  if (left.h > right.h)
    return setChildren(left, left.left, mergeTrees(left.right, right, measurer), measurer);
  else
    return setChildren(right, mergeTrees(left, right.left, measurer), right.right, measurer);
}

/**
 * @param {!TreeNode} node
 * @param {!PartialLocation} key
 * @param {!Measurer} measurer
 * @return {{node: !TreeNode, location: !Location}|undefined}
 */
function findNode(node, key, measurer) {
  let current = Metrics.origin;
  while (true) {
    if (node.left) {
      let next = Metrics.advanceLocation(current, node.left.metrics, measurer);
      if (locationIsGreater(next, key, measurer)) {
        node = node.left;
        continue;
      }
      current = next;
    }
    let next = Metrics.advanceLocation(current, node.selfMetrics || node.metrics, measurer);
    if (locationIsGreater(next, key, measurer))
      return {node, location: current};
    current = next;
    if (!node.right)
      return;
    node = node.right;
  }
}

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
   * @param {number} offset
   * @param {number} from
   * @param {number} to
   * @return {!TreeIterator}
   */
  static create(root, offset, from, to) {
    let it = new TreeIterator(root, [], from, to, 0, 0);
    it._init(root, offset);
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
        this._stack.push(left);
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
   * @param {!Measurer} measurer
   */
  constructor(root, measurer) {
    this._root = root;
    this._measurer = measurer;
    let metrics = this._root.metrics;
    this._lineCount = (metrics.lineBreaks || 0) + 1;
    this._length = metrics.length;
    this._lastLocation = Metrics.toLocation(metrics, this._measurer);
    this._longestLineWidth = metrics.longestWidth || (metrics.longestColumns * this._measurer.defaultWidth);
  }

  /**
   * @param {string} content
   * @return {!Text}
   */
  static withContent(content, measurer) {
    return new Text(Text._withContent(content, measurer), measurer);
  }

  /**
   * @param {string} content
   * @return {!TreeNode}
   */
  static _withContent(content, measurer) {
    let index = 0;
    let nodes = [];
    while (index < content.length) {
      let length = Math.min(content.length - index, kDefaultChunkSize);
      if (!Unicode.isValidOffset(content, index + length))
        length++;
      let chunk = content.substring(index, index + length);
      nodes.push(createNode(chunk, measurer));
      index += length;
    }
    if (!nodes.length)
      nodes.push(createNode('', measurer));
    return buildTree(nodes, measurer);
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
    let iterator = this.iterator(from, from, to);
    return iterator.substr(to - from);
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
  longestLineWidth() {
    return this._longestLineWidth;
  }

  /**
   * @return {number}
   */
  length() {
    return this._length;
  }

  /**
   * @return {!Location}
   */
  lastLocation() {
    return this._lastLocation;
  }

  /**
   * @param {number=} fromOffset
   * @param {number=} toOffset
   * @param {string} insertion
   * @return {!Text}
   */
  replace(fromOffset, toOffset, insertion) {
    let {from, to} = this._clamp(fromOffset, toOffset);
    let tmp = splitTree(this._root, {offset: to}, true /* intersectionToLeft */, this._measurer);
    let right = tmp.right;
    tmp = splitTree(tmp.left, {offset: from}, false /* intersectionToLeft */, this._measurer);
    let left = tmp.left;
    let middle = tmp.right;
    if (!middle) {
      middle = Text._withContent(insertion, this._measurer);
    } else {
      let leftSize = left ? left.metrics.length : 0;
      let middleSize = middle.metrics.length;
      let first = findNode(middle, {offset: 0}, this._measurer).node;
      let last = findNode(middle, {offset: middleSize - 1}, this._measurer).node;
      let middleContent =
          first.chunk.substring(0, from - leftSize) +
          insertion +
          last.chunk.substring(last.chunk.length - (leftSize + middleSize - to));
      middle = Text._withContent(middleContent, this._measurer);
    }
    return new Text(mergeTrees(left, mergeTrees(middle, right, this._measurer), this._measurer), this._measurer);
  }

  /**
   * @param {number} offset
   * @return {?Location}
   */
  offsetToLocation(offset) {
    if (offset > this._length)
      return null;
    if (offset === this._length)
      return this._lastLocation;
    let found = findNode(this._root, {offset}, this._measurer);
    if (!found)
      throw 'Inconsistency';
    return Metrics.stringOffsetToLocation(found.node.chunk, found.location, offset, this._measurer);
  }

  /**
   * @param {!Position} position
   * @param {boolean=} strict
   * @return {!Location}
   */
  positionToLocation(position, strict) {
    if (position.line < 0) {
      if (strict)
        throw 'Position does not belong to text';
      position = {line: 0, column: 0};
    }
    if (position.column < 0) {
      if (strict)
        throw 'Position does not belong to text';
      position = {line: position.line, column: 0};
    }
    let compare = (position.line - this._lastLocation.line) || (position.column - this._lastLocation.column);
    if (compare >= 0) {
      if (!strict || compare === 0)
        return this._lastLocation;
      throw 'Position does not belong to text';
    }
    let found = findNode(this._root, {line: position.line, column: position.column}, this._measurer);
    if (!found) {
      if (!strict)
        return this._lastLocation;
      throw 'Position does not belong to text';
    }
    return Metrics.stringPositionToLocation(found.node.chunk, found.location, position, this._measurer, strict);
  }

  /**
   * @param {!Point} point
   * @param {!RoundMode} roundMode
   * @param {boolean=} strict
   * @return {!Location}
   */
  pointToLocation(point, roundMode, strict) {
    if (point.y < 0) {
      if (strict)
        throw 'Point does not belong to text';
      point = {x: 0, y: 0};
    }
    if (point.x < 0) {
      if (strict)
        throw 'Point does not belong to text';
      point = {x: 0, y: point.y};
    }
    let compare = (point.y - this._lastLocation.y) || (point.x - this._lastLocation.x);
    if (compare >= 0) {
      if (!strict || compare === 0)
        return this._lastLocation;
      throw 'Point does not belong to text';
    }
    let found = findNode(this._root, {x: point.x, y: point.y}, this._measurer);
    if (!found) {
      if (!strict)
        return this._lastLocation;
      throw 'Point does not belong to text';
    }
    return Metrics.stringPointToLocation(found.node.chunk, found.location, point, this._measurer, roundMode, strict);
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
    this.current = this.outOfBounds() ? undefined : this._chunk[this._pos];
  }

  /**
   * @param {number} length
   * @return {string}
   */
  substr(length) {
    length = Math.min(length, this._to - this.offset);
    if (length <= 0)
      return '';

    if (this._pos + length <= this._chunk.length)
      return this._chunk.substr(this._pos, length);

    let result = '';
    let iterator = length <= kDefaultChunkSize * 2 ? this._iterator : this._iterator.clone();
    let pos = this._pos;
    let moves = -1;
    do {
      ++moves;
      let chunk = iterator.node().chunk;
      let word = chunk.substr(pos, length);
      pos = 0;
      result += word;
      length -= word.length;
    } while (length && iterator.next());
    while (iterator === this._iterator && moves--)
      iterator.prev();
    return result;
  }

  /**
   * @param {number} length
   * @return {string}
   */
  rsubstr(length) {
    length = Math.min(length, this.offset - this._from);
    if (length <= 0)
      return '';

    if (this._pos >= length)
      return this._chunk.substr(this._pos - length, length);

    let result = '';
    let pos = this._pos;
    let iterator = length <= kDefaultChunkSize * 2 ? this._iterator : this._iterator.clone();
    let moves = -1;
    do {
      moves++;
      let chunk = iterator.node().chunk;
      let word = pos === -1 ? chunk.substr(-length) : chunk.substr(0, pos).substr(-length);
      pos = -1;
      result = word + result;
      length -= word.length;
    } while (length && iterator.prev());
    while (iterator === this._iterator && moves--)
      iterator.next();
    return result;
  }

  /**
   * @param {number} length
   * @return {string}
   */
  read(length) {
    length = Math.min(length, this._to - this.offset);
    if (length <= 0)
      return '';

    let result = this._chunk.substr(this._pos, length);
    this.offset += length;
    this._pos += length;
    while (this._pos >= this._chunk.length && this._iterator.next()) {
      this._pos -= this._chunk.length;
      this._chunk = this._iterator.node().chunk;
      result += this._chunk.substr(0, length - result.length);
    }
    this.current = this.outOfBounds() ? undefined : this._chunk[this._pos];
    return result;
  }

  /**
   * @param {number} length
   * @return {string}
   */
  rread(length) {
    length = Math.min(length, this.offset - this._from);
    if (length <= 0)
      return '';

    let result = this._chunk.substring(Math.max(0, this._pos - length), this._pos);
    this.offset -= length;
    this._pos -= length;
    while (this._pos < 0 && this._iterator.prev()) {
      this._chunk = this._iterator.node().chunk;
      this._pos += this._chunk.length;
      result = this._chunk.substr(result.length - length) + result;
    }
    this.current = this.outOfBounds() ? undefined : this._chunk[this._pos];
    return result;
  }

  /**
   * @param {string} query
   * @return {boolean}
   */
  find(query) {
    if (this.outOfBounds())
      return false;

    // fast-path: search in current chunk.
    let index = this._chunk.indexOf(query, this._pos);
    if (index !== -1) {
      index -= this._pos;
      if (this.offset + index + query.length > this._to)
        this.advance(this._to - this.offset);
      else
        this.advance(index);
      return !this.outOfBounds();
    }

    let searchWindow = this._chunk.substring(this._pos);
    let endIterator = this._iterator.clone();

    while (true) {
      let skip = this._chunk.length - this._pos;

      while (searchWindow.length - skip < query.length - 1) {
        if (!endIterator.next())
          break;
        searchWindow += endIterator.node().chunk;
      }

      let index = searchWindow.indexOf(query);
      if (index !== -1) {
        if (this.offset + index + query.length > this._to)
          this.advance(this._to - this.offset);
        else
          this.advance(index);
        return !this.outOfBounds();
      }

      searchWindow = searchWindow.substring(skip);
      this.offset += skip;
      if (!this._iterator.next()) {
        this._pos = this._chunk.length;
        this.current = undefined;
        return false;
      }
      this._chunk = this._iterator.node().chunk;
      this._pos = 0;
      this.current = this._chunk[this._pos];
    }
  }

  /**
   * @return {!Text.Iterator}
   */
  clone() {
    let it = this._iterator.clone();
    return new Text.Iterator(it, this.offset, this._from, this._to);
  }

  next() {
    return this.advance(1);
  }

  prev() {
    return this.advance(-1);
  }

  /**
   * @param {number} x
   * @return {number}
   */
  advance(x) {
    if (x === 0)
      return 0;
    if (this.offset + x > this._to)
      x = this._to - this.offset;
    else if (this.offset + x < this._from)
      x = this._from - this.offset - 1;

    this.offset += x;
    this._pos += x;
    if (x > 0) {
      while (this._pos >= this._chunk.length && this._iterator.next()) {
        this._pos -= this._chunk.length;
        this._chunk = this._iterator.node().chunk;
      }
    } else {
      while (this._pos < 0 && this._iterator.prev()) {
        this._chunk = this._iterator.node().chunk;
        this._pos += this._chunk.length;
      }
    }
    this.current = this.outOfBounds() ? undefined : this._chunk[this._pos];
    return x;
  }

  /**
   * @param {number} offset
   * @return {number}
   */
  charCodeAt(offset) {
    if (this._pos + offset >= 0 && this._pos + offset < this._chunk.length &&
        this.offset + offset >= this._from && this.offset + offset < this._to) {
      return this._chunk.charCodeAt(this._pos + offset);
    }
    let char = this.charAt(offset);
    return char ? char.charCodeAt(0) : NaN;
  }

  /**
   * @param {number} offset
   * @return {number}
   */
  charAt(offset) {
    if (!offset)
      return this.current;

    if (offset >= -kDefaultChunkSize * 2 && offset <= kDefaultChunkSize * 2) {
      offset = this.advance(offset);
      let result = this.current;
      this.advance(-offset);
      return result;
    }

    let it = this.clone();
    it.advance(offset);
    return it.current;
  }

  /**
   * @return {number}
   */
  length() {
    return this._to - this._from;
  }

  /**
   * @return {boolean}
   */
  outOfBounds() {
    return this.offset < this._from || this.offset >= this._to;
  }
};

Text.test = {};

/**
 * @param {!Array<string>} chunks
 * @param {!Measurer} measurer
 * @return {!Text}
 */
Text.test.fromChunks = function(chunks, measurer) {
  let nodes = chunks.map(chunk => createNode(chunk, measurer));
  return new Text(buildTree(nodes, measurer), measurer);
};

/**
 * @param {number}
 */
Text.test.setDefaultChunkSize = function(chunkSize) {
  kDefaultChunkSize = chunkSize;
};
