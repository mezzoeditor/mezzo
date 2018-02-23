import { Unicode } from "./Unicode.mjs";

/**
 * @typedef {{
 *   length: number,
 *   lineBreaks: number|undefined,
 *   firstColumns: number,
 *   firstWidth: number|undefined,
 *   lastColumns: number,
 *   lastWidth: number|undefined,
 *   longestColumns: number,
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
 *   from: number,
 *   to: number
 * }} Range;
 */

export let RoundMode = {
  Floor: 0,
  Round: 1,
  Ceil: 2
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
    line: location.line + (metrics.lineBreaks || 0),
    column: metrics.lastColumns + (metrics.lineBreaks ? 0 : location.column),
    x: (metrics.lastWidth || metrics.lastColumns * measurer.defaultWidth) + (metrics.lineBreaks ? 0 : location.x)
  };
  result.y = result.line * measurer.defaultHeight;
  return result;
};

/**
 * @param {!Metrics} metrics
 * @return {!Metrics}
 */
Metrics.clone = function(metrics) {
  let result = {
    length: metrics.length,
    lastColumns: metrics.lastColumns,
    firstColumns: metrics.firstColumns,
    longestColumns: metrics.longestColumns
  };
  if (metrics.lineBreaks)
    result.lineBreaks = metrics.lineBreaks;
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
  let defaultWidth = measurer.defaultWidth;
  let result = {
    longestColumns: Math.max(Math.max(left.longestColumns, left.lastColumns + right.firstColumns), right.longestColumns),
    firstColumns: left.firstColumns + (left.lineBreaks ? 0 : right.firstColumns),
    lastColumns: right.lastColumns + (right.lineBreaks ? 0 : left.lastColumns),
    length: left.length + right.length
  }
  if (left.lineBreaks || right.lineBreaks)
    result.lineBreaks = (left.lineBreaks || 0) + (right.lineBreaks || 0);
  if (left.firstWidth || (!left.lineBreaks && right.firstWidth)) {
    result.firstWidth =
        (left.firstWidth || left.firstColumns * defaultWidth) +
        (left.lineBreaks ? 0 : (right.firstWidth || right.firstColumns * defaultWidth));
  }
  if (right.lastWidth || (!right.lineBreaks && left.lastWidth)) {
    result.lastWidth =
        (right.lastWidth || right.lastColumns * defaultWidth) +
        (right.lineBreaks ? 0 : (left.lastWidth || left.lastColumns * defaultWidth));
  }
  if (left.longestWidth || right.longestWidth || left.lastWidth || right.firstWidth) {
    result.longestWidth = Math.max(
        left.longestWidth || left.longestColumns * defaultWidth,
        right.longestWidth || right.longestColumns * defaultWidth);
    result.longestWidth = Math.max(
        result.longestWidth,
        (left.lastWidth || left.lastColumns * defaultWidth) + (right.firstWidth || right.firstColumns * defaultWidth));
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
    line: metrics.lineBreaks || 0,
    column: metrics.lastColumns,
    offset: metrics.length,
    x: metrics.lastWidth || metrics.lastColumns * measurer.defaultWidth,
    y: (metrics.lineBreaks || 0) * measurer.defaultHeight
  };
};

/**
 * @param {string} s
 * @param {!Measurer} measurer
 * @return {!Metrics}
 */
Metrics.fromString = function(s, measurer) {
  let metrics = {
    length: s.length,
    firstColumns: 0,
    lastColumns: 0,
    longestColumns: 0
  };

  let lineBreaks = 0;
  let offset = 0;
  let longestWidth = 0;

  while (true) {
    let lineBreakOffset = s.indexOf('\n', offset);
    let lineEndOffset = lineBreakOffset === -1 ? s.length : lineBreakOffset;
    let {width, columns} = measurer.measureString(s, offset, lineEndOffset);
    let fullWidth = width || (columns * measurer.defaultWidth);

    if (offset === 0) {
      metrics.firstColumns = columns;
      if (width)
        metrics.firstWidth = width;
    }

    if (lineBreakOffset === -1) {
      metrics.lastColumns = columns;
      if (width)
        metrics.lastWidth = width;
    }

    metrics.longestColumns = Math.max(metrics.longestColumns, columns);
    longestWidth = Math.max(longestWidth, fullWidth);
    if (lineBreakOffset === -1)
      break;

    lineBreaks++;
    offset = lineEndOffset + 1;
  }

  if (lineBreaks)
    metrics.lineBreaks = lineBreaks;
  if (longestWidth !== metrics.longestColumns * measurer.defaultWidth)
    metrics.longestWidth = longestWidth;
  return metrics;
};

/**
 * @param {string} s
 * @param {!Location} before
 * @param {!Position} position
 * @param {!Measurer} measurer
 * @param {boolean=} strict
 * @return {!Location}
 */
