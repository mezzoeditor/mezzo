export let Chunk = {};

/**
 * @param {string} chunk
 * @return {!Metrics}
 */
Chunk.metrics = function(chunk) {
  let metrics = {
    length: chunk.length,
    first: 0,
    last: 0,
    longest: 0
  };
  let lines = 0;
  let index = 0;
  while (true) {
    let nextLine = chunk.indexOf('\n', index);
    if (index === 0) {
      metrics.first = nextLine === -1 ? chunk.length : nextLine;
      metrics.longest = metrics.first;
    }
    if (nextLine === -1) {
      metrics.last = chunk.length - index;
      metrics.longest = Math.max(metrics.longest, metrics.last);
      break;
    }
    metrics.longest = Math.max(metrics.longest, nextLine - index);
    lines++;
    index = nextLine + 1;
  }
  if (lines)
    metrics.lines = lines;
  return metrics;
};

/**
 * @param {string} chunk
 * @param {!Position} before
 * @param {!Position} position
 * @param {boolean=} clamp
 */
Chunk.positionToOffset = function(chunk, before, position, clamp) {
  let {line, column, offset} = before;

  let index = 0;
  while (line < position.line) {
    let nextLine = chunk.indexOf('\n', index);
    if (nextLine === -1)
      throw 'Inconsistent';
    offset += (nextLine - index + 1);
    index = nextLine + 1;
    line++;
    column = 0;
  }

  let lineEnd = chunk.indexOf('\n', index);
  if (lineEnd === -1)
    lineEnd = chunk.length;
  if (lineEnd < index + (position.column - column)) {
    if (clamp)
      return offset + lineEnd - index;
    throw 'Position does not belong to text';
  }
  return offset + position.column - column;
};

/**
 * @param {string} chunk
 * @param {!Position} before
 * @param {number} offset
 * @return {!Position}
 */
Chunk.offsetToPosition = function(chunk, before, offset) {
  if (chunk.length < offset - before.offset)
    throw 'Inconsistent';
  chunk = chunk.substring(0, offset - before.offset);
  let {line, column} = before;
  let index = 0;
  while (true) {
    let nextLine = chunk.indexOf('\n', index);
    if (nextLine !== -1) {
      line++;
      column = 0;
      index = nextLine + 1;
    } else {
      column += chunk.length - index;
      break;
    }
  }
  return {line, column, offset};
};
import { Random } from "./Random.mjs";
let random = Random(25);

/**
 * @typdef {{
 *   from: number,
 *   to: number,
 *   style: string,
 * }} Decoration
 */

/**
 * @typedef {{
 *   style: string,
 *   from: number,
 *   to: number,
 *   h: number,
 *   size: number,
 *   add: number|undefined,
 *   left: !Segment|undefined,
 *   right: !Segment|undefined,
 * }} TreeNode;
 */

/**
 * @param {!TreeNode} node
 * @return {!TreeNode}
 */
function normalize(node) {
  if (!node.add)
    return node;
  node.from += node.add;
  node.to += node.add;
  if (node.left)
    node.left.add = (node.left.add || 0) + node.add;
  if (node.right)
    node.right.add = (node.right.add || 0) + node.add;
  node.add = undefined;
  return node;
};

/**
 * @param {!TreeNode} node
 * @param {!TreeNode|undefined} left
 * @param {!TreeNode|undefined} right
 * @return {!TreeNode}
 */
function setChildren(node, left, right) {
  if (node.add)
    throw 'Inconsistent';
  node.size = 1;
  node.left = left;
  if (left)
    node.size += left.size;
  node.right = right;
  if (right)
    node.size += right.size;
  return node;
};

/**
 * @param {!TreeNode|undefined} left
 * @param {!TreeNode|undefined} right
 * @return {!TreeNode|undefined}
 */
function merge(left, right) {
  if (!left)
    return right;
  if (!right)
    return left;
  left = normalize(left);
  right = normalize(right);
  if (left.h > right.h)
    return setChildren(left, left.left, merge(left.right, right));
  else
    return setChildren(right, merge(left, right.left), right.right);
};

const kFrom = 0;
const kTo = 1;
const kBetween = 2;

/**
 * @param {!TreeNode|undefined} node
 * @param {number} offset
 * @param {number} splitBy
 * @return {{left: !TreeNode|undefined, right: !TreeNode|undefined}}
 */
function split(node, offset, splitBy) {
  if (!node)
    return {};
  node = normalize(node);
  let nodeToRight = splitBy === kFrom ? node.from >= offset :
      (splitBy === kTo ? node.to > offset : (node.from > offset || node.to > offset));
  if (nodeToRight) {
    let tmp = split(node.left, offset, splitBy);
    return {left: tmp.left, right: setChildren(node, tmp.right, node.right)};
  } else {
    let tmp = split(node.right, offset, splitBy);
    return {left: setChildren(node, node.left, tmp.left), right: tmp.right};
  }
};

/**
 * @param {!TreeNode|undefined} node
 * @param {!Array<!Decoration>} result
 */
function visitList(node, result) {
  if (!node)
    return;
  node = normalize(node);
  visitList(node.left, result);
  result.push({from: node.from, to: node.to, style: node.style});
  visitList(node.right, result);
};

/**
 * @param {!TreeNode|undefined} node
 * @param {!Map<string, !OffsetRange>} result
 */
function visitMap(node, result) {
  if (!node)
    return;
  node = normalize(node);
  visitMap(node.left, result);
  let bucket = result.get(node.style);
  if (!bucket) {
    bucket = [];
    result.set(node.style, bucket);
  }
  bucket.push({from: node.from, to: node.to});
  visitMap(node.right, result);
};

