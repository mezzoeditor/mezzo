export let RoundMode = {
  Floor: 0,
  Round: 1,
  Ceil: 2
};

/**
 * This interface calculates metrics for string chunks. It is designed to work
 * exclusively with an additive metric. Note that we only support fixed height equal to one.
 */
export class Metrics {
  /**
   * Returns metrics for a string. See |TextMetrics| for definition.
   * The resulting |state| should be passed to the next chunk being measured.
   *
   * @param {string} s
   * @param {*} state
   * @return {{metrics: !TextMetrics, state: *}}
   */
  forString(s, state) {
  }

  /**
   * Returns location of a specific point in a string.
   *
   * |before| is a location at the start of a string, and |point| is the one
   * we are locating. Returned location is absolute, not relative to |before|.
   * Note that |point| must not be located earlier than |before|.
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
   * @param {*} state
   * @param {!Location} before
   * @param {!Point} point
   * @param {!RoundMode} roundMode
   * @param {boolean} strict
   * @return {!Location}
   */
  locateByPoint(s, state, before, point, roundMode, strict) {
    return this._locateByPoint(s, state, before, point, roundMode, strict);
  }

  /**
   * Returns location of a specific offset in a string.
   *
   * |before| is a location at the start of a string, and |offset| is the one
   * we are locating. Returned location is absolute, not relative to |before|.
   * Note that |offset| must not be located eralier than |before|.
   *
   * Throws if |offset| points to a middle of surrogate pair.
   *
   * @param {string} s
   * @param {*} state
   * @param {!Location} before
   * @param {number} offset
   * @param {boolean} strict
   * @return {!Location}
   */
  locateByOffset(s, state, before, offset, strict) {
    return this._locateByOffset(s, state, before, offset, strict);
  }

