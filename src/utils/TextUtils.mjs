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
 * @param {!Text} text
 * @param {number} offset
 * @return {number}
 */
TextUtils.clampOffset = function(text, offset) {
  return Math.max(0, Math.min(offset, text.lastOffset()));
}

/**
 * @param {!Text} text
 * @param {!OffsetRange} range
 * @return {!OffsetRange}
 */
TextUtils.clampRange = function(text, range) {
  return {from: TextUtils.clampOffset(text, range.from), to: TextUtils.clampOffset(text, range.to)};
}