/**
 * @param {!TreeNode} node
 * @return {!TreeNode}
 */
function first(node) {
  while (normalize(node).left)
    node = node.left;
  return node;
};

/**
 * @param {!TreeNode} node
 * @return {!TreeNode}
 */
function last(node) {
  while (normalize(node).right)
    node = node.right;
  return node;
};

export class Decorator {
  constructor() {
    this._root = undefined;
  }

  /**
   * @param {number} from
   * @param {number} to
   * @param {string} style
   */
  add(from, to, style) {
    if (from > to)
      throw 'Reversed decorations are not allowed';
    let tmp = split(this._root, to, kFrom);
    if (tmp.left && last(tmp.left).to > from)
      throw 'Decorations must be disjoint';
    if (from === to && tmp.right && first(tmp.right).to === to)
      throw 'Two collapsed decorations at the same position are not allowed';
    let node = {style, from, to, h: random(), size: 1};
    this._root = merge(merge(tmp.left, node), tmp.right);
  }

  /**
   * @param {number} from
   * @param {number} to
   * @param {string} style
   */
  remove(from, to, style) {
    let collapsed = from === to;
    let tmp = split(this._root, from, collapsed ? kFrom : kBetween);
    let tmp2 = split(tmp.right, to, collapsed ? kBetween : kFrom);
    let removed = tmp2.left;
    if (!removed || removed.from !== from || removed.to !== to)
      throw 'Decoration is not present';
    if (removed.left || removed.right)
      throw 'Inconsistent';
    this._root = merge(tmp.left, tmp2.right);
  }

  clearAll() {
    this._root = undefined;
  }

  /**
   * Removes all decorations which start at [from, to].
   * @param {number} from
   * @param {number} to
   */
  clearStarting(from, to) {
    let tmp = split(this._root, from, kFrom);
    let tmp2 = split(tmp.right, to + 1, kFrom);
    this._root = merge(tmp.left, tmp2.right);
  }

  /**
   * @param {number} from
   * @param {number} to
   * @param {number} inserted
   */
  onReplace(from, to, inserted) {
    let delta = inserted - (to - from);
    let tmp = split(this._root, from - 1, kTo);
    let left = tmp.left;
    tmp = split(tmp.right, to + 1, kFrom);
    let right = tmp.right;
    tmp = split(tmp.left, from + 1, kFrom);
    let crossLeft = tmp.left;
    tmp = split(tmp.right, to - 1, kTo);
    let crossRight = tmp.right;
    // Decorations in tmp.left are strictly inside [from, to] and will be removed.

    let processed1 = this._process(crossLeft, from, to, inserted);
    let processed2 = this._process(crossRight, from, to, inserted);
    if (right)
      right.add = (right.add || 0) + delta;
    this._root = merge(left, merge(merge(processed1, processed2), right));
  }

  /**
   * @param {!TreeNode} root
   * @param {number} from
   * @param {number} to
   * @param {number} inserted
   * @return {!TreeNode}
   */
  _process(root, from, to, inserted) {
    let decorations = [];
    visitList(root, decorations);
    let result = undefined;
    for (let decoration of decorations) {
      let start = decoration.from;
      let end = decoration.to;
      if (from < start && to > start)
        continue;

      if (from <= start)
        start = to >= start ? from : start - (to - from);
      if (from <= end)
        end = to >= end ? from : end - (to - from);

      if (from <= start)
        start += inserted;
      if (from <= end)
        end += inserted;

      let node = {style: decoration.style, from: start, to: end, h: random(), size: 1};
      result = merge(result, node);
    }
    return result;
  }

  /**
   * @return {!Array<!Decoration>}
   */
  listAll() {
    let result = [];
    visitList(this._root, result);
    return result;
  }

  /**
   * Lists all decorations which intersect or touch [from, to].
   * @param {number} from
   * @param {number} to
   * @return {!Array<!Decoration>}
   */
  listTouching(from, to) {
    let tmp = split(this._root, range.from, kTo);
    let tmp2 = split(tmp.right, range.to, kFrom);
    let result = [];
    visitList(tmp2.left, result);
    this._root = merge(tmp.left, merge(tmp2.left, tmp2.right));
    return result;
  }

  /**
   * Returns the number of decorations which start at [from, to].
   * @param {number} from
   * @param {number} to
   * @return {number}
   */
  countStarting(from, to) {
    let tmp = split(this._root, from, kFrom);
    let tmp2 = split(tmp.right, to + 1, kFrom);
    let result = tmp2.left ? tmp2.left.size : 0;
    this._root = merge(tmp.left, merge(tmp2.left, tmp2.right));
    return result;
  }

  /**
   * @return {number}
   */
  countAll() {
    return this._root ? this._root.size : 0;
  }

  /**
   * @param {number} from
   * @param {number} to
   * @return {?Decoration}
   */
  firstStarting(from, to) {
    let tmp = split(this._root, from, kFrom);
    let tmp2 = split(tmp.right, to + 1, kFrom);
    let result = null;
    if (tmp2.left) {
      let node = first(tmp2.left);
      result = {from: node.from, to: node.to, style: node.style};
    }
    this._root = merge(tmp.left, merge(tmp2.left, tmp2.right));
    return result;
  }