Metrics.stringPositionToLocation = function(s, before, position, measurer, strict) {
  let {line, column, x, y} = before;

  if (position.line < line || (position.line === line && position.column < column))
    throw 'Inconsistent';

  let lineStartOffset = 0;
  while (line < position.line) {
    let lineBreakOffset = s.indexOf('\n', lineStartOffset);
    if (lineBreakOffset === -1)
      throw 'Inconsistent';
    lineStartOffset = lineBreakOffset + 1;
    line++;
    y += measurer.defaultHeight;
    column = 0;
    x = 0;
  }

  let lineEndOffset = s.indexOf('\n', lineStartOffset);
  if (lineEndOffset === -1)
    lineEndOffset = s.length;

  let {offset, columns, width} = measurer.locateInString(s, lineStartOffset, lineEndOffset, position.column - column);
  if (offset === -1) {
    if (strict)
      throw 'Position does not belong to text';
    offset = lineEndOffset;
  }
  return {
    offset: before.offset + offset,
    line: line,
    column: column + columns,
    x: x + width,
    y: y
  };
};

/**
 * @param {string} chunk
 * @param {!Measurer} measurer
 * @param {number} desired
 * @param {!RoundMode} roundMode
 * @return {!{width: number, length: number, columns: number, overflow: boolean}}
 */
Metrics._chunkLengthForWidth = function(chunk, measurer, desired, roundMode) {
  let length = 0;
  let width = 0;
  let columns = 0;
  while (length < chunk.length) {
    if (width === desired)
      return {width, length, columns, overflow: false};
    let nextLength = length + 1;
    let charCode = chunk.charCodeAt(length);
    let next;
    if (charCode >= 0xD800 && charCode <= 0xDBFF && length + 1 < chunk.length) {
      nextLength = length + 2;
      next = measurer.measureSupplementaryCodePoint(chunk.codePointAt(length));
    } else {
      next = measurer.measureBMPCodePoint(charCode);
    }
    if (width + next > desired) {
      if (roundMode === RoundMode.Round)
        roundMode = desired - width <= width + next - desired ? RoundMode.Floor : RoundMode.Ceil;
      return roundMode === RoundMode.Floor
          ? {width, length, columns, overflow: false}
          : {width: width + next, length: nextLength, columns: columns + 1, overflow: false};
    }
    width += next;
    length = nextLength;
    columns++;
  }
  return {width, length, columns, overflow: width < desired};
};

/**
 * @param {string} s
 * @param {!Location} before
 * @param {!Point} point
 * @param {!Measurer} measurer
 * @param {!RoundMode} roundMode
 * @param {boolean=} strict
 * @return {!Location}
 */
Metrics.stringPointToLocation = function(s, before, point, measurer, roundMode, strict) {
  let {line, column, offset, x, y} = before;

  if (point.y < y || (point.y < y + measurer.defaultHeight && point.x < x))
    throw 'Inconsistent';

  let index = 0;
  while (y + measurer.defaultHeight <= point.y) {
    let nextLine = s.indexOf('\n', index);
    if (nextLine === -1)
      throw 'Inconsistent';
    offset += (nextLine - index + 1);
    index = nextLine + 1;
    line++;
    y += measurer.defaultHeight;
    column = 0;
    x = 0;
  }

  let lineEnd = s.indexOf('\n', index);
  if (lineEnd === -1)
    lineEnd = s.length;

  let {length, width, overflow, columns} = Metrics._chunkLengthForWidth(s.substring(index, lineEnd), measurer, point.x - x, roundMode);
  if (overflow) {
    if (length !== lineEnd - index)
      throw 'Inconsistent';
    if (strict)
      throw 'Point does not belong to text';
  }

  return {
    offset: offset + length,
    line: line,
    column: column + columns,
    x: x + width,
    y: y
  };
};

/**
 * @param {string} s
 * @param {!Location} before
 * @param {number} offset
 * @param {!Measurer} measurer
 * @return {!Location}
 */
Metrics.stringOffsetToLocation = function(s, before, offset, measurer) {
  if (s.length < offset - before.offset)
    throw 'Inconsistent';

  if (!Unicode.isValidOffset(s, offset - before.offset))
    throw 'Offset belongs to a middle of surrogate pair';

  let {line, column, x, y} = before;
  offset -= before.offset;

  let lineStartOffset = 0;
  let lineBreakOffset = s.indexOf('\n', lineStartOffset);
  while (lineBreakOffset !== -1 && lineBreakOffset < offset) {
    line++;
    y += measurer.defaultHeight;
    column = 0;
    x = 0;
    lineStartOffset = lineBreakOffset + 1;
    lineBreakOffset = s.indexOf('\n', lineStartOffset);
  }

  let {width, columns} = measurer.measureString(s, lineStartOffset, offset);
  if (!width)
    width = columns * measurer.defaultWidth;
  return {
    offset: offset + before.offset,
    line: line,
    column: column + columns,
    x: x + width,
    y: y
  };
};
