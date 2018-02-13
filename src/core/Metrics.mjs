/**
 * @typedef {{
 *   length: number,
 *   lines: number|undefined,
 *   first: number,
 *   last: number,
 *   longest: number,
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
 *   offset: number,
 *   line: number,
 *   column: number,
 * }} Location;
 */

/**
 * @typedef {{
 *   offset: number|undefined,
 *   line: number|undefined,
 *   column: number|undefined,
 * }} PartialLocation;
 */

export let Metrics = {};

/** @type {!Location} */
Metrics.origin = { offset: 0, line: 0, column: 0 };

/**
 * @param {!Location} location
 * @param {!Metrics} metrics
 * @return {!Location}
 */
Metrics.advanceLocation = function(location, metrics) {
  return {
    offset: location.offset + metrics.length,
    line: location.line + (metrics.lines || 0),
    column: metrics.last + (metrics.lines ? 0 : location.column)
  };
};

/**
 * @param {!Location} location
 * @param {!PartialLocation} key
 */
Metrics.locationIsGreater = function(location, key) {
  if (key.offset !== undefined)
    return location.offset > key.offset;
  return location.line > key.line || (location.line === key.line && location.column > key.column);
};

/**
 * @param {!Location} location
 * @param {!PartialLocation} key
 */
Metrics.locationIsGreaterOrEqual = function(location, key) {
  if (key.offset !== undefined)
    return location.offset >= key.offset;
  return location.line > key.line || (location.line === key.line && location.column >= key.column);
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
  return result;
};

/**
 * @param {!Metrics} left
 * @param {!Metrics} right
 * @return {!Metrics}
 */
Metrics.combine = function(left, right) {
  let result = {
    longest: Math.max(Math.max(left.longest, left.last + right.first), right.longest),
    first: left.first + (left.lines ? 0 : right.first),
    last: right.last + (right.lines ? 0 : left.last),
    length: left.length + right.length
  }
  if (left.lines || right.lines)
    result.lines = (left.lines || 0) + (right.lines || 0);
  return result;
};

/**
 * @param {!Metrics} metrics
 * @return {!Location}
 */
Metrics.toLocation = function(metrics) {
  return {
    line: metrics.lines || 0,
    column: metrics.last,
    offset: metrics.length
  };
};

/**
 * @param {string} chunk
 * @return {!Metrics}
 */
Metrics.fromChunk = function(chunk) {
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
Metrics.chunkPositionToOffset = function(chunk, before, position, clamp) {
  let {line, column, offset} = before;

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
Metrics.chunkOffsetToPosition = function(chunk, before, offset) {
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