  /**
   * @param {number} from
   * @param {number} to
   * @return {?Decoration}
   */
  lastEnding(offset) {
    let tmp = split(this._root, from - 1, kTo);
    let tmp2 = split(tmp.right, to, kTo);
    let result = null;
    if (tmp2.left) {
      let node = last(tmp2.left);
      result = {from: node.from, to: node.to, style: node.style};
    }
    this._root = merge(tmp.left, merge(tmp2.left, tmp2.right));
    return result;
  }

  /**
   * Maps all styles to decorations which intersect or touch [from, to].
   * @param {number} from
   * @param {number} to
   * @return {!Map<string, !Array<!OffsetRange>>}
   */
  mapTouching(range) {
    // TODO: creating this map is really slow, we should optimize iterating over
    // decorations.
    let result = new Map();
    let tmp = split(this._root, range.from, kTo);
    let tmp2 = split(tmp.right, range.to, kFrom);
    visitMap(tmp2.left, result);
    this._root = merge(tmp.left, merge(tmp2.left, tmp2.right));
    return result;
  }
};
import { Decorator } from "./Decorator.mjs";
import { History } from "./History.mjs";
import { Text } from "./Text.mjs";
import { Viewport } from "./Viewport.mjs";

export class Document {
  /**
   * @param {function()} onInvalidate
   * @param {function(number)} onReveal
   */
  constructor(onInvalidate, onReveal) {
    this._onInvalidate = onInvalidate;
    this._onReveal = onReveal;
    this._plugins = new Map();
    this._decorators = new Set();
    this._history = new History({
      text: Text.withContent(''),
      replacements: [],
      data: new Map(),
      operation: '__initial__'
    });
    this._text = this._history.current().text;
    this._operations = [];
    this._replacements = [];
    this._frozen = false;
  }

  /**
   * @param {string} text
   */
  reset(text) {
    if (this._operations.length)
      throw 'Cannot reset during operation';
    if (this._frozen)
      throw 'Cannot edit while building viewport';
    let to = this._text.length();
    this._history.reset({
      text: Text.withContent(text),
      replacements: [],
      data: new Map(),
      operation: '__initial__'
    });
    this._text = this._history.current().text;
    for (let plugin of this._plugins.values()) {
      if (plugin.onReplace)
        plugin.onReplace(0, to, text.length);
    }
    this.invalidate();
  }

  invalidate() {
    this._onInvalidate.call(null);
  }

  /**
   * @param {number} offset
   */
  reveal(offset) {
    if (this._frozen)
      throw 'Cannot reveal while building viewport';
    this._onReveal.call(null, offset);
  }

  /**
   * @param {number} from
   * @param {number} to
   * @param {string} insertion
   */
  replace(from, to, insertion) {
    if (!this._operations.length)
      throw 'Cannot edit outside of operation';
    if (this._frozen)
      throw 'Cannot edit while building viewport';
    this._replacements.push({from, to, inserted: insertion.length});
    let text = this._text.replace(from, to, insertion);
    this._text.resetCache();
    this._text = text;
    for (let plugin of this._plugins.values()) {
      if (plugin.onReplace)
        plugin.onReplace(from, to, insertion.length);
    }
  }

  /**
   * @param {string} name
   */
  begin(name) {
    this._operations.push(name);
  }

  /**
   * @param {string} name
   */
  end(name) {
    if (this._operations[this._operations.length - 1] !== name)
      throw 'Trying to end wrong operation';
    this._operations.pop();
    if (this._operations.length)
      return;

    let state = {
      text: this._text,
      data: new Map(),
      replacements: this._replacements,
      operation: name
    };
    this._replacements = [];
    for (let name of this._plugins.keys()) {
      let plugin = this._plugins.get(name);
      let data;
      // TODO: investigate not saving state every time if we can collapse states.
      //       Or maybe presistent data structures will save us?
      if (plugin.onSave)
        data = plugin.onSave();
      if (data !== undefined)
        state.data.set(name, data);
    }
    this._history.push(state);
    this.invalidate();
  }

  /**
   * @param {string=} name
   * @return {boolean}
   */
  undo(name) {
    if (this._operations.length)
      throw 'Cannot undo during operation';

    let undone = this._history.undo(state => this._filterHistory(state, name));
    if (!undone)
      return false;

    let replacements = [];
    for (let state of undone) {
      for (let i = state.replacements.length - 1; i >= 0; i--) {
        let {from, to, inserted} = state.replacements[i];
        replacements.push({from, to: from + inserted, inserted: to - from});
      }
    }

    let current = this._history.current();
    this._text = current.text;
    for (let name of this._plugins.keys()) {
      let plugin = this._plugins.get(name);
      let data = current.data.get(name);
      if (plugin.onRestore)
        plugin.onRestore(replacements, data);
    }
    this.invalidate();
    return true;
  }

  /**
   * @param {string=} name
   * @return {boolean}
   */
  redo(name) {
    if (this._operations.length)
      throw 'Cannot redo during operation';

    let redone = this._history.redo(state => this._filterHistory(state, name));
    if (!redone)
      return false;

    let replacements = [];
    for (let state of redone)
      replacements.push(...state.replacements);

    let current = this._history.current();
    this._text = current.text;
    for (let name of this._plugins.keys()) {
      let plugin = this._plugins.get(name);
      let data = current.data.get(name);
      if (plugin.onRestore)
        plugin.onRestore(replacements, data);
    }
    this.invalidate();
    return true;
  }

  /**
   * @param {*} state
   * @param {string|undefined} name
   */
  _filterHistory(state, name) {
    if (!name)
      return true;
    if (name[0] === '!')
      return state.operation !== name.substring(1);
    return state.operation === name;
  }

