import { Text } from "./Text.mjs";
import { Cursor } from "./Cursor.mjs";
import { Operation } from "./Operation.mjs";

let cursorSymbol = Symbol('cursorElement');

export class SimpleRenderer {
  /**
   * @param {!Document} document
   * @param {!Text} text
   */
  constructor(document, text) {
    this._text = text;
    this._canvas = document.createElement('div');
    this._canvas.style.cssText = this._text.fontMetrics().css();
    this._canvas.style.setProperty('position', 'relative');
    this._canvas.style.setProperty('overflow', 'auto');
    this._overlay = document.createElement('div');
    this._overlay.style.setProperty('position', 'relative');
    this._overlay.style.setProperty('overflow', 'hidden');
    this._viewport = {origin: {x: 0, y: 0}, size: {width: 0, height: 0}};
    this._cursorsVisible = false;
    this._cursorElements = new Set();

    this._canvas.addEventListener('scroll', event => {
      this._overlay.scrollTop = this._canvas.scrollTop;
    });
  }

  /**
   * @return {!Element}
   */
  canvas() {
    return this._canvas;
  }

  /**
   * @return {!Element}
   */
  overlay() {
    return this._overlay;
  }

  /**
   * @param {!Operation} op
   */
  invalidate(op) {
    if (op.cursorsChanged)
      this._updateCursors();
    if (op.cursorsMoved)
      this._moveCursors();

    if (!this._text.operationAffectsRect(op, this._viewport))
      return;
    this._invalidateViewport();
  }

  /**
   * @param {!TextRect} viewport
   */
  setViewport(viewport) {
    if (this._viewport.size.width !== viewport.size.width || this._viewport.size.height !== viewport.size.height) {
      this._canvas.style.setProperty('width', viewport.size.width + 'px');
      this._canvas.style.setProperty('height', viewport.size.height + 'px');
      this._overlay.style.setProperty('width', viewport.size.width + 'px');
      this._overlay.style.setProperty('height', viewport.size.height + 'px');
    }
    this._viewport = viewport;
    this._invalidateViewport();
  }

  /**
   * @param {boolean} visible
   */
  setCursorsVisible(visible) {
    this._cursorsVisible = visible;
    for (let cursor of this._text.cursors()) {
      let element = cursor[cursorSymbol];
      element.style.setProperty('visibility', this._cursorsVisible ? 'visible' : 'hidden');
    }
  }

  _invalidateViewport() {
    while (this._canvas.lastChild)
      this._canvas.removeChild(this._canvas.lastChild);
    for (let i = 0; i < this._text.lineCount(); i++) {
      let line = this._canvas.ownerDocument.createElement('div');
      line.style.setProperty('height', this._text.fontMetrics().lineHeight + 'px');
      line.style.setProperty('white-space', 'pre');
      line.textContent = this._text.line(i);
      this._canvas.appendChild(line);
    }
  }

  _updateCursors() {
    let elements = new Set();
    for (let cursor of this._text.cursors()) {
      let element = cursor[cursorSymbol];
      if (!element) {
        element = this._canvas.ownerDocument.createElement('div');
        element.style.setProperty('width', '2px');
        element.style.setProperty('height', this._text.fontMetrics().lineHeight + 'px');
        element.style.setProperty('background', 'red');
        element.style.setProperty('position', 'absolute');
        element.style.setProperty('margin-left', '-1px');
        cursor[cursorSymbol] = element;
        element.style.setProperty('visibility', this._cursorsVisible ? 'visible' : 'hidden');
        this._overlay.appendChild(element);
      }
      elements.add(element);
    }
    for (let element of this._cursorElements) {
      if (!elements.has(element))
        this._overlay.removeChild(element);
    }
    this._cursorElements = elements;
  }

  _moveCursors() {
    for (let cursor of this._text.cursors()) {
      let element = cursor[cursorSymbol];
      let point = this._text.positionToPoint(cursor.position);
      element.style.setProperty('left', (point.x - this._viewport.origin.x) + 'px');
      element.style.setProperty('top', (point.y - this._viewport.origin.y) + 'px');
    }
  }
}
