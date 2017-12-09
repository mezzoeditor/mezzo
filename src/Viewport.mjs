export class Viewport {
  /**
   * @param {!Text} text
   * @param {!TextPosition} viepwortStart
   * @param {!TextPosition} viewportEnd
   */
  constructor(text, viewportStart, viewportEnd) {
    this._text = text;
    this._viewportStart = viewportStart;
    this._viewportEnd = viewportEnd;
    this._decorations = [];
  }

  viewportStart() {
    return this._viewportStart;
  }

  viewportEnd() {
    return this._viewportEnd;
  }

  /**
   * @return {number}
   */
  lineCount() {
    return this._text.lineCount();
  }

  /**
   * @param {number} lineNumber
   * @return {?string}
   */
  line(lineNumber) {
    return this._text.line(lineNumber);
  }

  /**
   * @param {number} lineNumber
   * @return {number}
   */
  lineLength(lineNumber) {
    return this._text.lineLength(lineNumber);
  }

  /**
   * @param {number} lineNumber
   * @param {number} from
   * @param {number} to
   * @return {?string}
   */
  lineChunk(lineNumber, from, to) {
    return this._text.lineChunk(lineNumber, from, to);
  }

  /**
   * @param {!Array<!Decoration>} decorations
   */
  addDecorations(decorations) {
    this._decorations.push(...decorations);
  }
}

Viewport.Decorations = [
  'background',  // css color
  'underline',  // css color
];

/**
 * @typedef {function(!Viewport)} ViewportBuilder;
 */

/**
 * @typedef {{
 *   lineNumber: number,
 *   from: number,
 *   to: number,
 *   name: string,
 *   value: string
 * }} Decoration;
 */

/*
buildViewport(viewport) {
  viewport.addDecorations(...);
  viewport.addAutosizeWidget(...);
  viewport.addWidgetFixedWidth(...);
  viewport.addErrorLine(...);
  viewport.addGutterWidget(...);
}
setLineMarker(line, marker, value)
*/
