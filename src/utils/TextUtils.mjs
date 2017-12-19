export let TextUtils = {};

/**
 * @param {string} chunk
 * @param {!Position} before
 * @param {!Position} after
 * @param {!Position} from
 * @param {!Position} to
 * @return {string}
 */
TextUtils.chunkContent = function(chunk, before, after, from, to) {
  let start = 0;
  if (from.offset !== undefined && from.offset > before.offset) {
    start = from.offset - before.offset;
  } else if (from.line === before.line && from.column > before.column) {
    let lineEnd = chunk.indexOf('\n');
    if (lineEnd === -1)
      lineEnd = chunk.length;
    start = Math.min(lineEnd, from.column - before.column);
  } else if (from.line > before.line) {
    for (let line = before.line; line < from.line; line++)
      start = chunk.indexOf('\n', start) + 1;
    let lineEnd = chunk.indexOf('\n', start);
    if (lineEnd === -1)
      lineEnd = chunk.length;
    start = Math.min(lineEnd, start + from.column);
  }

  let end = chunk.length;
  if (to.offset !== undefined && to.offset < after.offset) {
    end = chunk.length - (after.offset - to.offset);
  } else if (to.line === after.line && to.column < after.column) {
    end = chunk.length - (after.column - to.column);
  } else if (to.line < after.line) {
    for (let line = after.line; line > to.line; line--)
      end = chunk.lastIndexOf('\n', end - 1);
    let lineStart = chunk.lastIndexOf('\n', end - 1) + 1;
    end = Math.min(lineStart + to.column, end);
  }

  return chunk.substring(start, end);
};

/**
 * @param {!Document} document
 * @param {number} offset
 * @return {number}
 */
TextUtils.clampOffset = function(document, offset) {
  return Math.max(0, Math.min(offset, document.length()));
};

/**
 * @param {!Document} document
 * @param {!OffsetRange} range
 * @return {!OffsetRange}
 */
TextUtils.clampRange = function(document, range) {
  return {from: TextUtils.clampOffset(document, range.from), to: TextUtils.clampOffset(document, range.to)};
};

/**
 * @param {!Document} document
 * @param {number} line
 * @return {number}
 */
TextUtils.lineLength = function(document, line) {
  if (line >= document.lineCount())
    return 0;
  let start = document.positionToOffset({line, column: 0}, true /* clamp */);
  let end = document.positionToOffset({line: line + 1, column: 0}, true /* clamp */);
  return start === end ? 0 : end - start - 1;
};

/**
 * @param {!Document} document
 * @param {number} line
 * @return {?string}
 */
TextUtils.line = function(document, line) {
  if (line >= document.lineCount())
    return null;
  let from = document.positionToOffset({line, column: 0});
  let to = document.positionToOffset({line: line + 1, column: 0}, true /* clamp */);
  return document.content(from, to);
};

/**
 * @param {!Document} document
 * @param {number} line
 * @param {number} from
 * @param {number} to
 * @return {?string}
 */
TextUtils.lineChunk = function(document, line, from, to) {
  if (line >= document.lineCount())
    return null;
  from = document.positionToOffset({line, column: from}, true /* clamp */);
  to = document.positionToOffset({line, column: to}, true /* clamp */);
  return document.content(from, to);
};

/**
 * @param {!Document} document
 * @param {number} offset
 * @return {number}
 */
TextUtils.previousOffset = function(document, offset) {
  return Math.max(0, offset - 1);
};

/**
 * @param {!Document} document
 * @param {number} offset
 * @return {number}
 */
TextUtils.nextOffset = function(document, offset) {
  return Math.min(document.length(), offset + 1);
};

/**
 * @param {!Document} document
 * @param {number} offset
 * @return {number}
 */
TextUtils.lineStartOffset = function(document, offset) {
  let position = document.offsetToPosition(offset);
  return offset - position.column;
};

/**
 * @param {!Document} document
 * @param {number} offset
 * @return {number}
 */
TextUtils.lineEndOffset = function(document, offset) {
  let position = document.offsetToPosition(offset);
  if (position.line == document.lineCount() - 1)
    return document.length();
  return document.positionToOffset({line: position.line + 1, column: 0}) - 1;
};
