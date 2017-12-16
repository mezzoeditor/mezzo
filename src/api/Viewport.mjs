import { TextUtils } from "../utils/TextUtils.mjs";

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
   * @param {number} line
   * @param {number} from
   * @param {number} to
   * @return {?string}
   */
  lineChunk(line, from, to) {
    return TextUtils.lineChunk(this._text, line, from, to);
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
 *   line: number,
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
