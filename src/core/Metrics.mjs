// Default width optimization saves:
// - 100MB in (system) memory on jquery.min.js (87MB total text size);
// - 300KB in total memory on index.js (5,5KB total text size).
// Is it worth it?

/**
 * @typedef {{
 *   length: number,
 *   lines: number|undefined,
 *   first: number,
 *   firstWidth: number|undefined,
 *   last: number,
 *   lastWidth: number|undefined,
 *   longest: number,
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
 *   offset: number|undefined,
 *   line: number|undefined,
 *   column: number|undefined,
 *   x: number|undefined,
 *   y: number|undefined,
 * }} PartialLocation;
 */

/**
 * @interface
 */
class Measurer {
  constructor() {
    this.defaultWidth = 1;
    this.defaultHeight = 1;
  }

  /**
   * Returns the total width of a chunk.
   * It is guaranteed that chunk does not contain line breaks.
   * Return 0 when measured width is equal to |defaultWidth * chunk.length|
   * to save some memory and computation.
   * @param {string} chunk
   * @return {number}
   */
  measureChunk(chunk) {
  }
};

export let Metrics = {};

/** @type {!Location} */
Metrics.origin = { offset: 0, line: 0, column: 0, x: 0, y: 0 };

/**
 * @param {!Location} location
 * @param {!Metrics} metrics
 * @param {!Measurer} measurer
 * @return {!Location}
 */
Metrics.advanceLocation = function(location, metrics, measurer) {
  let result = {
    offset: location.offset + metrics.length,
    line: location.line + (metrics.lines || 0),
    column: metrics.last + (metrics.lines ? 0 : location.column),
    x: (metrics.lastWidth || metrics.last * measurer.defaultWidth) + (metrics.lines ? 0 : location.x)
  };
  result.y = result.line * measurer.defaultHeight;
  return result;
};

/**
 * @param {!Location} location
 * @param {!PartialLocation} key
 */
Metrics.locationIsGreater = function(location, key) {
  if (key.offset !== undefined)
    return location.offset > key.offset;
  if (key.line !== undefined)
    return location.line > key.line || (location.line === key.line && location.column > key.column);
  return location.y > key.y || (location.y === key.y && location.x > key.x);
};

/**
 * @param {!Location} location
 * @param {!PartialLocation} key
 */
Metrics.locationIsGreaterOrEqual = function(location, key) {
  if (key.offset !== undefined)
    return location.offset >= key.offset;
  if (key.line !== undefined)
    return location.line > key.line || (location.line === key.line && location.column >= key.column);
  return location.y > key.y || (location.y === key.y && location.x >= key.x);
};

/**
 * @param {!Metrics} metrics
 * @return {!Metrics}
 */
Metrics.clone = function(metrics) {
  let result = {
    length: metrics.length,
    last: metrics.last,
    first: metrics.first,
    longest: metrics.longest
  };
  if (metrics.lines)
    result.lines = metrics.lines;
  if (metrics.firstWidth)
    result.firstWidth = metrics.firstWidth;
  if (metrics.lastWidth)
    result.lastWidth = metrics.lastWidth;
  if (metrics.longestWidth)
    result.longestWidth = metrics.longestWidth;
  return result;
};

/**
 * @param {!Metrics} left
 * @param {!Metrics} right
 * @param {!Measurer} measurer
 * @return {!Metrics}
 */
Metrics.combine = function(left, right, measurer) {
  let result = {
    longest: Math.max(Math.max(left.longest, left.last + right.first), right.longest),
    first: left.first + (left.lines ? 0 : right.first),
    last: right.last + (right.lines ? 0 : left.last),
    length: left.length + right.length
  }
  if (left.lines || right.lines)
    result.lines = (left.lines || 0) + (right.lines || 0);
  if (left.firstWidth || (!left.lines && right.firstWidth)) {
    result.firstWidth = (left.firstWidth || left.first * measurer.defaultWidth) +
        (left.lines ? 0 : (right.firstWidth || right.first * measurer.defaultWidth));
  }
  if (right.lastWidth || (!right.lines && left.lastWidth)) {
    result.lastWidth = (right.lastWidth || right.last * measurer.defaultWidth) +
        (right.lines ? 0 : (left.lastWidth || left.last * measurer.defaultWidth));
  }
  if (left.longestWidth || right.longestWidth || left.lastWidth || right.firstWidth) {
    result.longestWidth = Math.max(left.longestWidth || left.longest * measurer.defaultWidth,
        right.longestWidth || right.longest * measurer.defaultWidth);
    result.longestWidth = Math.max(result.longestWidth,
        (left.lastWidth || left.last * measurer.defaultWidth) + (right.firstWidth || right.first * measurer.defaultWidth));
  }
  return result;
};

/**
 * @param {!Metrics} metrics
 * @param {!Measurer} measurer
 * @return {!Location}
 */
Metrics.toLocation = function(metrics, measurer) {
  return {
    line: metrics.lines || 0,
    column: metrics.last,
    offset: metrics.length,
    x: metrics.lastWidth || metrics.last * measurer.defaultWidth,
    y: (metrics.lines || 0) * measurer.defaultHeight
  };
};

/**
 * @param {string} chunk
 * @param {!Measurer} measurer
 * @return {!Metrics}
 */
