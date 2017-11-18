
export class SimpleRenderer {
  constructor(domDocument, text) {
    this._canvas = domDocument.createElement('div');
    this._text = text;
    this._canvas.style.cssText = this._text.fontMetrics().css();
  }

  canvas() {
    return this._canvas;
  }

  invalidate() {
    this._canvas.textContent = this._text.text();
  }

  setOffset(x, y) {
    this._x = x;
    this._y = y;
    this.invalidate();
  }

  /**
   * @param {number} width
   * @param {number} height
   */
  setSize(width, height) {
    //TODO: set canvas size
    this._width = width;
    this._height = height;
    this._canvas.style.setProperty('width', width + 'px');
    this._canvas.style.setProperty('height', height + 'px');
    this.invalidate();
  }
}
