import { RoundMode } from '../utils/RoundMode.mjs';
import { TextMetricsMonoid } from './TextMetrics.mjs';
import { TextUtils } from './TextUtils.mjs';

/**
 * @typedef {{x: number, y: number}} Point
 * 2-dimensional position in a text.
 *
 *
 * @typedef {{x: number, y: number, offset: Offset}} Location
 * This is a combination of point and offset.
 */

const monoid = new TextMetricsMonoid();

/**
 * This interface calculates metrics for string chunks.
 *
 * @template S - the type of state.
 * @implements StringMorphism<TextMetrics, TextLookupKey, S>
 */
class TextMeasurerBase {
  /**
   * @override
   * @return {TextMetricsMonoid}
   */
  monoid() {
    return monoid;
  }

  /**
   * @override
   * @return {?StateTraits<S>}
   */
  stateTraits() {
    return null;
  }

  /**
   * Returns metrics for a string. See |TextMetrics| for definition.
   * The resulting |state| should be passed to the next chunk being measured.
   * @override
   * @param {string} s
   * @param {S} state
   * @return {{value: TextMetrics, state: S}}
   */
  mapValue(s, state) {
  }

  /**
   * Provides a placeholder for a string of particular length,
   * which can be used as a placeholder until the real value is calculated.
   * @override
   * @param {number} length
   * @return {TextMetrics}
   */
  unmappedValue(length) {
    return {length, firstWidth: 0, lastWidth: 0, longestWidth: 0};
  }

  /**
   * Returns location of a specific point in a string.
   *
   * |before| should be equal to combined metrics at the start of a string,
   * and |point| is the one we are locating. Returned location is absolute,
   * not relative to |before|. Note that |point| must not be located earlier
   * than |before|.
   *
   * When the width does not point exaclty between two code points, |roundMode| controls
   * which code point to snap to:
   *   - RoundMode.Floor snaps to the first code point;
   *   - RoundMode.Ceil snaps to the second code point;
   *   - RoundMode.Round snaps to the first or second code point depending on
   *     whether width is further from the left or right border of the second code point.
   *
   * @param {string} s
   * @param {S} state
   * @param {TextMetrics} before
   * @param {Point} point
   * @param {RoundMode} roundMode
   * @return {Location}
   */
  locateByPoint(s, state, before, point, roundMode) {
    return this._locateByPoint(s, state, before, point, roundMode);
  }

  /**
   * Returns location of a specific offset in a string.
   *
   * |before| should be equal to combined metrics at the start of a string,
   * and |offset| is the one we are locating. Returned location is absolute,
   * not relative to |before|. Note that |offset| must not be located eralier
   * than |before|.
   *
   * Throws if |offset| points to a middle of surrogate pair.
   *
   * @param {string} s
   * @param {S} state
   * @param {TextMetrics} before
   * @param {Offset} offset
   * @return {Location}
   */
  locateByOffset(s, state, before, offset) {
    return this._locateByOffset(s, state, before, offset);
  }

  /**
   * Fills a map between offset in [0 .. s.length] range to x-coordinate,
   * starting with |startX|. Applies multiplier to measured widths.
   * Also fills |isRTL| flag for each character in the string.
   *
   * Assumes that |s| fits on a single line as measured by these metrics.
   *
   * @param {Float32Array} xmap
   * @param {Int8Array} isRTL
   * @param {string} s
   * @param {number} startX
   * @param {number} multiplier
   */
  fillXMap(xmap, isRTL, s, startX, multiplier) {
    this._fillXMap(xmap, isRTL, s, startX, multiplier);
  }