  /**
   * @param {string} name
   * @param {!Plugin} plugin
   */
  addPlugin(name, plugin) {
    if (this._plugins.get(name))
      throw 'Duplicate plugin';
    this._plugins.set(name, plugin);
    if (plugin.onAdded)
      plugin.onAdded(this);
    if (plugin.onViewport)
      this.invalidate();
  }

  /**
   * @param {string} name
   * @param {!Plugin} plugin
   */
  removePlugin(name, plugin) {
    if (this._plugins.get(name) !== plugin)
      throw 'No such plugin';
    this._plugins.delete(name);
    if (plugin.onRemoved)
      plugin.onRemoved(this);
    if (plugin.onViewport)
      this.invalidate();
  }

  /**
   * @param {!Decorator} decorator
   */
  addDecorator(decorator) {
    if (this._frozen)
      throw 'Cannot change decorators while building viewport';
    this._decorators.add(decorator);
    this.invalidate();
  }

  /**
   * @param {!Decorator} decorator
   */
  removeDecorator(decorator) {
    if (this._frozen)
      throw 'Cannot change decorators while building viewport';
    if (!this._decorators.has(decorator))
      throw 'No such decorator';
    this._decorators.delete(decorator);
    this.invalidate();
  }

  /**
   * @param {string} command
   * @param {*} data
   * @return {*}
   */
  perform(command, data) {
    if (command === 'history.undo')
      return this.undo(data);
    if (command === 'history.redo')
      return this.redo(data);
    for (let plugin of this._plugins.values()) {
      if (!plugin.onCommand)
        continue;
      let result = plugin.onCommand(command, data);
      if (result !== undefined)
        return result;
    }
  }

  /**
   * @param {number=} from
   * @param {number=} to
   * @return {string}
   */
  content(from, to) {
    return this._text.content(from, to);
  }

  /**
   * @param {number} offset
   * @param {number=} from
   * @param {number=} to
   * @return {!Text.Iterator}
   */
  iterator(offset, from, to) {
    return this._text.iterator(offset, from, to);
  }

  /**
   * @return {number}
   */
  lineCount() {
    return this._text.lineCount();
  }

  /**
   * @return {number}
   */
  longestLineLength() {
    return this._text.longestLineLength();
  }

  /**
   * @return {number}
   */
  length() {
    return this._text.length();
  }

  /**
   * @param {number} offset
   * @return {?{line: number, column: number, offset: number}}
   */
  offsetToPosition(offset) {
    return this._text.offsetToPosition(offset);
  }

  /**
   * @param {!{line: number, column: number}} position
   * @param {boolean=} clamp
   * @return {number}
   */
  positionToOffset(position, clamp) {
    return this._text.positionToOffset(position, clamp);
  }

  beforeViewport() {
    for (let plugin of this._plugins.values()) {
      if (plugin.onBeforeViewport)
        plugin.onBeforeViewport();
    }
  }

  /**
   * @package
   * @param {!Viewport} viewport
   * @return {!Set<!Decorator>}
   */
  decorateViewport(viewport) {
    this._frozen = true;
    for (let plugin of this._plugins.values()) {
      if (plugin.onViewport)
        plugin.onViewport(viewport);
    }
    this._frozen = false;
    return this._decorators;
  }
};

Document.Commands = new Set(['history.undo', 'history.redo']);
export class History {
  /**
   * @param {*} state
   */
  constructor(state) {
    this._states = [state];
    this._pos = 0;
  }

  /**
   * @param {*} state
   */
  reset(state) {
    this._states = [state];
    this._pos = 0;
  }

  /**
   * @return {*}
   */
  current() {
    return this._states[this._pos];
  }

  /**
   * @param {*} state
   */
  push(state) {
    if (this._pos === this._states.length - 1) {
      this._states.push(state);
      ++this._pos;
    } else {
      this._states[++this._pos] = state;
    }
    if (this._states.length > this._pos + 1)
      this._states.splice(this._pos + 1, this._states.length - this._pos + 1);
  }

  /**
   * @param {function(*):boolean} filter
   * @return {!Array<*>|undefined}
   */
  undo(filter) {
    let undone = [];
    for (let pos = this._pos; pos > 0; pos--) {
      let state = this._states[pos];
      undone.push(state);
      if (filter(state)) {
        this._pos = pos - 1;
        return undone;
      }
    }
  }

  /**
   * @param {function(*):boolean} filter
   * @return {!Array<*>|undefined}
   */
  redo(filter) {
    let redone = [];
    for (let pos = this._pos + 1; pos < this._states.length; pos++) {
      let state = this._states[pos];
      redone.push(state);
      if (filter(state)) {
        this._pos = pos;
        return redone;
      }
    }
  }
};
/**
 * @interface
 */
class Plugin {
  /**
   * Called when this plugin is added to the document.
   * Typically plugin adds Decorator(s) to the document here.
   * @param {!Document} document
   */
  onAdded(document) {
  }

  /**
   * Called when this plugin is removed from the document.
   * Typically plugin removes Decorator(s) from the document here.
   * @param {!Document} document
   */
  onRemoved(document) {
  }

  /**
   * Called before every render of viewport. Plugin is expected to do any
   * postponed work which should synchronously affect the viewport.
   * This is a last chance to affect viewport somehow before it is rendered.
   * Example: perform search on the small document based on last search parameters.
   */
  onBeforeViewport() {
  }

  /**
   * Called on every render of viewport. Plugin is expected to manipulate
   * Decorator(s) to affect the rendering.
   * Mutating the state which can affect viewport is prohibited,
   * e.g. editing the document or revealing position.
   * @param {!Viewport} viewport
   */
  onViewport(viewport) {
  }

