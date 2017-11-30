import { FontMetrics } from "./FontMetrics.mjs";
import { Editor } from "./Editor.mjs";
import { Selection } from "./Selection.mjs";
import { TextPosition, TextRange } from "./Types.mjs";

export class CanvasRenderer {
  /**
   * @param {!Document} document
   * @param {!Editor} editor
   */
  constructor(document, editor) {
    this._canvas = document.createElement('canvas');
    this._editor = editor;
    this._drawCursors = true;

    this._cssWidth = 0;
    this._cssHeight = 0;
    this._ratio = getPixelRatio();
    this._scrollLeft = 0;
    this._scrollTop = 0;

    this._render = this._render.bind(this);
  }

  _initializeMetrics() {
    const ctx = this._canvas.getContext('2d');
    ctx.font = '14px menlo';
    ctx.textBaseline = 'top';

    const metrics = ctx.measureText('M');
    const fontHeight = 20;
    // The following will be shipped soon.
    // const fontHeight = metrics.fontBoundingBoxAscent + metrics.fontBoundingBoxDescent;

    this._metrics = new FontMetrics(metrics.width, fontHeight);
  }

  /**
   * @return {!Element}
   */
  canvas() {
    return this._canvas;
  }

  invalidate() {
    requestAnimationFrame(this._render);
  }

  advanceScroll(dx, dy) {
    this._scrollLeft += dx;
    this._scrollTop += dy;
    this._clipScrollPosition();
    this.invalidate();
  }

  _clipScrollPosition() {
    const maxScrollLeft = Math.max(0, this._editor.longestLineLength() * this._metrics.charWidth - this._cssWidth);
    this._scrollLeft = Math.max(this._scrollLeft, 0);
    this._scrollLeft = Math.min(this._scrollLeft, maxScrollLeft);

    const maxScrollTop = Math.max(0, (this._editor.lineCount() - 1) * this._metrics.lineHeight);
    this._scrollTop = Math.max(this._scrollTop, 0);
    this._scrollTop = Math.min(this._scrollTop, maxScrollTop);
  }

  /**
   * @param {number} cssWidth
   * @param {number} cssHeight
   */
  setSize(cssWidth, cssHeight) {
    if (this._cssWidth === cssWidth && this._cssHeight === cssHeight)
      return;
    this._cssWidth = cssWidth;
    this._cssHeight = cssHeight;
    this._canvas.width = cssWidth * this._ratio;
    this._canvas.height = cssHeight * this._ratio;
    this._canvas.style.width = cssWidth + 'px';
    this._canvas.style.height = cssHeight + 'px';
    this._initializeMetrics();
    this.invalidate();
  }

  /**
   * @param {boolean} visible
   */
  setCursorsVisible(visible) {
    this._drawCursors = visible;
    this.invalidate();
  }

  mouseEventToTextPosition(event) {
    const bounds = this._canvas.getBoundingClientRect();
    const x = event.clientX - bounds.left + this._scrollLeft;
    const y = event.clientY - bounds.top + this._scrollTop;
    return {
      lineNumber: Math.floor(y / this._metrics.lineHeight),
      columnNumber: Math.floor(x / this._metrics.charWidth),
    };
  }

  _render() {
    this._clipScrollPosition();

    const ctx = this._canvas.getContext('2d');
    const {lineHeight, charWidth} = this._metrics;

    ctx.setTransform(this._ratio, 0, 0, this._ratio, 0, 0);
    ctx.clearRect(0, 0, this._cssWidth, this._cssHeight);
    ctx.translate(-this._scrollLeft, -this._scrollTop);

    const viewportStart = {
      lineNumber: Math.floor(this._scrollTop / lineHeight),
      columnNumber: Math.floor(this._scrollLeft / charWidth)
    };
    const viewportEnd = {
      lineNumber: Math.ceil((this._scrollTop + this._cssHeight) / lineHeight),
      columnNumber: Math.ceil((this._scrollLeft + this._cssWidth) / charWidth)
    };

    ctx.fillStyle = 'rgba(126, 188, 254, 0.6)';
    ctx.stokeStyle = 'rgb(33, 33, 33)';
    if (this._drawCursors) {
      const viewportRange = {from: viewportStart, to: viewportEnd};
      for (let selection of this._editor.selections()) {
        if (TextRange.intersects(selection.range(), viewportRange))
          this._drawSelection(ctx, viewportStart, viewportEnd, selection);
      }
    }

    this._drawText(ctx, viewportStart, viewportEnd);
  }

  _drawText(ctx, viewportStart, viewportEnd) {
    const {lineHeight, charWidth} = this._metrics;
    ctx.fillStyle = 'rgb(33, 33, 33)';
    const textX = viewportStart.columnNumber * charWidth;
    const lines = this._editor.lines(viewportStart.lineNumber, viewportEnd.lineNumber);
    for (let i = 0; i < lines.length; ++i) {
      const line = lines[i].lineContent();
      ctx.fillText(line.substring(viewportStart.columnNumber, viewportEnd.columnNumber + 1), textX, (i + viewportStart.lineNumber) * lineHeight);
    }
  }

  _drawSelection(ctx, viewportStart, viewportEnd, selection) {
    const {lineHeight, charWidth} = this._metrics;

    // TODO(dgozman): some editors show cursor even for non-collapsed selection.
    if (selection.isCollapsed()) {
      const focus = selection.focus();
      ctx.beginPath();
      ctx.moveTo(focus.columnNumber * charWidth, focus.lineNumber * lineHeight);
      ctx.lineTo(focus.columnNumber * charWidth, focus.lineNumber * lineHeight + lineHeight);
      ctx.stroke();
      return;
    }

    const {from, to} = selection.range();

    // Selection consists at most of three rectangles.
    // Draw first one.
    if (from.columnNumber < viewportEnd.columnNumber) {
      const rEnd = TextPosition.smaller({lineNumber: from.lineNumber, columnNumber: viewportEnd.columnNumber}, to);
      const rWidth = rEnd.columnNumber - from.columnNumber;
      ctx.fillRect(from.columnNumber * charWidth, from.lineNumber * lineHeight, charWidth * rWidth, lineHeight);
    }

    if (from.lineNumber < to.lineNumber && to.columnNumber > viewportStart.columnNumber) {
      const rWidth = to.columnNumber - viewportStart.columnNumber;
      ctx.fillRect(viewportStart.columnNumber * charWidth, to.lineNumber * lineHeight, charWidth * rWidth, lineHeight);
    }

    if (to.lineNumber - from.lineNumber > 1) {
      const rWidth = viewportEnd.columnNumber - viewportStart.columnNumber;
      const rHeight = to.lineNumber - from.lineNumber -1;
      ctx.fillRect(viewportStart.columnNumber * charWidth, (from.lineNumber + 1) * lineHeight, charWidth * rWidth, lineHeight * rHeight);
    }
  }
}

let pixel_ratio = 0;

function getPixelRatio() {
  if (!pixel_ratio) {
    let ctx = document.createElement('canvas').getContext('2d'),
        dpr = window.devicePixelRatio || 1,
        bsr = ctx.webkitBackingStorePixelRatio ||
              ctx.mozBackingStorePixelRatio ||
              ctx.msBackingStorePixelRatio ||
              ctx.oBackingStorePixelRatio ||
              ctx.backingStorePixelRatio || 1;
    pixel_ratio = dpr / bsr;
  }
  return pixel_ratio;
}