  /**
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
   * @param {Float32Array} xmap
   * @param {Int8Array} isRTL
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
        isRTL[i] = TextUtils.isRtlCodePoint(codePoint) ? 1 : 0;
        isRTL[i + 1] = 0;
        if (this._supplementary[codePoint] === undefined)
          this._supplementary[codePoint] = this._measureSupplementary(s.substring(i, i + 2));
        x += this._supplementary[codePoint] * multiplier;
        i += 2;
      } else {
        isRTL[i] = TextUtils.isRtlCodePoint(charCode) ? 1 : 0;
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
   * @param {string} s
   * @param {Offset} from
   * @param {Offset} to
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
      if (charCode === TextUtils.lineBreakCharCode)
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
   * @param {string} s
   * @param {Offset} from
   * @param {Offset} to
   * @param {number} width
   * @param {RoundMode} roundMode
   * @return {{offset: Offset, width: number}}
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
      if (charCode === TextUtils.lineBreakCharCode)
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
   * @param {S} state
   * @param {TextMetrics} before
   * @param {Point} point
   * @param {RoundMode} roundMode
   * @return {Location}
   */
  _locateByPoint(s, state, before, point, roundMode) {
    const x = before.lastWidth;
    const y = before.lineBreaks || 0;

    if (point.y < y || (point.y < y + 1 && point.x < x))
      throw new Error('Inconsistent');

    const located = this._locateLineByPoint(s, state, x, y, point);
    let {offset, width} = this._locateByWidth(s, located.lineStartOffset, located.lineEndOffset, point.x - located.x, roundMode);
    if (offset === -1)
      offset = located.lineEndOffset;
    return {
      offset: before.length + offset,
      x: located.x + width,
      y: located.y
    };
  }

  /**
   * Locates a line by the y-coordinate.
   * @param {string} s
   * @param {S} state
   * @param {number} x
   * @param {number} y
   * @param {Point} point
   * @return {{lineStartOffset: Offset, lineEndOffset: Offset, x: number, y: number}}
   */
  _locateLineByPoint(s, state, x, y, point) {
  }

  /**
   * @param {string} s
   * @param {S} state
   * @param {TextMetrics} before
   * @param {Offset} offset
   * @return {Location}
   */
  _locateByOffset(s, state, before, offset) {
    if (s.length < offset - before.length)
      throw new Error('Inconsistent');

    if (!TextUtils.isValidOffset(s, offset - before.length)) {
      offset--;
      if (offset < before.length || !TextUtils.isValidOffset(s, offset - before.length))
        throw new Error('Inconsistent');
    }

    const x = before.lastWidth;
    const y = before.lineBreaks || 0;
    offset -= before.length;
    let located = this._locateLineByOffset(s, state, offset, x, y);
    let width = this._measureString(s, located.lineStartOffset, offset);
    return {
      offset: offset + before.length,
      x: located.x + width,
      y: located.y
    };
  }

  /**
   * Locates a line by the offset.
   * @param {string} s
   * @param {S} state
   * @param {Offset} offset
   * @param {number} x
   * @param {number} y
   * @return {{lineStartOffset: Offset, x: number, y: number}}
   */
  _locateLineByOffset(s, state, offset, x, y) {
  }
};

/**
 * @implements StringMorphism<TextMetrics, TextLookupKey, undefined>
 */
export class TextMeasurer extends TextMeasurerBase {
  /**
   * Creates a typical measurer implementation. Note that this implementation
   * does not use |state|, so one can pass anything and not store the returned state.
   * Internally it always measures a single code point and caches the result.
   *
   * @param {?RegExp} widthOneRegex
   * Regex for strings which consist only of characters of width equal to one.
   * Used for fast-path calculations. If provided, this regex also must match new lines.
   *
   * @param {function(string):number} measureBMP
   * Measures the width of a single BMP character.
   * Note that char.length === 1, meaning it has a single code unit and code point.
   *
   * @param {function(string):number} measureSupplementary
   * Measures the width of a single Supplementary character.
   * Note that char.length === 2, meaning it has two code units, but still a single code point.
   */
  constructor(widthOneRegex, measureBMP, measureSupplementary) {
    super(widthOneRegex, measureBMP, measureSupplementary);
  }

