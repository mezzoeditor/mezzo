/**
 * @typedef {{
 *   line: number,
 *   start: !Location,
 *   end: !Location,
 *   from: number,
 *   to: number
 * }} Line;
 */

/**
 * @typedef {{
 *   from: number,
 *   to: number
 * }} Range;
 */

export class Frame {
  /**
   * @param {!Document} document
   * @param {!TextPosition} start
   * @param {number} width
   * @param {number} height
   */
  constructor(document, start, width, height) {
    let startLine = start.line;
    let startColumn = start.column;
    let endLine = Math.min(start.line + height, document.lineCount() - 1);
    let endColumn = startColumn + width;

    let lines = [];
    for (let line = startLine; line <= endLine; line++)
      lines.push({line, start: document.positionToLocation({line, column: 0})});
    for (let line = startLine; line <= endLine; line++) {
      if (line + 1 === document.lineCount()) {
        lines[line - startLine].end = document.lastLocation();
      } else {
        let nextStartOffset = line + 1 <= endLine
            ? lines[line + 1 - startLine].start.offset
            : document.positionToOffset({line: line + 1, column: 0});
        lines[line - startLine].end = document.offsetToLocation(nextStartOffset - 1);
      }
    }

    let sum = 0;
    for (let line of lines) {
      line.from = Math.min(line.start.offset + startColumn, line.end.offset);
      line.to = Math.min(line.start.offset + endColumn, line.end.offset);
      sum += line.to - line.from;
    }

    let diffs = [];
    for (let i = 0; i < lines.length - 1; i++)
      diffs[i] = {i, len: lines[i + 1].from - lines[i].to};
    diffs.sort((a, b) => a.len - b.len || a.i - b.i);
    let join = new Array(lines.length).fill(false);
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
    if (!ranges.length)
      this._range = {from: 0, to: 0};
    else
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
   * @return {?TextPosition}
   */
  offsetToPosition(offset) {
    if (this._lines.length <= 20) {
      for (let line of this._lines) {
        if (offset >= line.start.offset && offset <= line.end.offset)
          return {line: line.line, column: offset - line.start.offset};
      }
      return this._document.offsetToPosition(offset);
    }

    let left = 0;
    let right = this._lines.length - 1;
    if (offset < this._lines[left].start.offset || offset > this._lines[right].end.offset)
      return this._document.offsetToPosition(offset);
    while (true) {
      let middle = (left + right) >> 1;
      let line = this._lines[middle];
      if (offset < line.start.offset)
        right = middle - 1;
      else if (offset > line.end.offset)
        left = middle + 1;
      else
        return {line: line.line, column: offset - line.start.offset};
    }
  }

  /**
   * @param {!TextPosition} position
   * @param {boolean=} strict
   * @return {number}
   */
  positionToOffset(position, strict) {
    return this._document.positionToOffset(position, strict);
  }

  /**
   * @param {!Point} point
   * @param {boolean=} strict
   * @return {!Position}
   */
  pointToPosition(point, strict) {
    return this._document.pointToPosition(point, strict);
  }

  cleanup() {
    delete this._range._cache;
    for (let line of this._lines)
      delete line._cache;
    for (let range of this._ranges)
      delete range._cache;
  }
}
