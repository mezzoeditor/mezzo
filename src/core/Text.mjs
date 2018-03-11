import { RoundMode, Unicode } from './Unicode.mjs';
import { Tree } from './Tree.mjs';
import { TextIterator } from './TextIterator.mjs';

// This is very efficient for loading large files and memory consumption.
// It might slow down common operations though. We should measure that and
// consider different chunk sizes based on total document length.
let kDefaultChunkSize = 1000;

/**
 * @param {string} content
 * @param {!Measurer} measurer
 * @param {string=} firstChunk
 * @return {!Array<!{data: string, metrics: !Metrics}>}
 */
function chunkContent(content, measurer, firstChunk) {
  let index = 0;
  let chunks = [];
  if (firstChunk)
  chunks.push({data: firstChunk, metrics: Unicode.metricsFromString(firstChunk, measurer)});
  while (index < content.length) {
    let length = Math.min(content.length - index, kDefaultChunkSize);
    if (!Unicode.isValidOffset(content, index + length))
      length++;
    let chunk = content.substring(index, index + length);
    chunks.push({data: chunk, metrics: Unicode.metricsFromString(chunk, measurer)});
    index += length;
  }
  if (!chunks.length)
    chunks.push({data: '', metrics: Unicode.metricsFromString('', measurer)});
  return chunks;
}

export class Text {
  /**
   * @param {!Tree<string>} tree
   * @param {!Measurer} measurer
   */
  constructor(tree, measurer) {
    this._tree = tree;
    this._measurer = measurer;
    let metrics = this._tree.metrics();
    this._lineCount = (metrics.lineBreaks || 0) + 1;
    this._length = metrics.length;
    this._lastLocation = this._tree.endLocation();
    this._longestLineWidth = metrics.longestWidth || (metrics.longestColumns * this._measurer.defaultWidth);
  }

  /**
   * @param {string} content
   * @param {!Measurer} measurer
   * @return {!Text}
   */
  static withContent(content, measurer) {
    let chunks = chunkContent(content, measurer);
    return new Text(Tree.build(chunks, measurer.defaultHeight, measurer.defaultWidth), measurer);
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
    let iterator = this.iterator(from, from, to);
    return iterator.substr(to - from);
  }

  /**
   * @param {number} offset
   * @param {number=} fromOffset
   * @param {number=} toOffset
   * @return {!TextIterator}
   */
  iterator(offset, fromOffset, toOffset) {
    let {from, to} = this._clamp(fromOffset, toOffset);
    offset = Math.max(from, offset);
    offset = Math.min(to, offset);
    let it = this._tree.iterator(offset, from, to);
    return new TextIterator(it, offset, from, to, this._length);
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
   * @return {!{text: !Text, removed: string}}
   */
  replace(fromOffset, toOffset, insertion) {
    let {from, to} = this._clamp(fromOffset, toOffset);
    let split = this._tree.split(from, to);

    let removed = '';
    let first = '';
    let last = '';
    for (let i = 0; i < split.middle.length; i++) {
      let data = split.middle[i];
      let fromOffset = 0;
      let toOffset = data.length;
      if (i === 0) {
        fromOffset = from - split.left.metrics().length;
        first = data.substring(0, fromOffset);
      }
      if (i === split.middle.length - 1) {
        toOffset = data.length - (this._length - split.right.metrics().length - to);
        last = data.substring(toOffset);
      }
      removed += data.substring(fromOffset, toOffset);
    }

    let chunks = [];
    if (first.length + insertion.length + last.length > kDefaultChunkSize &&
        first.length + insertion.length <= kDefaultChunkSize) {
      // For typical editing scenarios, we are most likely to replace at the
      // end of |insertion| next time.
      chunks = chunkContent(last, this._measurer, first + insertion);
    } else {
      chunks = chunkContent(first + insertion + last, this._measurer);
    }

    let tree = Tree.build(chunks, this._measurer.defaultHeight, this._measurer.defaultWidth, split.left, split.right);
    let text = new Text(tree, this._measurer);
    return {text, removed};
  }

  /**
   * @param {number} offset
   * @return {?Location}
   */
  offsetToLocation(offset) {
    let found = this._tree.findByOffset(offset);
    if (found.location === null || found.data === null)
      return found.location;
    return Unicode.locateInStringByOffset(found.data, found.location, offset, this._measurer);
  }

  /**
   * @param {!Position} position
   * @param {boolean=} strict
   * @return {!Location}
   */
  positionToLocation(position, strict) {
    let found = this._tree.findByPosition(position, !!strict);
    if (found.data === null)
      return found.location;
    return Unicode.locateInStringByPosition(found.data, found.location, found.clampedPosition, this._measurer, strict);
  }

  /**
   * @param {!Point} point
   * @param {!RoundMode} roundMode
   * @param {boolean=} strict
   * @return {!Location}
   */
  pointToLocation(point, roundMode, strict) {
    let found = this._tree.findByPoint(point, !!strict);
    if (found.data === null)
      return found.location;
    return Unicode.locateInStringByPoint(found.data, found.location, found.clampedPoint, this._measurer, roundMode, strict);
  }
}

Text.test = {};

/**
 * @param {!Array<string>} chunks
 * @param {!Measurer} measurer
 * @return {!Text}
 */
Text.test.fromChunks = function(chunks, measurer) {
  let nodes = chunks.map(chunk => ({data: chunk, metrics: Unicode.metricsFromString(chunk, measurer)}));
  return new Text(Tree.build(nodes, measurer.defaultHeight, measurer.defaultWidth), measurer);
};

/**
 * @param {number}
 */
Text.test.setDefaultChunkSize = function(chunkSize) {
  kDefaultChunkSize = chunkSize;
};

const savedDefaultChunkSize = kDefaultChunkSize;

Text.test.restoreChunkSize = function() {
  kDefaultChunkSize = savedDefaultChunkSize;
}
