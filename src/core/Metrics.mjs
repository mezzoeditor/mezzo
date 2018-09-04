export let RoundMode = {
  Floor: 0,
  Round: 1,
  Ceil: 2
};

/**
 * This class calculates metrics for string chunks. It is designed to work
 * exclusively with an additive metric. Note that we only support fixed height equal to one.
 *
 * Internally it always measures a single code point and caches the result.
 */
export class Metrics {
  /**
   * Regex for strings which consist only of characters of width equal to one.
   * Used for fast-path calculations.
   * @param {?RegExp} widthOneRegex
   *
   * Measures the width of a single BMP character.
   * Note that char.length === 1, meaning it has a single code unit and code point.
   * @param {function(string):number} measureBMP
   *
   * Measures the width of a single Supplementary character.
   * Note that char.length === 2, meaning it has two code units, but still a single code point.
   * @param {function(string):number} measureSupplementary
   */
  constructor(widthOneRegex, measureBMP, measureSupplementary) {
    this._widthOneRegex = widthOneRegex;
    this._measureBMP = measureBMP;
    this._measureSupplementary = measureSupplementary;
    this._bmp = new Float32Array(65536);
    this._bmp.fill(-1);
    this._supplementary = {};
  }

  /**
   * Returns metrics for a string. See |TextMetrics| for definition.
   *
   * @return {!TextMetrics}
   */
  forString(s) {
    let metrics = {
      length: s.length,
      firstWidth: 0,
      lastWidth: 0,
      longestWidth: 0
    };

    let lineBreaks = 0;
    let offset = 0;
    while (true) {
      let lineBreakOffset = s.indexOf('\n', offset);
      let lineEndOffset = lineBreakOffset === -1 ? s.length : lineBreakOffset;
      let width = this._measureString(s, offset, lineEndOffset);

      if (offset === 0)
        metrics.firstWidth = width;
      if (lineBreakOffset === -1)
        metrics.lastWidth = width;

      metrics.longestWidth = Math.max(metrics.longestWidth, width);
      if (lineBreakOffset === -1)
        break;

      lineBreaks++;
      offset = lineEndOffset + 1;
    }
    if (lineBreaks)
      metrics.lineBreaks = lineBreaks;
    return metrics;
  }

  /**
   * Performs a word wrap of the passed string.
   * Returns the list of chunks which should be separated by the soft new line.
   *
   * |x| is the starting x-coordinate before the first character of the string,
   * and |limit| is the maximum line length.
   *
   * @param {string} s
   * @param {number} x
   * @param {number} limit
   * @param {string} lastChar
   * @return {!Array<!TextMetrics>}
   */
  wordWrap(s, x, limit, lastChar) {
    // TODO: this is very slow because of test() call here and
    // in _measureString. We should optimize and increase kWordWrapRechunkSize.
    const chunks = [];

    let start = 0;
    let offset = 0;
    let wordEnding = false;
    let metrics = {length: 0, firstWidth: 0, lastWidth: 0, longestWidth: 0};
    const canWrapFirstWord = Metrics.nonWordCharacterRegex.test(lastChar);

    const lineEndMetrics = () => {
      if (!metrics.lineBreaks)
        metrics.firstWidth = metrics.lastWidth;
      metrics.longestWidth = Math.max(metrics.longestWidth, metrics.lastWidth);
    };

    const wrap = () => {
      lineEndMetrics();
      chunks.push(metrics);
      metrics = {length: 0, firstWidth: 0, lastWidth: 0, longestWidth: 0};
      x = 0;
    };

    const wordEnded = () => {
      if (offset > start) {
        const width = this._measureString(s, start, offset);
        if (x + width > limit && x > 0 && (canWrapFirstWord || start > 0))
          wrap();
        metrics.lastWidth += width;
        metrics.length += offset - start;
        x += width;
        start = offset;
      }
      wordEnding = false;
    };

    const lineBreakMetrics = () => {
      lineEndMetrics();
      metrics.lineBreaks = (metrics.lineBreaks || 0) + 1;
      x = 0;
      metrics.lastWidth = 0;
    };

    while (offset < s.length) {
      if (s[offset] === '\n') {
        wordEnded();
        start++;
        metrics.length++;
        lineBreakMetrics();
      } else if (Metrics.nonWordCharacterRegex.test(s[offset])) {
        // TODO: does this work with unicode?
        wordEnding = true;
      } else if (wordEnding) {
        wordEnded();
      }
      offset++;
    }
    wordEnded();
    if (metrics.length > 0)
      chunks.push(metrics);

    return chunks;
  }

