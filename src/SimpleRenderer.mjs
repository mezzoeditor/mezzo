import { Text } from "./Text.mjs";
import { Selection } from "./Selection.mjs";
import { Operation } from "./Operation.mjs";

export class SimpleRenderer {
  /**
   * @param {!Document} document
   * @param {!Text} text
   */
  constructor(document, text) {
    this._canvas = document.createElement('div');
    this._canvas.style.setProperty('position', 'relative');
    this._canvas.style.setProperty('overflow', 'hidden');

    let style = document.createElement('style');
    style.textContent = `
      .simple-renderer {
        position: absolute;
        overflow: auto;
        left: 0;
        top: 0;
        right: 0;
        bottom: 0;
      }

      .cursor {
        visibility: hidden;
        height: ${text.fontMetrics().lineHeight}px;
        margin-left: -1px;
        width: 2px;
        background: #333;
        position: absolute;
      }

      .simple-renderer.cursors-visible .cursor {
        visibility: visible;
      }

      .text-line {
        white-space: pre;
        height: ${text.fontMetrics().lineHeight}px;
      }

      .selection {
        background: rgba(0, 0, 128, 0.2);
        position: absolute;
        height: ${text.fontMetrics().lineHeight}px;
      }
    `;
    this._canvas.appendChild(style);
    
    this._inner = document.createElement('div');
    this._inner.className = 'simple-renderer';
    this._inner.style.cssText = text.fontMetrics().css();
    this._canvas.appendChild(this._inner);

    this._text = text;
    this._viewport = {origin: {x: 0, y: 0}, size: {width: 0, height: 0}};
  }

  /**
   * @return {!Element}
   */
  canvas() {
    return this._canvas;
  }

  /**
   * @param {!Operation} op
   */
  invalidate(op) {
    this._invalidateViewport();
  }

  /**
   * @param {!TextRect} viewport
   */
  setViewport(viewport) {
    if (this._viewport.size.width !== viewport.size.width || this._viewport.size.height !== viewport.size.height) {
      this._canvas.style.setProperty('width', viewport.size.width + 'px');
      this._canvas.style.setProperty('height', viewport.size.height + 'px');
    }
    this._viewport = viewport;
    this._invalidateViewport();
  }

  /**
   * @param {boolean} visible
   */
  setCursorsVisible(visible) {
    this._inner.classList.toggle('cursors-visible', !!visible);
  }

  _invalidateViewport() {
    while (this._inner.lastChild)
      this._inner.removeChild(this._inner.lastChild);
    for (let i = 0; i < this._text.lineCount(); i++) {
      let line = this._inner.ownerDocument.createElement('div');
      line.classList.add('text-line');
      line.textContent = this._text.line(i).lineContent();
      this._inner.appendChild(line);
    }

    for (let selection of this._text.selections()) {
      let range = selection.range();
      for (let line = range.from.lineNumber; line <= range.to.lineNumber; line++) {
        let from = line === range.from.lineNumber ? range.from.columnNumber : 0;
        let to = line === range.to.lineNumber ? range.to.columnNumber : this._text.line(line).length();
        let element = this._inner.ownerDocument.createElement('div');
        element.classList.add('selection');
        element.style.setProperty('top', (this._text.fontMetrics().lineHeight * line) + 'px');
        element.style.setProperty('left', (this._text.fontMetrics().charWidth * from) + 'px');
        element.style.setProperty('width', (this._text.fontMetrics().charWidth * (to - from)) + 'px');
        this._inner.appendChild(element);
      }

      let pos = selection.focus();
      let element = this._inner.ownerDocument.createElement('div');
      element.classList.add('cursor');
      element.style.setProperty('top', (this._text.fontMetrics().lineHeight * pos.lineNumber) + 'px');
      element.style.setProperty('left', (this._text.fontMetrics().charWidth * pos.columnNumber) + 'px');
      this._inner.appendChild(element);
    }
  }
}
