export let RoundMode = {
  Floor: 0,
  Round: 1,
  Ceil: 2
};

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
 * }} TextMetrics;
 */

 /**
 * Measurer converts code points to widths (and default height).
 * It is designed to work exclusively with an additive metric.
 *
 * @interface
 */
export class Measurer {
  /**
   * The default width of a code point. Note that code points from Supplementary Planes
   * cannot be given default width.
   * Total width of a |string| with all default width code points will be
   * |string.length * measurer.defaultWidth|.
   *
   * @return {number}
   */
  defaultWidth() {
  }

  /**
   * The default height of a code point. Note that we only support fixed height,
   * so any code point height equals to default.
   *
   * @type {number}
   */
  defaultHeight() {
  }

  /**
   * Regex for strings which consist only of characters with default width and height.
   * Used for fast-path calculations.
   *
   * @return {?RegExp}
   */
  defaultRegex() {
  }

  /**
   * Measures the width of a single BMP character.
   * Note that char.length === 1, meaning it has a single code unit and code point.
   *
   * @param {string} char
   */
  measureBMP(char) {
  }

  /**
   * Measures the width of a single Supplementary character.
   * Note that char.length === 2, meaning it has two code units, but still a single code point.
   *
   * @param {string} char
   */
  measureSupplementary(char) {
  }
};

/**
 * This class calculates metrics for string chunks.
 * Internally it always measures a single code point and caches the result.
 */
export class Metrics {
  /**
   * @param {!Measurer} measurer
   */
  constructor(measurer) {
    this.defaultWidth = measurer.defaultWidth();
    this.defaultHeight = measurer.defaultHeight();
    this._defaultRegex = measurer.defaultRegex();
    this._measureBMP = measurer.measureBMP.bind(measurer);
    this._measureSupplementary = measurer.measureSupplementary.bind(measurer);

    this._bmp = new Float32Array(65536);
    this._bmpDefault = new Uint8Array(65536);
    this._bmpDefault.fill(2);
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
      let {width, columns} = this._measureString(s, offset, lineEndOffset);
      let fullWidth = width || (columns * this.defaultWidth);

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
    if (longestWidth !== metrics.longestColumns * this.defaultWidth)
      metrics.longestWidth = longestWidth;
    return metrics;
  }

  /**
   * Returns location of a specific position in a string.
   *
   * |before| is a location at the start of a string, and |position| is the one
   * we are locating. Returned location is absolute, not relative to |before|.
   *
   * If |strict|, throws on out-of-bounds positions.
   *
   * @param {string} s
   * @param {!Location} before
   * @param {!Position} position
   * @param {boolean=} strict
   * @return {!Location}
   */
  locateByPosition(s, before, position, strict) {
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
      y += this.defaultHeight;
      column = 0;
      x = 0;
    }

    let lineEndOffset = s.indexOf('\n', lineStartOffset);
    if (lineEndOffset === -1)
      lineEndOffset = s.length;

    let {offset, columns, width} = this._locateByColumn(s, lineStartOffset, lineEndOffset, position.column - column);
    if (offset === -1) {
      if (strict)
        throw 'Position is out of bounds';
      offset = lineEndOffset;
    }
    return {
      offset: before.offset + offset,
      line: line,
      column: column + columns,
      x: x + width,
      y: y
    };
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
    let {line, column, x, y} = before;

    if (point.y < y || (point.y < y + this.defaultHeight && point.x < x))
      throw 'Inconsistent';

    let lineStartOffset = 0;
    while (y + this.defaultHeight <= point.y) {
      let lineBreakOffset = s.indexOf('\n', lineStartOffset);
      if (lineBreakOffset === -1)
        throw 'Inconsistent';
      line++;
      y += this.defaultHeight;
      column = 0;
      x = 0;
      lineStartOffset = lineBreakOffset + 1;
    }

    let lineEndOffset = s.indexOf('\n', lineStartOffset);
    if (lineEndOffset === -1)
      lineEndOffset = s.length;

