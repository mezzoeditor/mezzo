import { RoundMode } from "./Metrics.mjs";

/**
 * @typedef {{
 *   line: number,
 *   start: !Location,
 *   end: !Location,
 *   from: !Location,
 *   to: !Location
 * }} Line;
 */

export class Frame {
  /**
   * @param {!Document} document
   * @param {!Point} origin
   * @param {number} width
   * @param {number} height
   */
  constructor(document, origin, width, height) {
    let start = document.pointToLocation(origin);
    let end = document.pointToLocation({x: origin.x + width, y: origin.y + height}, RoundMode.Ceil);

    let lines = [];
    for (let line = start.line; line <= end.line; line++)
      lines.push({line, start: document.positionToLocation({line, column: 0})});
    for (let line = start.line; line <= end.line; line++) {
      if (line + 1 === document.lineCount()) {
        lines[line - start.line].end = document.lastLocation();
      } else {
        let nextStartOffset = line + 1 <= end.line
            ? lines[line + 1 - start.line].start.offset
            : document.positionToOffset({line: line + 1, column: 0});
        lines[line - start.line].end = document.offsetToLocation(nextStartOffset - 1);
      }
    }

    let sum = 0;
    for (let line of lines) {
      line.from = document.pointToLocation({x: origin.x, y: line.start.y});
      line.to = document.pointToLocation({x: origin.x + width, y: line.start.y}, RoundMode.Ceil);
      sum += line.to.offset - line.from.offset;
    }

    let diffs = [];
    for (let i = 0; i < lines.length - 1; i++)
      diffs[i] = {i, len: lines[i + 1].from.offset - lines[i].to.offset};
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
        ranges[ranges.length - 1].to = lines[i].to.offset;
      else
        ranges.push(new Frame.Range(document, lines[i].from.offset, lines[i].to.offset));
    }

    this._document = document;
    this._lines = lines;
    this._ranges = ranges;
    if (!ranges.length)
      this._range = {from: 0, to: 0};
    else
      this._range = {from: ranges[0].from, to: Math.min(document.length(), ranges[ranges.length - 1].to)};
    this._width = width;
    this._height = height;
    this._origin = origin;
  }

  /**
   * @return {!Document}
   */
  document() {
    return this._document;
  }

  /**
   * @return {!Point}
   */
  origin() {
    return this._origin;
  }

  /**
   * @return {number}
   */
  width() {
    return this._width;
  }

  /**
   * @return {number}
   */
  height() {
    return this._height;
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
    return cachedContent(this._document, line.from.offset, line.to.offset, line._cache, paddingLeft, paddingRight);
  }

  /**
   * @return {!Array<!Frame.Range>}
   */
  ranges() {
    return this._ranges;
  }

  /**
   * @return {!Range}
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
    return cachedContent(this._document, this._range.from, this._range.to, this._range._cache, paddingLeft, paddingRight);
  }

  /**
   * @param {number} offset
   * @return {?Position}
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
   * @param {number} offset
   * @return {?Point}
   */
  offsetToPoint(offset) {
    return this._document.offsetToPoint(offset);
  }

  /**
   * @param {!Position} position
   * @param {boolean=} strict
   * @return {number}
   */
  positionToOffset(position, strict) {
    return this._document.positionToOffset(position, strict);
  }

  /**
   * @param {!Point} point
   * @return {!Position}
   */
  pointToPosition(point) {
    return this._document.pointToPosition(point);
  }

  cleanup() {
    delete this._range._cache;
    for (let line of this._lines)
      delete line._cache;
    for (let range of this._ranges)
      delete range._cache;
  }
}

Frame.Range = class {
  /**
   * @param {!Document} document
   * @param {number} from
   * @param {number} to
   */
  constructor(document, from, to) {
    this._document = document;
    this.from = from;
    this.to = to;
  }

  /**
   * @param {number=} paddingLeft
   * @param {number=} paddingRight
   * @return {string}
   */
  content(paddingLeft = 0, paddingRight = 0) {
    if (!this._cache)
      this._cache = {};
    return cachedContent(this._document, this.from, this.to, this._cache, paddingLeft, paddingRight);
  }

  /**
   * @param {number=} paddingLeft
   * @param {number=} paddingRight
   * @return {!Text.Iterator}
   */
  iterator(paddingLeft = 0, paddingRight = 0) {
    let from = Math.max(0, this.from - paddingLeft);
    let to = Math.min(this._document.length(), this.to + paddingRight);
    return this._document.iterator(from, from, to);
  }
};

/**
 * @param {!Document} document
 * @param {number} from
 * @param {number} to
 * @param {{content: string, left: number, right: number}} cache
 * @param {number} left
 * @param {number} right
 * @return {string}
 */
function cachedContent(document, from, to, cache, left, right) {
  left = Math.min(left, from);
  right = Math.min(right, document.length() - to);
  if (cache._content === undefined || cache._left < left || cache._right < right) {
    cache._left = Math.max(left, cache._left || 0);
    cache._right = Math.max(right, cache._right || 0);
    cache._content = document.content(from - cache._left, to + cache._right);
  }
  return cache._content.substring(cache._left - left,
                                  cache._content.length - (cache._right - right));
}
