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
 * @return {!TextPosition}
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
  return {line, column};
};