  /**
   * Called when range in the text is replaced with something else.
   * It is usually a good idea to call onReplace on plugin's Decorator(s) here.
   * @param {number} from
   * @param {number} to
   * @param {number} inserted
   */
  onReplace(from, to, inserted) {
  }

  /**
   * Called when command should be executed. Return undefined if command is unhandled.
   * @param {string} command
   * @param {*} data
   * @return {*|undefined}
   */
  onCommand(command, data) {
  }

  /**
   * Called when history is about to save the state.
   * Returned data is stored in the history state.
   * @return {*}
   */
  onSave() {
  }

  /**
   * Called when history state is about to be restored,
   * with the data returned from onSaveState (if any).
   * Applying |replacements| in the passed order (similarly to |onReplace|)
   * to the Document's content before |onRestore| will produce it's current
   * content.
   * @param {!Array<{from: number, to: number, inserted: number}>} replacements
   * @param {*|undefined} data
   */
  onRestore(replacements, data) {
  }
};
/**
 * @param {number} seed
 * @return {function():number}
 */
export let Random = seed => {
  return function() {
    return seed = seed * 48271 % 2147483647;
  };
};
/**
 * This class helps to schedule full document processing by chunking work.
 * It operates on ranges, starting with full document range and reducing
 * it as scheduler allows.
 */
export class RangeScheduler {
  /**
   * @param {!Scheduler} scheduler
   * @param {function(!OffsetRange):?OffsetRange} visibleRangeToProcessingRange
   *   When we determine that some visible range needs to be (re)processed, this
   *   function converts that range into internal "processing range", which is
   *   later used in chunking and |processRange|.
   * @param {function(!OffsetRange):!OffsetRange} processRange
   *   Called to processing a passed range. Returns the actually process range,
   *   which may be smaller or larger than passed one. This function operates on
   *   internal "processing range", as opposite to visible range.
   * @param {number} chunkSize
   *   Range length which is processed not too fast (for efficiency), but also
   *   not too slow (for workload balance).
   * @param {function()=} doneProcessing
   *   Called when some synchronous work has been done, and no more synchronous
   *   work is planned.
   */
  constructor(scheduler, visibleRangeToProcessingRange, processRange, chunkSize, doneProcessing) {
    this._scheduler = scheduler;
    this._visibleRangeToProcessingRange = visibleRangeToProcessingRange.bind(null);
    this._processRange = processRange.bind(null);
    this._chunkSize = chunkSize;
    this._doneProcessing = (doneProcessing || function() {}).bind(null);
    this._rangeToProcess = null;  // [from, to] inclusive.
    this._scheduler.init(this._processNextChunk.bind(this), this._doneProcessing);
  }

  onBeforeViewport() {
    if (!this._rangeToProcess || (this._rangeToProcess.to - this._rangeToProcess.from > this._chunkSize))
      return;
    this._processNextChunk();
    this._doneProcessing();
  }

  /**
   * @param {!Viewport} viewport
   */
  onViewport(viewport) {
    if (!this._rangeToProcess)
      return;

    let viewportRange = this._visibleRangeToProcessingRange(viewport.range());
    if (!viewportRange || this._rangeToProcess.from >= viewportRange.to || this._rangeToProcess.to <= viewportRange.from)
      return;

    let didProcessSomething = false;
    for (let range of viewport.ranges()) {
      let processingRange = this._visibleRangeToProcessingRange(range);
      if (processingRange) {
        this._processed(this._processRange(processingRange));
        didProcessSomething = true;
      }
    }
    if (didProcessSomething)
      this._doneProcessing();
  }

  /**
   * @param {number} from
   * @param {number} to
   * @param {number} inserted
   */
  onReplace(from, to, inserted) {
    let range = this._visibleRangeToProcessingRange({from, to});
    if (range)
      this._processed(range);
    range = this._visibleRangeToProcessingRange({from: from, to: from + inserted});
    if (range)
      this._needsProcessing(range);
  }

  /**
   * @param {!Document} document
   */
  start(document) {
    let range = this._visibleRangeToProcessingRange({from: 0, to: document.length()});
    if (range)
      this._needsProcessing(range);
  }

  stop() {
    this._scheduler.cancel();
    this._rangeToProcess = null;
  }

  /**
   * @return {boolean}
   */
  _processNextChunk() {
    if (!this._rangeToProcess)
      return false;
    let from = this._rangeToProcess.from;
    let to = Math.min(this._rangeToProcess.to, from + this._chunkSize);
    this._processed(this._processRange({from, to}));
    return !!this._rangeToProcess;
  }

  /**
   * @param {!OffsetRange} range
   */
  _needsProcessing(range) {
    let {from, to} = range;
    if (this._rangeToProcess) {
      from = Math.min(from, this._rangeToProcess.from);
      to = Math.max(to, this._rangeToProcess.to);
    }
    this._rangeToProcess = {from, to};
    this._scheduler.schedule();
  }

  /**
   * @param {!OffsetRange} range
   */
  _processed(range) {
    if (!this._rangeToProcess)
      return;
    let {from, to} = range;
    if (from <= this._rangeToProcess.from && to >= this._rangeToProcess.to) {
      this._rangeToProcess = null;
      this._scheduler.cancel();
      return;
    }
    if (from <= this._rangeToProcess.from && to >= this._rangeToProcess.from)
      this._rangeToProcess.from = to;
    else if (from <= this._rangeToProcess.to && to >= this._rangeToProcess.to)
      this._rangeToProcess.to = from;
  }
};
/**
 * @interface
 */