    let {offset, columns, width} = this._locateByWidth(s, lineStartOffset, lineEndOffset, point.x - x, roundMode);
    if (offset === -1) {
      if (strict)
        throw 'Point is out of bounds';
      offset = lineEndOffset;
    }
    return {
      offset: before.offset + offset,
      line: line,
      column: column + columns,
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
   * @param {!Measurer} measurer
   * @param {boolean=} strict
   * @return {!Location}
   */
  locateByOffset(s, before, offset, strict) {
    if (s.length < offset - before.offset)
      throw 'Inconsistent';

    if (!Metrics.isValidOffset(s, offset - before.offset)) {
      if (strict)
        throw 'Offset belongs to a middle of surrogate pair';
      offset--;
      if (offset < before.offset || !Metrics.isValidOffset(s, offset - before.offset))
        throw 'Inconsistent';
    }

    let {line, column, x, y} = before;
    offset -= before.offset;

    let lineStartOffset = 0;
    let lineBreakOffset = s.indexOf('\n', lineStartOffset);
    while (lineBreakOffset !== -1 && lineBreakOffset < offset) {
      line++;
      y += this.defaultHeight;
      column = 0;
      x = 0;
      lineStartOffset = lineBreakOffset + 1;
      lineBreakOffset = s.indexOf('\n', lineStartOffset);
    }

    let {width, columns} = this._measureString(s, lineStartOffset, offset);
    if (!width)
      width = columns * this.defaultWidth;
    return {
      offset: offset + before.offset,
      line: line,
      column: column + columns,
      x: x + width,
      y: y
    };
  }

  /**
   * Chunks content and measures every chunk.
   *
   * @param {number} chunkSize
   * @param {string} content
   * @param {string=} firstChunk
   * @return {!Array<!{data: string, metrics: !TextMetrics}>}
   */
  chunkString(chunkSize, content, firstChunk) {
    let index = 0;
    let chunks = [];
    if (firstChunk)
      chunks.push({data: firstChunk, metrics: this.forString(firstChunk)});
    while (index < content.length) {
      let length = Math.min(content.length - index, chunkSize);
      if (!Metrics.isValidOffset(content, index + length))
        length++;
      let chunk = content.substring(index, index + length);
      chunks.push({data: chunk, metrics: this.forString(chunk)});
      index += length;
    }
    if (!chunks.length)
      chunks.push({data: '', metrics: this.forString('')});
    return chunks;
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
   * Returns the width of a single code point from the Unicode Basic Multilingual Plane.
   * This method does not return zero even for default width.
   * Note that |codePoint| should always be less than 0x10000.
   *
   * @param {number} codePoint
   * @return {number}
   */
  measureBMPCodePoint(codePoint) {
    if (this._bmpDefault[codePoint] === 2) {
      let width = this._measureBMP(String.fromCharCode(codePoint));
      this._bmp[codePoint] = width;
      this._bmpDefault[codePoint] = width === this.defaultWidth ? 1 : 0;
    }
    return this._bmp[codePoint];
  }

  /**
   * Returns the width of a single code point from a Supplemetary Plane.
   * This method does not return zero even for default width.
   * Note that |codePoint| should always be greater or equal than 0x10000.
   *
   * @param {number} codePoint
   * @return {number}
   */
  measureSupplementaryCodePoint(codePoint) {
    if (this._supplementary[codePoint] === undefined)
      this._supplementary[codePoint] = this._measureSupplementary(String.fromCodePoint(codePoint));
    return this._supplementary[codePoint];
  }

  /**
   * Returns the total width of a substring and the number of columns (code points) inside.
   * It should be guaranteed that string does not contain line breaks.
   *
   * Returns zero instead of width when it is equal to |defaultWidth * columns|
   * to save some memory and computation.
   * Does not ever return zero if the substring contains any code points
   * from Supplementary Planes.
   *
   * @param {string} s
   * @param {number} from
   * @param {number} to
   * @return {!{columns: number, width: number}}
   */
  _measureString(s, from, to) {
    if (from === to)
      return {width: 0, columns: 0};

    if (this._defaultRegex && this._defaultRegex.test(s))
      return {width: 0, columns: to - from};

    let defaults = 0;
    let result = 0;
    let columns = 0;
    for (let i = from; i < to; ) {
      let charCode = s.charCodeAt(i);
      if (charCode === Metrics._lineBreakCharCode)
        throw 'Cannot measure line breaks';
      if (charCode >= 0xD800 && charCode <= 0xDBFF && i + 1 < to) {
        let codePoint = s.codePointAt(i);
        if (this._supplementary[codePoint] === undefined)
          this._supplementary[codePoint] = this._measureSupplementary(s.substring(i, i + 2));
        result += this._supplementary[codePoint];
        i += 2;
        columns++;
      } else {
        if (this._bmpDefault[charCode] === 2) {
          let width = this._measureBMP(s[i]);
          this._bmp[charCode] = width;
          this._bmpDefault[charCode] = width === this.defaultWidth ? 1 : 0;
        }
        if (this._bmpDefault[charCode] === 1)
          defaults++;
        else
          result += this._bmp[charCode];
        i++;
        columns++;
      }
    }
    let width = defaults === to - from ? 0 : result + defaults * this.defaultWidth;
    return {width, columns};
  }

  /**
   * Returns measurements for a particular column (code point) in a given substring.
   *
   * Returned |offset| does belong to [from, to], and |column| and |width| measure the
   * [from, offset] substring.
   * If there is not enough columns in the substring, returns |offset === -1| instead,
   * and measures [from, to] into |column| and |width|.
   *
   * Does not return zero width even if it is default.
   *
   * @param {string} s
   * @param {number} from
   * @param {number} to
   * @param {number} column
   * @return {!{offset: number, columns: number, width: number}}
   */
  _locateByColumn(s, from, to, column) {
    if (!column)
      return {offset: from, columns: column, width: 0};

    if (this._defaultRegex && this._defaultRegex.test(s)) {
      if (column > to - from)
        return {offset: -1, columns: to - from, width: (to - from) * this.defaultWidth};
      return {offset: from + column, columns: column, width: column * this.defaultWidth};
    }

    let columns = 0;
    let width = 0;
    for (let offset = from; offset < to; ) {
      let charCode = s.charCodeAt(offset);
      if (charCode >= 0xD800 && charCode <= 0xDBFF && offset + 1 < to) {
        let codePoint = s.codePointAt(offset);
        if (this._supplementary[codePoint] === undefined)
          this._supplementary[codePoint] = this._measureSupplementary(s.substring(offset, offset + 2));
        width += this._supplementary[codePoint];
        columns++;
        offset += 2;
      } else {
        if (this._bmpDefault[charCode] === 2) {
          let charCodeWidth = this._measureBMP(s[offset]);
          this._bmp[charCode] = charCodeWidth;
          this._bmpDefault[charCode] = charCodeWidth === this.defaultWidth ? 1 : 0;
        }
        width += this._bmp[charCode];
        columns++;
        offset++;
      }
      if (columns === column)
        return {offset, columns, width};
    }
    return {offset: -1, columns, width};
  }

  /**
   * Returns measurements for a particular code point at given width in a given substring.
   *
   * Returned |offset| does belong to [from, to], and |column| and |width| measure the
   * [from, offset] substring.
   * If the substrig is not wide enough, returns |offset === -1| instead,
   * and measures [from, to] into |column| and |width|.
   *
   * Does not return zero width even if it is default.
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
   * @return {!{offset: number, columns: number, width: number}}
   */
  _locateByWidth(s, from, to, width, roundMode) {
    if (!width)
      return {offset: from, columns: 0, width: 0};

    if (this._defaultRegex && this._defaultRegex.test(s)) {
      if (width > (to - from) * this.defaultWidth)
        return {offset: -1, columns: to - from, width: (to - from) * this.defaultWidth};
      let offset = Math.floor(width / this.defaultWidth);
      let left = offset * this.defaultWidth;
      if (left === width || roundMode === RoundMode.Floor)
        return {offset: from + offset, columns: offset, width: left};
      let right = left + this.defaultWidth;
      if (roundMode === RoundMode.Ceil || width - left > right - width)
        return {offset: from + offset + 1, columns: offset + 1, width: right};
      return {offset: from + offset, columns: offset, width: left};
    }

    let columns = 0;
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
        if (this._bmpDefault[charCode] === 2) {
          let charCodeWidth = this._measureBMP(s[offset]);
          this._bmp[charCode] = charCodeWidth;
          this._bmpDefault[charCode] = charCodeWidth === this.defaultWidth ? 1 : 0;
        }
        nextW = w + this._bmp[charCode];
        nextOffset = offset + 1;
      }

      if (nextW > width) {
        if (w === width || roundMode === RoundMode.Floor)
          return {offset: offset, columns: columns, width: w};
        if (roundMode === RoundMode.Ceil || width - w > nextW - width)
          return {offset: nextOffset, columns: columns + 1, width: nextW};
        return {offset: offset, columns: columns, width: w};
      }

      columns++;
      offset = nextOffset;
      w = nextW;
    }

    if (w < width)
      return {offset: -1, columns: columns, width: w};
    return {offset: to, columns: columns, width: w};
  }
};

Metrics.bmpRegex = /^[\u{0000}-\u{d7ff}]*$/u;
Metrics.asciiRegex = /^[\u{0020}-\u{007e}]*$/u;
Metrics.whitespaceRegex = /\s/u;
Metrics.anythingRegex = /.*/u;

Metrics._lineBreakCharCode = '\n'.charCodeAt(0);