  /**
   * Fills a map between offset in [0 .. s.length] range to x-coordinate,
   * starting with |startX|. Applies multiplier to measured widths.
   *
   * Also fills |isRTL| flag for each character in the string.
   *
   * Assumes that |s| fits on a single line as measured by these metrics.
   *
   * @param {!Float32Array} xmap
   * @param {!Int8Array} isRTL
   * @param {string} s
   * @param {number} startX
   * @param {number} multiplier
   */
  fillXMap(xmap, isRTL, s, startX, multiplier) {
    this._fillXMap(xmap, isRTL, s, startX, multiplier);
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
   * Creates a typical metrics implementation. Note that this implementation
   * does not use |state|, so one can pass anything and not store the returned state.
   * Internally it always measures a single code point and caches the result.
   *
   * Regex for strings which consist only of characters of width equal to one.
   * Used for fast-path calculations. The new-lines variation should also match
   * new lines.
   * @param {?RegExp} widthOneRegex
   *
   * Measures the width of a single BMP character.
   * Note that char.length === 1, meaning it has a single code unit and code point.
   * @param {function(string):number} measureBMP
   *
   * Measures the width of a single Supplementary character.
   * Note that char.length === 2, meaning it has two code units, but still a single code point.
   * @param {function(string):number} measureSupplementary
   *
   * @return {!Metrics}
   */
  static createRegular(widthOneRegex, measureBMP, measureSupplementary) {
    return new RegularMetrics(widthOneRegex, measureBMP, measureSupplementary);
  }

  /**
   * Creates a metrics implementation performing word wrapping.
   * See above for parameters.
   *
   * Same as |widthOneRegex|, but should also match new lines if non-null.
   * @param {?RegExp} widthOneRegexWithNewLines
   *
   * The maximum line width allowed.
   * @param {number} maxLineWidth
   *
   * @return {!Metrics}
   */
  static createWordWrapping(widthOneRegex, widthOneRegexWithNewLines, measureBMP, measureSupplementary, maxLineWidth) {
    return new WordWrapMetrics(widthOneRegex, widthOneRegexWithNewLines, measureBMP, measureSupplementary, maxLineWidth);
  }

  /**
   * Whether calculating metrics of the same string from this state
   * will give the same result.
   *
   * @param {*} s1
   * @param {*} s2
   * @return {boolean}
   */
  static stateMatches(s1, s2) {
    if (!s1 || !s2)
      return !s1 && !s2;
    return s1.startWidth === s2.startWidth && s1.lastCharIsNonWord === s2.lastCharIsNonWord;
  }

  /**
   * Do not call directly. Use static create methods instead.
   *
   * @param {?RegExp} widthOneRegex
   * @param {function(string):number} measureBMP
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
   * @param {!Float32Array} xmap
   * @param {!Int8Array} isRTL
   * @param {string} s
   * @param {number} x
   * @param {number} multiplier
   */
  _fillXMap(xmap, isRTL, s, x, multiplier) {
    xmap[0] = x;
    for (let i = 0; i <= s.length; ) {
      let charCode = s.charCodeAt(i);
      if (charCode >= 0xD800 && charCode <= 0xDBFF && i + 1 < s.length) {
        xmap[i + 1] = x;
        let codePoint = s.codePointAt(i);
        isRTL[i] = Metrics.isRtlCodePoint(codePoint) ? 1 : 0;
        isRTL[i + 1] = 0;
        if (this._supplementary[codePoint] === undefined)
          this._supplementary[codePoint] = this._measureSupplementary(s.substring(i, i + 2));
        x += this._supplementary[codePoint] * multiplier;
        i += 2;
      } else {
        isRTL[i] = Metrics.isRtlCodePoint(charCode) ? 1 : 0;
        if (this._bmp[charCode] === -1)
          this._bmp[charCode] = this._measureBMP(s[i]);
        x += this._bmp[charCode] * multiplier;
        i++;
      }
      xmap[i] = x;
    }
    isRTL[s.length] = 0;
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
      if (charCode === Metrics.lineBreakCharCode)
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
   * Locates an offset by width in a string, which must not contain line breaks.
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
      if (charCode === Metrics.lineBreakCharCode)
        throw new Error('Cannot measure line breaks');
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

  /**
   * @param {string} s
   * @param {*} state
   * @param {!Location} before
   * @param {!Point} point
   * @param {!RoundMode} roundMode
   * @param {boolean} strict
   * @return {!Location}
   */
  _locateByPoint(s, state, before, point, roundMode, strict) {
    let {x, y} = before;

    if (point.y < y || (point.y < y + 1 && point.x < x))
      throw new Error('Inconsistent');

    const located = this._locateLineByPoint(s, state, x, y, point);
    let {offset, width} = this._locateByWidth(s, located.lineStartOffset, located.lineEndOffset, point.x - located.x, roundMode);
    if (offset === -1) {
      if (strict)
        throw new Error('Point is out of bounds');
      offset = located.lineEndOffset;
    }
    return {
      offset: before.offset + offset,
      x: located.x + width,
      y: located.y
    };
  }

  /**
   * Locates a line by the y-coordinate.
   *
   * @param {string} s
   * @param {*} state
   * @param {number} x
   * @param {number} y
   * @param {!Point} point
   * @return {{lineStartOffset: number, lineEndOffset: number, x: number, y: number}}
   */
  _locateLineByPoint(s, state, x, y, point) {
  }

  /**
   * @param {string} s
   * @param {*} state
   * @param {!Location} before
   * @param {number} offset
   * @param {boolean} strict
   * @param {!WordWrapState} state
   * @return {!Location}
   */
  _locateByOffset(s, state, before, offset, strict) {
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
    let located = this._locateLineByOffset(s, state, offset, x, y);
    let width = this._measureString(s, located.lineStartOffset, offset);
    return {
      offset: offset + before.offset,
      x: located.x + width,
      y: located.y
    };
  }

  /**
   * Locates a line by the offset.

   * @param {string} s
   * @param {*} state
   * @param {number} offset
   * @param {number} x
   * @param {number} y
   * @return {{lineStartOffset: number, x: number, y: number}}
   */
  _locateLineByOffset(s, state, offset, x, y) {
  }
};

Metrics.bmpRegex = /^[\u{0000}-\u{d7ff}]*$/u;
Metrics.asciiRegex = /^[\u{0020}-\u{007e}]*$/u;
Metrics.asciiRegexWithNewLines = /^[\n\u{0020}-\u{007e}]*$/u;
Metrics.whitespaceRegex = /\s/u;
Metrics.nonWordCharacterRegex = /^\W$/u;
Metrics.lineBreakCharCode = '\n'.charCodeAt(0);

export class RegularMetrics extends Metrics {
  /**
   * @param {?RegExp} widthOneRegex
   * @param {function(string):number} measureBMP
   * @param {function(string):number} measureSupplementary
   */
  constructor(widthOneRegex, measureBMP, measureSupplementary) {
    super(widthOneRegex, measureBMP, measureSupplementary);
  }

  /**
   * @override
   * @param {string} s
   * @param {*} state
   * @return {{metrics: !TextMetrics, state: *}}
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
    return {metrics, state: null};
  }

  /**
   * @override
   * @param {string} s
   * @param {*} state
   * @param {number} x
   * @param {number} y
   * @param {!Point} point
   * @return {{lineStartOffset: number, lineEndOffset: number, x: number, y: number}}
   */
  _locateLineByPoint(s, state, x, y, point) {
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
    return {lineStartOffset, lineEndOffset, x, y};
  }

  /**
   * @override
   * @param {string} s
   * @param {*} state
   * @param {number} offset
   * @param {number} x
   * @param {number} y
   * @return {{lineStartOffset: number, x: number, y: number}}
   */
  _locateLineByOffset(s, state, offset, x, y) {
    let lineStartOffset = 0;
    let lineBreakOffset = s.indexOf('\n', lineStartOffset);
    while (lineBreakOffset !== -1 && lineBreakOffset < offset) {
      y += 1;
      x = 0;
      lineStartOffset = lineBreakOffset + 1;
      lineBreakOffset = s.indexOf('\n', lineStartOffset);
    }
    return {lineStartOffset, x, y};
  }
};

/**
 * @typedef {{
 *   startWidth: number,
 *   lastCharIsNonWord: boolean,
 * }} WordWrapState
 */

export class WordWrapMetrics extends Metrics {
  /**
   * @param {?RegExp} widthOneRegex
   * @param {?RegExp} widthOneRegexWithNewLines
   * @param {function(string):number} measureBMP
   * @param {function(string):number} measureSupplementary
   * @param {number} maxLineWidth
   */
  constructor(widthOneRegex, widthOneRegexWithNewLines, measureBMP, measureSupplementary, maxLineWidth) {
    super(widthOneRegex, measureBMP, measureSupplementary);
    this._widthOneRegexWithNewLines = widthOneRegexWithNewLines;
    this._maxLineWidth = maxLineWidth;
  }

  /**
   * @param {string} s
   * @param {!WordWrapState} state
   * @return {!Array<{offset: number, width: number}>}
   */
  _wrap(s, state) {
    const fastPath = this._widthOneRegexWithNewLines && this._widthOneRegexWithNewLines.test(s);
    const canWrapFirstWord = state.lastCharIsNonWord;
    const limit = this._maxLineWidth;

    const result = [];
    let wordStart = 0;
    let offset = 0;
    let width = state.startWidth;

    const lines = s.split("\n");
    for (let i = 0; ;) {
      const words = lines[i].split(/(\W+)/u);
      for (let j = 0; ;) {
        const wordEnded = (j && !(j % 2)) || j === words.length;
        if (offset > wordStart && wordEnded) {
          const w = fastPath ? offset - wordStart : this._measureString(s, wordStart, offset);
          if (width + w > limit && width > 0 && (canWrapFirstWord || wordStart > 0)) {
            result.push({offset: wordStart, width});
            width = 0;
          }
          width += w;
          wordStart = offset;
        }
        if (j === words.length)
          break;
        offset += words[j++].length;
      }

      if (++i !== lines.length)
        offset++;
      result.push({offset, width});
      width = 0;
      wordStart = offset;
      if (i === lines.length)
        break;
    }

    result[0].width -= state.startWidth;
    return result;
  }

  /**
   * @param {string} s
   * @param {*} state
   * @return {{metrics: !TextMetrics, state: *}}
   */
  forString(s, state) {
    const metrics = {length: s.length, firstWidth: 0, lastWidth: 0, longestWidth: 0, lineBreaks: -1};
    for (const {offset, width} of this._wrap(s, state || WordWrapMetrics.defaultState)) {
      if (metrics.lineBreaks === -1)
        metrics.firstWidth = width;
      metrics.longestWidth = Math.max(metrics.longestWidth, width);
      metrics.lineBreaks++;
      metrics.lastWidth = width;
    }
    const newState = {
      startWidth: metrics.lastWidth,
      lastCharIsNonWord: s.length ? Metrics.nonWordCharacterRegex.test(s[s.length - 1]) : state.lastCharIsNonWord
    };
    return {metrics, state: newState};
  }

  /**
   * @override
   * @param {string} s
   * @param {*} state
   * @param {number} x
   * @param {number} y
   * @param {!Point} point
   * @return {{lineStartOffset: number, lineEndOffset: number, x: number, y: number}}
   */
  _locateLineByPoint(s, state, x, y, point) {
    const wrapped = this._wrap(s, state || WordWrapMetrics.defaultState);
    let lineIndex = 0;
    while (y + 1 <= point.y) {
      if (lineIndex === wrapped.length - 1)
        throw new Error('Inconsistent');
      y += 1;
      x = 0;
      lineIndex++;
    }

    let lineStartOffset = lineIndex === 0 ? 0 : wrapped[lineIndex - 1].offset;
    let lineEndOffset = wrapped[lineIndex].offset;
    if (lineEndOffset > 0 && s[lineEndOffset - 1] === '\n')
      lineEndOffset--;
    return {lineStartOffset, lineEndOffset, x, y};
  }

  /**
   * @override
   * @param {string} s
   * @param {*} state
   * @param {number} offset
   * @param {number} x
   * @param {number} y
   * @return {{lineStartOffset: number, x: number, y: number}}
   */
  _locateLineByOffset(s, state, offset, x, y) {
    const wrapped = this._wrap(s, state || WordWrapMetrics.defaultState);
    let lineIndex = 0;
    while (lineIndex < wrapped.length && offset >= wrapped[lineIndex].offset)
      lineIndex++;
    let lineStartOffset = lineIndex === 0 ? 0 : wrapped[lineIndex - 1].offset;
    x = lineIndex === 0 ? x : 0;
    y += lineIndex;
    return {lineStartOffset, x, y};
  }
};

/** @type {!WordWrapState} */
WordWrapMetrics.defaultState = {startWidth: 0, lastCharIsNonWord: true};