Metrics.fromChunk = function(chunk, measurer) {
  let metrics = {
    length: chunk.length,
    first: 0,
    last: 0,
    longest: 0
  };
  let lines = 0;
  let index = 0;
  let longestWidth = 0;
  while (true) {
    let nextLine = chunk.indexOf('\n', index);
    if (index === 0) {
      metrics.first = nextLine === -1 ? chunk.length : nextLine;
      metrics.longest = metrics.first;

      let firstWidth = measurer.measureChunk(chunk.substring(0, metrics.first));
      if (firstWidth)
        metrics.firstWidth = firstWidth;
      else
        firstWidth = metrics.first * measurer.defaultWidth;
      longestWidth = Math.max(longestWidth, firstWidth);
    }

    if (nextLine === -1) {
      metrics.last = chunk.length - index;
      metrics.longest = Math.max(metrics.longest, metrics.last);

      let lastWidth = measurer.measureChunk(chunk.substring(index, chunk.length));
      if (lastWidth)
        metrics.lastWidth = lastWidth;
      else
        lastWidth = metrics.last * measurer.defaultWidth;
      longestWidth = Math.max(longestWidth, lastWidth);
      break;
    }

    let length = nextLine - index;
    metrics.longest = Math.max(metrics.longest, length);
    let width = measurer.measureChunk(chunk.substring(index, nextLine));
    if (!width)
      width = length * measurer.defaultWidth;
    longestWidth = Math.max(longestWidth, width);
    lines++;
    index = nextLine + 1;
  }
  if (lines)
    metrics.lines = lines;
  if (longestWidth !== metrics.longest * measurer.defaultWidth)
    metrics.longestWidth = longestWidth;
  return metrics;
};

/**
 * @param {string} chunk
 * @param {!Location} before
 * @param {!Position} position
 * @param {!Measurer} measurer
 * @param {boolean=} strict
 * @return {!Location}
 */
Metrics.chunkPositionToLocation = function(chunk, before, position, measurer, strict) {
  let {line, column, offset, x, y} = before;

  if (position.line < line || (position.line === line && position.column < column))
    throw 'Inconsistent';

  let index = 0;
  while (line < position.line) {
    let nextLine = chunk.indexOf('\n', index);
    if (nextLine === -1)
      throw 'Inconsistent';
    offset += (nextLine - index + 1);
    index = nextLine + 1;
    line++;
    y += measurer.defaultHeight;
    column = 0;
    x = 0;
  }

  let lineEnd = chunk.indexOf('\n', index);
  if (lineEnd === -1)
    lineEnd = chunk.length;

  let length = position.column - column;
  if (lineEnd - index < length) {
    if (strict)
      throw 'Position does not belong to text';
    length = lineEnd - index;
  }

  let width = measurer.measureChunk(chunk.substring(index, index + length));
  if (!width)
    width = length * measurer.defaultWidth;
  return {
    offset: offset + length,
    line: line,
    column: column + length,
    x: x + width,
    y: y
  };
};

/**
 * @param {string} chunk
 * @param {!Measurer} measurer
 * @param {number} desired
 * @return {!{width: number, length: number, overflow: boolean}}
 */
Metrics._chunkLengthForWidth = function(chunk, measurer, desired) {
  let length = 0;
  let width = 0;
  while (length < chunk.length) {
    let next = measurer.measureChunk(chunk[length]) || measurer.defaultWidth;
    if (width + next > desired)
      return {width, length, overflow: false};
    width += next;
    length++;
  }
  return {width, length, overflow: width < desired};
};

/**
 * @param {string} chunk
 * @param {!Location} before
 * @param {!Point} point
 * @param {!Measurer} measurer
 * @param {boolean=} strict
 * @return {!Location}
 */
Metrics.chunkPointToLocation = function(chunk, before, point, measurer, strict) {
  let {line, column, offset, x, y} = before;

  if (point.y < y || (point.y < y + measurer.defaultHeight && point.x < x))
    throw 'Inconsistent';

  let index = 0;
  while (y + measurer.defaultHeight <= point.y) {
    let nextLine = chunk.indexOf('\n', index);
    if (nextLine === -1)
      throw 'Inconsistent';
    offset += (nextLine - index + 1);
    index = nextLine + 1;
    line++;
    y += measurer.defaultHeight;
    column = 0;
    x = 0;
  }

  let lineEnd = chunk.indexOf('\n', index);
  if (lineEnd === -1)
    lineEnd = chunk.length;

  let {length, width, overflow} = Metrics._chunkLengthForWidth(chunk.substring(index, lineEnd), measurer, point.x - x);
  if (overflow) {
    if (length !== lineEnd - index)
      throw 'Inconsistent';
    if (strict)
      throw 'Position does not belong to text';
  }

  return {
    offset: offset + length,
    line: line,
    column: column + length,
    x: x + width,
    y: y
  };
};

/**
 * @param {string} chunk
 * @param {!Location} before
 * @param {number} offset
 * @param {!Measurer} measurer
 * @return {!Location}
 */
Metrics.chunkOffsetToLocation = function(chunk, before, offset, measurer) {
  if (chunk.length < offset - before.offset)
    throw 'Inconsistent';
  chunk = chunk.substring(0, offset - before.offset);
  let {line, column, x, y} = before;
  let index = 0;
  while (true) {
    let nextLine = chunk.indexOf('\n', index);
    if (nextLine !== -1) {
      line++;
      y += measurer.defaultHeight;
      column = 0;
      x = 0;
      index = nextLine + 1;
    } else {
      column += chunk.length - index;
      let width = measurer.measureChunk(chunk.substring(index, chunk.length));
      if (!width)
        width = (chunk.length - index) * measurer.defaultWidth;
      x += width;
      break;
    }
  }
  return {line, column, offset, x, y};
};