  /**
   * @override
   * @param {string} s
   * @return {{value: TextMetrics}}
   */
  mapValue(s) {
    const metrics = {
      length: s.length,
      firstWidth: 0,
      lastWidth: 0,
      longestWidth: 0
    };

    const widthOne = this._widthOneRegex && this._widthOneRegex.test(s);
    let lineBreaks = 0;
    let offset = 0;
    while (true) {
      const lineBreakOffset = s.indexOf('\n', offset);
      const lineEndOffset = lineBreakOffset === -1 ? s.length : lineBreakOffset;
      const width = widthOne ? lineEndOffset - offset : this._measureString(s, offset, lineEndOffset);

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
    return {value: metrics};
  }

  /**
   * @override
   * @param {string} s
   * @param {undefined} state
   * @param {number} x
   * @param {number} y
   * @param {Point} point
   * @return {{lineStartOffset: Offset, lineEndOffset: Offset, x: number, y: number}}
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
   * @param {undefined} state
   * @param {Offset} offset
   * @param {number} x
   * @param {number} y
   * @return {{lineStartOffset: Offset, x: number, y: number}}
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
 * @typedef {number} WrappingState
 * This is a "start width" value, from which we started the chunk before wrapping.
 */


/**
 * State traits for wrapping measurer.
 *
 * @implements StateTraits<WrappingState>
 */
class WrappingStateTraits {
  /**
   * @override
   * @return {WrappingState}
   */
  emptyState() {
    return 0;
  }

  /**
   * @override
   * @param {WrappingState} s1
   * @param {WrappingState} s2
   * @return {boolean}
   */
  statesAreEqual(s1, s2) {
    return s1 === s2;
  }

  /**
   * @override
   * @param {WrappingState} s
   * @return {*}
   */
  serializeState(s) {
    return s;
  }

  /**
   * @override
   * @param {*} data
   * @return {WrappingState}
   */
  deserializeState(data) {
    return data;
  }
};

const wrappingStateTraits = new WrappingStateTraits();

/**
 * @implements StringMorphism<TextMetrics, TextLookupKey, WrappingState>
 */
class WrappingTextMeasurer extends TextMeasurerBase {
  /**
   * @param {?RegExp} widthOneRegex
   * @param {function(string):number} measureBMP
   * @param {function(string):number} measureSupplementary
   * @param {number} maxLineWidth
   */
  constructor(widthOneRegex, measureBMP, measureSupplementary, maxLineWidth) {
    super(widthOneRegex, measureBMP, measureSupplementary);
    this._maxLineWidth = maxLineWidth;
  }

  /**
   * @override
   * @return {StateTraits<WrappingState>}
   */
  stateTraits() {
    return wrappingStateTraits;
  }

  /**
   * @param {string} s
   * @param {WrappingState} state
   * @return {Array<{offset: Offset, width: number}>}
   */
  _wrap(s, state) {
  }

  /**
   * @override
   * @param {string} s
   * @param {WrappingState} state
   * @return {{value: TextMetrics, state: WrappingState}}
   */
  mapValue(s, state) {
    const metrics = {length: s.length, firstWidth: 0, lastWidth: 0, longestWidth: 0, lineBreaks: -1};
    for (const {offset, width} of this._wrap(s, state)) {
      if (metrics.lineBreaks === -1)
        metrics.firstWidth = width;
      metrics.longestWidth = Math.max(metrics.longestWidth, width);
      metrics.lineBreaks++;
      metrics.lastWidth = width;
    }
    const newState = metrics.lineBreaks ? metrics.lastWidth : metrics.lastWidth + state;
    return {value: metrics, state: newState};
  }

  /**
   * @override
   * @param {string} s
   * @param {WrappingState} state
   * @param {number} x
   * @param {number} y
   * @param {Point} point
   * @return {{lineStartOffset: number, lineEndOffset: number, x: number, y: number}}
   */
  _locateLineByPoint(s, state, x, y, point) {
    const wrapped = this._wrap(s, state);
    let lineIndex = 0;
    while (y + 1 <= point.y) {
      if (lineIndex === wrapped.length - 1)
        throw new Error('Inconsistent');
      y += 1;
      x = 0;
      lineIndex++;
    }

    const lineStartOffset = lineIndex === 0 ? 0 : wrapped[lineIndex - 1].offset;
    let lineEndOffset = wrapped[lineIndex].offset;
    if (lineEndOffset > 0 && s[lineEndOffset - 1] === '\n')
      lineEndOffset--;
    return {lineStartOffset, lineEndOffset, x, y};
  }

  /**
   * @override
   * @param {string} s
   * @param {WrappingState} state
   * @param {Offset} offset
   * @param {number} x
   * @param {number} y
   * @return {{lineStartOffset: number, x: number, y: number}}
   */
  _locateLineByOffset(s, state, offset, x, y) {
    const wrapped = this._wrap(s, state);
    let lineIndex = 0;
    while (lineIndex < wrapped.length && offset >= wrapped[lineIndex].offset)
      lineIndex++;
    const lineStartOffset = lineIndex === 0 ? 0 : wrapped[lineIndex - 1].offset;
    x = lineIndex === 0 ? x : 0;
    y += lineIndex;
    return {lineStartOffset, x, y};
  }
};

export class WordWrappingTextMeasurer extends WrappingTextMeasurer {
  /**
   * Creates a metrics implementation performing word wrapping.
   *
   * @param {?RegExp} widthOneRegex
   * See TextMeasurer.
   *
   * @param {function(string):number} measureBMP
   * See TextMeasurer.
   *
   * @param {function(string):number} measureSupplementary
   * See TextMeasurer.
   *
   * @param {number} maxLineWidth
   * The maximum line width allowed.
   */
  constructor(widthOneRegex, measureBMP, measureSupplementary, maxLineWidth) {
    super(widthOneRegex, measureBMP, measureSupplementary, maxLineWidth);
  }

  /**
   * @override
   * @param {string} s
   * @param {WrappingState} state
   * @return {Array<{offset: Offset, width: number}>}
   */
  _wrap(s, state) {
    const widthOne = this._widthOneRegex && this._widthOneRegex.test(s);
    const limit = this._maxLineWidth;

    const result = [];
    let wordStart = 0;
    let offset = 0;
    let width = state;

    const lines = s.split("\n");
    for (let i = 0; ;) {
      const words = lines[i].split(/(\W+)/u);
      for (let j = 0; ;) {
        const wordEnded = (j && !(j % 2)) || j === words.length;
        if (offset > wordStart && wordEnded) {
          let w = widthOne ? offset - wordStart : this._measureString(s, wordStart, offset);
          while (width + w > limit) {
            if (width > 0) {
              result.push({offset: wordStart, width});
              width = 0;
            } else {
              // TODO: we could probably optimize then next call by computing |widthOne| once.
              const located = this._locateByWidth(s, wordStart, offset, limit, RoundMode.Floor);
              result.push({offset: located.offset, width: located.width});
              w -= located.width;
              wordStart = located.offset;
            }
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

    result[0].width -= state;
    return result;
  }
};

export class LineWrappingTextMeasurer extends WrappingTextMeasurer {
  /**
   * Creates a metrics implementation performing line wrapping,
   * possibly in the middle of a word.
   *
   * @param {?RegExp} widthOneRegex
   * See TextMeasurer.
   *
   * @param {function(string):number} measureBMP
   * See TextMeasurer.
   *
   * @param {function(string):number} measureSupplementary
   * See TextMeasurer.
   *
   * @param {number} maxLineWidth
   * The maximum line width allowed.
   */
  constructor(widthOneRegex, measureBMP, measureSupplementary, maxLineWidth) {
    super(widthOneRegex, measureBMP, measureSupplementary, maxLineWidth);
  }

  /**
   * @override
   * @param {string} s
   * @param {WrappingState} state
   * @return {Array<{offset: Offset, width: number}>}
   */
  _wrap(s, state) {
    const limit = this._maxLineWidth;
    const result = [];
    let offset = 0;
    let width = state;

    const lines = s.split("\n");
    for (let i = 0; ;) {
      let lineEnd = offset + lines[i].length;
      while (offset < lineEnd) {
        // TODO: we could probably optimize then next call by computing |widthOne| once.
        const located = this._locateByWidth(s, offset, lineEnd, limit - width, RoundMode.Floor);
        if (located.offset === -1)
          located.offset = lineEnd;
        result.push({offset: located.offset, width: located.width});
        offset = located.offset;
        width = 0;
      }

      if (++i === lines.length)
        break;

      offset++;
      if (!lines[i - 1].length) {
        result.push({offset, width});
        width = 0;
      } else {
        result[result.length - 1].offset++;
      }
    }

    result[0].width -= state;
    return result;
  }
};