  /**
   * Returns location of a specific point in a string.
   *
   * |before| is a location at the start of a string, and |point| is the one
   * we are locating. Returned location is absolute, not relative to |before|.
   *
   * When the width does not point exaclty between two code points, |roundMode| controls
   * which code point to snap to:
   *   - RoundMode.Floor snaps to the first code point;
   *   - RoundMode.Ceil snaps to the second code point;
   *   - RoundMode.Round snaps to the first or second code point depending on
   *     whether width is further from the left or right border of the second code point.
   *
   * If |strict|, throws on out-of-bounds positions.
   *
   * @param {string} s
   * @param {!Location} before
   * @param {!Point} point
   * @param {!RoundMode} roundMode
   * @param {boolean=} strict
   * @return {!Location}
   */
  locateByPoint(s, before, point, roundMode, strict) {
    let {x, y} = before;

    if (point.y < y || (point.y < y + 1 && point.x < x))
      throw new Error('Inconsistent');

    let lineStartOffset = 0;
    while (y + 1 <= point.y) {
      let lineBreakOffset = s.indexOf('\n', lineStartOffset);
      if (lineBreakOffset === -1)
        throw new Error('Inconsistent');
      y += 1;
      x = 0;
      lineStartOffset = lineBreakOffset + 1;
    }

    let lineEndOffset = s.indexOf('\n', lineStartOffset);
    if (lineEndOffset === -1)
      lineEndOffset = s.length;

    let {offset, width} = this._locateByWidth(s, lineStartOffset, lineEndOffset, point.x - x, roundMode);
    if (offset === -1) {
      if (strict)
        throw new Error('Point is out of bounds');
      offset = lineEndOffset;
    }
    return {
      offset: before.offset + offset,
      x: x + width,
      y: y
    };
  }

  /**
   * Returns location of a specific offset in a string.
   *
   * |before| is a location at the start of a string, and |offset| is the one
   * we are locating. Returned location is absolute, not relative to |before|.
   *
   * Throws if |offset| points to a middle of surrogate pair.
   *
   * @param {string} s
   * @param {!Location} before
   * @param {number} offset
   * @param {boolean=} strict
   * @return {!Location}
   */
  locateByOffset(s, before, offset, strict) {
    if (s.length < offset - before.offset)
      throw new Error('Inconsistent');

    if (!Metrics.isValidOffset(s, offset - before.offset)) {
      if (strict)
        throw new Error('Offset belongs to a middle of surrogate pair');
      offset--;
      if (offset < before.offset || !Metrics.isValidOffset(s, offset - before.offset))
        throw new Error('Inconsistent');
    }

    let {x, y} = before;
    offset -= before.offset;

    let lineStartOffset = 0;
    let lineBreakOffset = s.indexOf('\n', lineStartOffset);
    while (lineBreakOffset !== -1 && lineBreakOffset < offset) {
      y += 1;
      x = 0;
      lineStartOffset = lineBreakOffset + 1;
      lineBreakOffset = s.indexOf('\n', lineStartOffset);
    }

    let width = this._measureString(s, lineStartOffset, offset);
    return {
      offset: offset + before.offset,
      x: x + width,
      y: y
    };
  }

  /**
   * Fills a map between offset in (from..to] range to x-coordinate,
   * starting with |x| at position |from|.
   *
   * @param {!Float32Array} xmap
   * @param {!Int8Array} breaks
   * @param {string} s
   * @param {number} x
   * @param {number} multiplier
   */
  fillXMap(xmap, breaks, s, x, multiplier) {
    xmap[0] = x;
    for (let i = 0; i <= s.length; ) {
      let charCode = s.charCodeAt(i);
      if (charCode >= 0xD800 && charCode <= 0xDBFF && i + 1 < s.length) {
        xmap[i + 1] = x;
        let codePoint = s.codePointAt(i);
        breaks[i] = Metrics.isRtlCodePoint(codePoint) ? 1 : 0;
        breaks[i + 1] = 0;
        if (this._supplementary[codePoint] === undefined)
          this._supplementary[codePoint] = this._measureSupplementary(s.substring(i, i + 2));
        x += this._supplementary[codePoint] * multiplier;
        i += 2;
      } else {
        breaks[i] = Metrics.isRtlCodePoint(charCode) ? 1 : 0;
        if (this._bmp[charCode] === -1)
          this._bmp[charCode] = this._measureBMP(s[i]);
        x += this._bmp[charCode] * multiplier;
        i++;
      }
      xmap[i] = x;
    }
    breaks[s.length] = 0;
  }

  /**
   * Returns whether a specific offset does not split a surrogate pair.
   *
   * @param {string} s
   * @param {number} offset
   * @return {boolean}
   */
  static isValidOffset(s, offset) {
    if (offset <= 0 || offset >= s.length)
      return true;
    let charCode = s.charCodeAt(offset - 1);
    return charCode < 0xD800 || charCode > 0xDBFF;
  }