class Scheduler {
  /**
   * |doSomeWork| returns true iff there is still more work to do.
   *
   * It is good idea to chunk the work into smaller manageable pieces,
   * running ~1-3ms each. Not too small (for efficiency), but not
   * too large (for workload balancing).
   *
   * |doneSomeWork| is called after no more work will be done
   * synchornously, with maybe some more work later. |doneSomeWork|
   * callback is expected to be instant.
   *
   * @param {function():boolean} doSomeWork
   * @param {function()=} doneSomeWork
   */
  init(doSomeWork, doneSomeWork) {
  }

  /**
   * There is more work to do - schedule it!
   */
  schedule() {
  }

  /**
   * The work is not really needed anymore, plz no schedule.
   */
  cancel() {
  }
};
import { Random } from "./Random.mjs";
let random = Random(25);

/**
 * @typedef {{
 *   data: *,
 *   from: number,
 *   to: number,
 *   h: number,
 *   add: number|undefined,
 *   left: !Segment|undefined,
 *   right: !Segment|undefined,
 * }} Segment;
 */

/**
 * @param {!Segment} node
 * @return {!Segment}
 */
function normalize(node) {
  if (!node.add)
    return node;
  let result = {from: node.from + node.add, to: node.to + node.add, data: node.data, h: node.h};
  if (node.left) {
    result.left = clone(node.left, node.left.left, node.left.right);
    result.left.add = (result.left.add || 0) + node.add;
  }
  if (node.right) {
    result.right = clone(node.right, node.right.left, node.right.right);
    result.right.add = (result.right.add || 0) + node.add;
  }
  return result;
};

/**
 * @param {!Segment} node
 * @param {!Segment|undefined} left
 * @param {!Segment|undefined} right
 * @return {!Segment}
 */
function clone(node, left, right) {
  let result = {data: node.data, from: node.from, to: node.to, h: node.h};
  if (node.add)
    result.add = node.add;
  result.left = left;
  result.right = right;
  return result;
};

/**
 * @param {!Segment|undefined} left
 * @param {!Segment|undefined} right
 * @return {!Segment|undefined}
 */
function merge(left, right) {
  if (!left)
    return right;
  if (!right)
    return left;
  left = normalize(left);
  right = normalize(right);
  if (left.h > right.h)
    return clone(left, left.left, merge(left.right, right));
  else
    return clone(right, merge(left, right.left), right.right);
};

const kFrom = 0;
const kTo = 1;
const kBetween = 2;

/**
 * @param {!Segment|undefined} node
 * @param {number} offset
 * @param {number} splitBy
 * @return {{left: !Segment|undefined, right: !Segment|undefined}}
 */
function split(node, offset, splitBy) {
  if (!node)
    return {};
  node = normalize(node);
  let nodeToRight = splitBy === kFrom ? node.from >= offset :
      (splitBy === kTo ? node.to > offset : (node.from > offset || node.to > offset));
  if (nodeToRight) {
    let tmp = split(node.left, offset, splitBy);
    return {left: tmp.left, right: clone(node, tmp.right, node.right)};
  } else {
    let tmp = split(node.right, offset, splitBy);
    return {left: clone(node, node.left, tmp.left), right: tmp.right};
  }
};


/**
 * @param {!Segement|undefined} node
 * @param {number} add
 * @param {!Array<{from: number, to: number, data: *}>} result
 */
function visit(node, add, result) {
  if (!node)
    return;
  add += node.add || 0;
  if (node.left)
    visit(node.left, add, result);
  result.push({from: node.from + add, to: node.to + add, data: node.data});
  if (node.right)
    visit(node.right, add, result);
};


/**
 * Note that two collapsed segments at the same position are not supported.
 * TODO: add runtime checks for that.
 */
export class Segments {
  /**
   * @param {!Segment|undefined} root
   */
  constructor(root) {
    this._root = root;
  }

  /**
   * @return {!Segments}
   */
  static empty() {
    return new Segments(undefined);
  }

  /**
   * @param {number} from
   * @param {number} to
   * @param {number} inserted
   * @return {!Segments}
   */
  replace(from, to, inserted) {
    let delta = inserted - (to - from);
    let tmp = split(this._root, from - 1, kTo);
    let left = tmp.left;
    tmp = split(tmp.right, to + 1, kFrom);
    let right = tmp.right;
    tmp = split(tmp.left, from + 1, kFrom);
    let crossLeft = tmp.left;
    tmp = split(tmp.right, to - 1, kTo);
    let crossRight = tmp.right;
    // tmp.left is gone forever.

    let processed1 = this._process(crossLeft, from, to, inserted);
    let processed2 = this._process(crossRight, from, to, inserted);
    if (right) {
      right = clone(right, right.left, right.right);
      right.add = (right.add || 0) + delta;
    }
    return new Segments(merge(left, merge(merge(processed1, processed2), right)));
  }

  /**
   * @param {!Segment} root
   * @param {number} from
   * @param {number} to
   * @param {number} inserted
   * @return {!Segment}
   */
  _process(root, from, to, inserted) {
    let segments = [];
    visit(root, 0, segments);
    let result = undefined;
    for (let segment of segments) {
      let start = segment.from;
      let end = segment.to;
      if (from < start && to > start)
        continue;

      if (from <= start)
        start = to >= start ? from : start - (to - from);
      if (from <= end)
        end = to >= end ? from : end - (to - from);

      if (from <= start)
        start += inserted;
      if (from <= end)
        end += inserted;

      let node = {from: start, to: end, h: random(), data: segment.data};
      result = merge(result, node);
    }
    return result;
  }

