import { Random } from "./Random.mjs";
import { Metrics } from "./Metrics.mjs";
import { RoundMode, Unicode } from "./Unicode.mjs";
import { Tree } from "./Tree.mjs";
import { trace } from "../core/Trace.mjs";

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
  chunks.push({data: firstChunk, metrics: Metrics.fromString(firstChunk, measurer)});
  while (index < content.length) {
    let length = Math.min(content.length - index, kDefaultChunkSize);
    if (!Unicode.isValidOffset(content, index + length))
      length++;
    let chunk = content.substring(index, index + length);
    chunks.push({data: chunk, metrics: Metrics.fromString(chunk, measurer)});
    index += length;
  }
  if (!chunks.length)
    chunks.push({data: '', metrics: Metrics.fromString('', measurer)});
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
   * @return {!Text.Iterator}
   */
  iterator(offset, fromOffset, toOffset) {
    let {from, to} = this._clamp(fromOffset, toOffset);
    offset = Math.max(from, offset);
    offset = Math.min(to, offset);
    let it = this._tree.iterator(offset, from, to);
    return new Text.Iterator(it, offset, from, to, this._length);
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
    return Metrics.stringOffsetToLocation(found.data, found.location, offset, this._measurer);
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
    return Metrics.stringPositionToLocation(found.data, found.location, found.clampedPosition, this._measurer, strict);
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
    return Metrics.stringPointToLocation(found.data, found.location, found.clampedPoint, this._measurer, roundMode, strict);
  }
}

Text.Iterator = class {
  /**
   * @param {!TreeIterator} iterator
   * @param {number} offset
   * @param {number} from
   * @param {number} to
   * @param {number} length
   */
  constructor(iterator, offset, from, to, length) {
    this._iterator = iterator;
    this._from = from;
    this._to = to;
    this._length = length;

    this.offset = offset;
    this._chunk = this._iterator.data;
    this._pos = offset - this._iterator.before;
    this.current = this.outOfBounds() ? undefined : this._chunk[this._pos];
  }

  /**
   * @param {number} from
   * @param {number} to
   */
  setConstraints(from, to) {
    from = Math.max(from, 0);
    to = Math.min(to, this._length);
    console.assert(from - 1 <= this.offset && this.offset <= to, 'Current offset does not belong to new constraints');
    this._from = from;
    this._to = to;
    this._iterator._from = from;
    this._iterator._to = to;
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
      let chunk = iterator.data;
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
      let chunk = iterator.data;
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
      this._chunk = this._iterator.data;
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
      this._chunk = this._iterator.data;
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
        searchWindow += endIterator.data;
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
        this.offset = this._to;
        return false;
      }
      this._chunk = this._iterator.data;
      this._pos = 0;
      this.current = this._chunk[this._pos];
    }
  }

  /**
   * @return {!Text.Iterator}
   */
  clone() {
    let it = this._iterator.clone();
    return new Text.Iterator(it, this.offset, this._from, this._to, this._length);
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
        this._chunk = this._iterator.data;
      }
    } else {
      while (this._pos < 0 && this._iterator.prev()) {
        this._chunk = this._iterator.data;
        this._pos += this._chunk.length;
      }
    }
    this.current = this.outOfBounds() ? undefined : this._chunk[this._pos];
    return x;
  }

  /**
   * @param {number} offset
   */
  reset(offset) {
    this.advance(offset - this.offset);
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
  let nodes = chunks.map(chunk => ({data: chunk, metrics: Metrics.fromString(chunk, measurer)}));
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
