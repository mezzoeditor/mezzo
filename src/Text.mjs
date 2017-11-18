import { FontMetrics } from "./FontMetrics.mjs";

export class Text {
  constructor() {
    this._lines = [""];
    this._metrics = FontMetrics.createSimple();
  }

  /**
   * @param {!Editor.FontMetrics} metrics
   */
  setFontMetrics(metrics) {
    this._metrics = metrics;
  }

  /**
   * @return {!Editor.FontMetrics}
   */
  fontMetrics() {
    return this._metrics;
  }

  /**
   * @param {string} text
   */
  setText(text) {
    this._lines = text.split('\n');
  }

  /**
   * @return {string}
   */
  text() {
    return this._lines.join('\n');
  }

  /**
   * @return {number}
   */
  lineCount() {
    return this._lines.length;
  }

  /**
   * @param {number} lineNumber
   * @return {string}
   */
  line(lineNumber) {
    return this._lines[lineNumber];
  }

  /**
   * @return {?{x: number, y: number}}
   */
  toCoordinates(lineNumber, columnNumber) {
  }

  /**
   * @return {?{lineNumber: number, columnNumber: number}}
   */
  fromCoordinates(x, y) {
  }
}