  /**
   * @param {number} from
   * @param {number} to
   * @param {*} data
   * @return {!Segments}
   */
  add(from, to, data) {
    if (from > to)
      throw 'Segments must not be degenerate';
    let tmp = split(this._root, to, kTo);
    // TODO: check for disjoint.
    let node = {from: from, to: to, h: random(), data};
    return new Segments(merge(merge(tmp.left, node), tmp.right));
  }

  /**
   * @param {number} from
   * @param {number} to
   * @return {!Segments}
   */
  remove(from, to) {
    let collapsed = from === to;
    let tmp = split(this._root, from, collapsed ? kFrom : kBetween);
    let tmp2 = split(tmp.right, to, collapsed ? kBetween : kFrom);
    let removed = tmp2.left;
    if (!removed || removed.from !== from || removed.to !== to)
      throw 'Attempt to remove unknown segment';
    if (removed.left || removed.right)
      throw 'Inconsistent';
    return new Segments(merge(tmp.left, tmp2.right));
  }

  /**
   * @param {number} from
   * @param {number} to
   * @return {!Array<{from: number, to: number, data: *}>}
   */
  intersect(from, to) {
    let tmp = split(this._root, range.from, kTo);
    tmp = split(tmp.right, range.to, kFrom);
    let result = [];
    visit(tmp.left, 0, result);
    return result;
  }

