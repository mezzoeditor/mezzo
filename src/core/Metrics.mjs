import { RoundMode, Unicode } from "./Unicode.mjs";

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

export let Metrics = {};

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

  let {offset, columns, width} = measurer.locateByColumn(s, lineStartOffset, lineEndOffset, position.column - column);
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
 * @param {string} s
 * @param {!Location} before
 * @param {!Point} point
 * @param {!Measurer} measurer
 * @param {!RoundMode} roundMode
 * @param {boolean=} strict
 * @return {!Location}
 */
Metrics.stringPointToLocation = function(s, before, point, measurer, roundMode, strict) {
  let {line, column, x, y} = before;

  if (point.y < y || (point.y < y + measurer.defaultHeight && point.x < x))
    throw 'Inconsistent';

  let lineStartOffset = 0;
  while (y + measurer.defaultHeight <= point.y) {
    let lineBreakOffset = s.indexOf('\n', lineStartOffset);
    if (lineBreakOffset === -1)
      throw 'Inconsistent';
    line++;
    y += measurer.defaultHeight;
    column = 0;
    x = 0;
    lineStartOffset = lineBreakOffset + 1;
  }

  let lineEndOffset = s.indexOf('\n', lineStartOffset);
  if (lineEndOffset === -1)
    lineEndOffset = s.length;

  let {offset, columns, width} = measurer.locateByWidth(s, lineStartOffset, lineEndOffset, point.x - x, roundMode);
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