  /**
   * Returns  whether a specific code point is RTL.
   *
   * @param {number} codePoint
   * @return {boolean}
   */
  static isRtlCodePoint(codePoint) {
    return (codePoint >= 0x0590 && codePoint <= 0x089F) ||
        (codePoint === 0x200F) ||
        (codePoint >= 0xFB1D && codePoint <= 0xFDFF) ||
        (codePoint >= 0xFE70 && codePoint <= 0xFEFF) ||
        (codePoint >= 0x10800 && codePoint <= 0x10FFF) ||
        (codePoint >= 0x1E800 && codePoint <= 0x1EFFF);
  }

  /**
   * Returns whether a specific char code is a surrogate.
   *
   * @param {number} charCode
   * @return {boolean}
   */
  static isSurrogate(charCode) {
    return charCode >= 0xD800 && charCode <= 0xDBFF;
  }

  /**
   * Returns the total width of a substring, which must not contain line breaks.
   *
   * @param {string} s
   * @param {number} from
   * @param {number} to
   * @return {number}
   */
  _measureString(s, from, to) {
    if (from === to)
      return 0;

    // TODO: it seems that testing substring may be slower than the whole string.
    // Needs investigation.
    if (this._widthOneRegex && this._widthOneRegex.test(s.substring(from, to)))
      return to - from;

    let result = 0;
    for (let i = from; i < to; ) {
      let charCode = s.charCodeAt(i);
      if (charCode === Metrics._lineBreakCharCode)
        throw new Error('Cannot measure line breaks');
      if (charCode >= 0xD800 && charCode <= 0xDBFF && i + 1 < to) {
        let codePoint = s.codePointAt(i);
        if (this._supplementary[codePoint] === undefined)
          this._supplementary[codePoint] = this._measureSupplementary(s.substring(i, i + 2));
        result += this._supplementary[codePoint];
        i += 2;
      } else {
        if (this._bmp[charCode] === -1)
          this._bmp[charCode] = this._measureBMP(s[i]);
        result += this._bmp[charCode];
        i++;
      }
    }
    return result;
  }

  /**
   * Returns measurements for a particular code point at given width in a given substring.
   *
   * Returned |offset| does belong to [from, to], and measures the [from, offset] substring.
   * If the substrig is not wide enough, returns |offset === -1| instead,
   * and measures width of [from, to].
   *
   * When the width does not point exaclty between two code points, |roundMode| controls
   * which code point to snap to:
   *   - RoundMode.Floor snaps to the first code point;
   *   - RoundMode.Ceil snaps to the second code point;
   *   - RoundMode.Round snaps to the first or second code point depending on
   *     whether width is further from the left or right border of the second code point.
   *
   * @param {string} s
   * @param {number} from
   * @param {number} to
   * @param {number} width
   * @param {!RoundMode} roundMode
   * @return {!{offset: number, width: number}}
   */
  _locateByWidth(s, from, to, width, roundMode) {
    if (!width)
      return {offset: from, width: 0};

    if (this._widthOneRegex && this._widthOneRegex.test(s.substring(from, to))) {
      if (width > to - from)
        return {offset: -1, width: to - from};
      let offset = Math.floor(width);
      if (offset === width || roundMode === RoundMode.Floor)
        return {offset: from + offset, width: offset};
      if (roundMode === RoundMode.Ceil || width - offset > offset + 1 - width)
        return {offset: from + offset + 1, width: offset + 1};
      return {offset: from + offset, width: offset};
    }

    let w = 0;
    for (let offset = from; offset < to; ) {
      let charCode = s.charCodeAt(offset);
      let nextW;
      let nextOffset;
      if (charCode >= 0xD800 && charCode <= 0xDBFF && offset + 1 < to) {
        let codePoint = s.codePointAt(offset);
        if (this._supplementary[codePoint] === undefined)
          this._supplementary[codePoint] = this._measureSupplementary(s.substring(offset, offset + 2));
        nextW = w + this._supplementary[codePoint];
        nextOffset = offset + 2;
      } else {
        if (this._bmp[charCode] === -1)
          this._bmp[charCode] = this._measureBMP(s[offset]);
        nextW = w + this._bmp[charCode];
        nextOffset = offset + 1;
      }

      if (nextW > width) {
        if (w === width || roundMode === RoundMode.Floor)
          return {offset: offset, width: w};
        if (roundMode === RoundMode.Ceil || width - w > nextW - width)
          return {offset: nextOffset, width: nextW};
        return {offset: offset, width: w};
      }

      offset = nextOffset;
      w = nextW;
    }

    if (w < width)
      return {offset: -1, width: w};
    return {offset: to, width: w};
  }
};

Metrics.bmpRegex = /^[\u{0000}-\u{d7ff}]*$/u;
Metrics.asciiRegex = /^[\u{0020}-\u{007e}]*$/u;
Metrics.whitespaceRegex = /\s/u;
Metrics.anythingRegex = /.*/u;
Metrics.nonWordCharacterRegex = /^\W$/u;

Metrics._lineBreakCharCode = '\n'.charCodeAt(0);