  /**
   * @return {!Array<{from: number, to: number, data: *}>}
   */
  all() {
    let result = [];
    visit(this._root, 0, result);
    return result;
  }
};
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
        this._stack.push(left.right);
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
    this.current = this.outOfBounds() ? undefined : this._chunk[this._pos];
  }

  /**
   * @param {number} to
   * @return {string}
   */
  substr(length) {
    if (this.outOfBounds())
      return '';
    let result = '';
    let iterator = this._iterator.clone();
    let pos = this._pos;
    do {
      let chunk = iterator.node().chunk;
      let word = chunk.substr(pos, length);
      pos = 0;
      result += word;
      length -= word.length;
    } while (length && iterator.next());
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
   */
  advance(x) {
    if (x === 0)
      return;
    if (this.offset + x > this._to)
      x = this._to - this.offset;
    else if (this.offset + x < this._from)
      x = this._from - this.offset;

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
  }

  /**
   * @param {number} offset
   * @return {number}
   */
  charCodeAt(offset) {
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
import { TextUtils } from '../utils/TextUtils.mjs';

/**
 * @typedef {{
 *   line: number,
 *   start: number,
 *   end: number,
 *   from: number,
 *   to: number,
 *   _content: string|undefined
 * }} Line;
 */

/**
 * @typedef {{
 *   from: number,
 *   to: number,
 *   _content: string|undefined
 * }} Range;
 */

export class Viewport {
  /**
   * @param {!Document} document
   * @param {!TextPosition} start
   * @param {number} width
   * @param {number} height
   */
  constructor(document, start, width, height) {
    let startLine = start.line;
    let startColumn = start.column;
    let endLine = Math.min(start.line + height, document.lineCount());
    let endColumn = startColumn + width;

    let lines = [];
    for (let line = startLine; line <= endLine; line++) {
      let start = document.positionToOffset({line, column: 0}, true /* clamp */);
      if (line === document.lineCount())
        start = document.length() + 1;
      if (line > startLine)
        lines[lines.length - 1].end = start - 1;
      if (line < endLine)
        lines.push({line, start});
    }
    let sum = 0;
    for (let line of lines) {
      line.from = Math.min(line.start + startColumn, line.end);
      line.to = Math.min(line.start + endColumn, line.end);
      sum += line.to - line.from;
    }

    let diffs = [];
    for (let i = 0; i < lines.length - 1; i++)
      diffs[i] = {i, len: lines[i + 1].from - lines[i].to};
    diffs.sort((a, b) => a.len - b.len || a.i - b.i);
    let join = new Array(lines.length - 1).fill(false);
    let remaining = sum * 0.5;
    for (let diff of diffs) {
      remaining -= diff.len;
      if (remaining < 0)
        break;
      join[diff.i] = true;
    }
    let ranges = [];
    for (let i = 0; i < lines.length; i++) {
      if (i && join[i - 1])
        ranges[ranges.length - 1].to = lines[i].to;
      else
        ranges.push({from: lines[i].from, to: lines[i].to});
    }

    this._document = document;
    this._lines = lines;
    this._ranges = ranges;
    this._startLine = startLine;
    this._endLine = endLine;
    this._range = {from: ranges[0].from, to: Math.min(document.length(), ranges[ranges.length - 1].to + 1)};
    this._startPosition = start;
    this._endPosition = {line: start.line + height, column: start.column + width};
  }

  /**
   * @param {number} from
   * @param {number} to
   * @param {{content: string, left: number, right: number}} cache
   * @param {number} left
   * @param {number} right
   * @return {string}
   */
  _content(from, to, cache, left, right) {
    left = Math.min(left, from);
    right = Math.min(right, this._document.length() - to);
    if (cache._content === undefined || cache._left < left || cache._right < right) {
      cache._left = Math.max(left, cache._left || 0);
      cache._right = Math.max(right, cache._right || 0);
      cache._content = this._document.content(from - cache._left, to + cache._right);
    }
    return cache._content.substring(cache._left - left,
                                    cache._content.length - (cache._right - right));
  }

  /**
   * @return {!Document}
   */
  document() {
    return this._document;
  }

  /**
   * @return {!TextPosition}
   */
  startPosition() {
    return this._startPosition;
  }

  /**
   * @return {!TextPosition}
   */
  endPosition() {
    return this._endPosition;
  }

  /**
   * @return {!Array<!Line>}
   */
  lines() {
    return this._lines;
  }

  /**
   * @param {!Line} line
   * @param {number} paddingLeft
   * @param {number} paddingRight
   * @return {string}
   */
  lineContent(line, paddingLeft = 0, paddingRight = 0) {
    if (!line._cache)
      line._cache = {};
    return this._content(line.from, line.to, line._cache, paddingLeft, paddingRight);
  }

  /**
   * @return {!Array<!Range>}
   */
  ranges() {
    return this._ranges;
  }

  /**
   * @param {!Range} range
   * @param {number} paddingLeft
   * @param {number} paddingRight
   * @return {string}
   */
  rangeContent(range, paddingLeft = 0, paddingRight = 0) {
    if (!range._cache)
      range._cache = {};
    return this._content(range.from, range.to, range._cache, paddingLeft, paddingRight);
  }

  /**
   * @return {!OffsetRange}
   */
  range() {
    return this._range;
  }

  /**
   * @param {number} paddingLeft
   * @param {number} paddingRight
   * @return {string}
   */
  content(paddingLeft = 0, paddingRight = 0) {
    if (!this._range._cache)
      this._range._cache = {};
    return this._content(this._range.from, this._range.to, this._range._cache, paddingLeft, paddingRight);
  }

  /**
   * @param {number} offset
   * @return {!TextPosition}
   */
  offsetToPosition(offset) {
    if (this._lines.length <= 20) {
      for (let line of this._lines) {
        if (offset >= line.start && offset <= line.end)
          return {line: line.line, column: offset - line.start};
      }
      return this._document.offsetToPosition(offset);
    }

    let left = 0;
    let right = this._lines.length - 1;
    if (offset < this._lines[left].start || offset > this._lines[right].end)
      return this._document.offsetToPosition(offset);
    while (true) {
      let middle = (left + right) >> 1;
      let line = this._lines[middle];
      if (offset < line.start)
        right = middle - 1;
      else if (offset > line.end)
        left = middle + 1;
      else
        return {line: line.line, column: offset - line.start};
    }
  }

  cleanup() {
    delete this._range._cache;
    for (let line of this._lines)
      delete line._cache;
    for (let range of this._ranges)
      delete range._cache;
  }
}
import {TestRunner, Reporter, Matchers} from '../../utils/testrunner/index.mjs';
import {Text} from './Text.mjs';

const runner = new TestRunner();

const {describe, xdescribe, fdescribe} = runner;
const {it, fit, xit} = runner;
const {beforeAll, beforeEach, afterAll, afterEach} = runner;

const {expect} = new Matchers();

describe('Text', () => {
  it('Text.content', () => {
    let text = Text.withContent('world');
    expect(text.content(1,3)).toBe('or');
  });

  it('Text.Iterator basics', () => {
    let text = Text.withContent('world');
    let it = text.iterator(0);
    expect(it.current).toBe('w');
    expect(it.offset).toBe(0);
    it.next();
    expect(it.current).toBe('o');
    expect(it.offset).toBe(1);
    it.prev();
    expect(it.current).toBe('w');
    expect(it.offset).toBe(0);
  });

  it('Text.Iterator.advance', () => {
    let text = Text.withContent('world');
    let it = text.iterator(0);
    it.advance(4);
    expect(it.current).toBe('d');
    it.advance(-2);
    expect(it.current).toBe('r');
  });

  it('Text.Iterator.find successful', () => {
    let text = Text.withContent('hello, world');
    let it = text.iterator(0);
    expect(it.find('world')).toBe(true);
    expect(it.offset).toBe(7);
    expect(it.current).toBe('w');
  });

  it('Text.Iterator.find unsuccessful', () => {
    let text = Text.withContent('hello, world');
    let it = text.iterator(0);
    expect(it.find('eee')).toBe(false);
    expect(it.offset).toBe(12);
    expect(it.current).toBe(undefined);

    it = text.iterator(0, 0, 3);
    expect(it.find('hello')).toBe(false);
    expect(it.offset).toBe(3);
    expect(it.current).toBe(undefined);
  });

  it('Text.Iterator constraints', () => {
    let text = Text.withContent('hello');
    let it = text.iterator(0, 0, 2);
    expect(it.offset).toBe(0);
    expect(it.current).toBe('h');

    it.prev();
    expect(it.offset).toBe(0);
    expect(it.current).toBe('h');

    it.next();
    expect(it.offset).toBe(1);
    expect(it.current).toBe('e');

    it.next();
    expect(it.offset).toBe(2);
    expect(it.current).toBe(undefined);

    it.next();
    expect(it.offset).toBe(2);
    expect(it.current).toBe(undefined);

    it.advance(-2);
    expect(it.offset).toBe(0);
    expect(it.current).toBe('h');
  });

  it('Text.Iterator out-of-bounds API', () => {
    let text = Text.withContent('abcdefg');
    let it = text.iterator(4, 2, 4);
    expect(it.offset).toBe(4);
    expect(it.current).toBe(undefined);
    expect(it.charCodeAt(0)).toBe(NaN);
    expect(it.charAt(0)).toBe(undefined);
    expect(it.substr(2)).toBe('');
  });
});


new Reporter(runner);
runner.run();

