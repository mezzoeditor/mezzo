import { FontMetrics } from "./FontMetrics.mjs";
import { Editor } from "./Editor.mjs";
import { Selection } from "./Selection.mjs";
import { TextPosition, TextRange } from "./Types.mjs";
import { Viewport } from "./Viewport.mjs";

const GUTTER_PADDING_LEFT_RIGHT = 4;
const EDITOR_MARGIN_LEFT = 4;
const SCROLLBAR_WIDTH = 15;
const MIN_THUMB_SIZE = 30;

export class CanvasRenderer {
  /**
   * @param {!Document} document
   * @param {!Editor} editor
   */
  constructor(document, editor) {
    this._canvas = document.createElement('canvas');
    this._editor = editor;
    this._drawCursors = true;

    this._animationFrameId = 0;

    this._cssWidth = 0;
    this._cssHeight = 0;
    this._ratio = getPixelRatio();
    this._scrollLeft = 0;
    this._scrollTop = 0;

    this._render = this._render.bind(this);
    this._builders = [];

    this._canvas.addEventListener('mousedown', event => this._onMouseDown(event));
    this._canvas.addEventListener('wheel', event => this._onScroll(event));

    // Rects are in css pixels, in canvas coordinates.
    this._gutterRect = {
      x: 0, y: 0, width: 0, height: 0
    };
    this._editorRect = {
      x: 0, y: 0, width: 0, height: 0
    };
    this._vScrollbar = new Scrollbar(true /** isVertical */);
    this._hScrollbar = new Scrollbar(false /** isVertical */);
    this._initializeMetrics();
  }

  /**
   * @param {!ViewportBuilder} builder
   */
  addBuilder(builder) {
    this._builders.push(builder);
  }

  _onScroll(event) {
    this._scrollLeft += event.deltaX;
    this._scrollTop += event.deltaY;
    event.preventDefault(true);
    this.invalidate();

    event.stopPropagation();
    event.preventDefault();
  }

  _onMouseDown(event) {
    let textPosition = this._mouseEventToTextPosition(event);
    const selection = new Selection();
    selection.setCaret(textPosition);
    this._editor.setSelections([selection]);
    this.invalidate();

    event.stopPropagation();
    event.preventDefault();
  }

  _initializeMetrics() {
    const ctx = this._canvas.getContext('2d');
    ctx.font = '14px menlo';
    ctx.textBaseline = 'top';

    const metrics = ctx.measureText('M');
    const fontHeight = 20;
    // The following will be shipped soon.
    // const fontHeight = metrics.fontBoundingBoxAscent + metrics.fontBoundingBoxDescent;

    this._metrics = new FontMetrics(metrics.width, fontHeight - 5, fontHeight);
  }

  /**
   * @return {!Element}
   */
  canvas() {
    return this._canvas;
  }

  invalidate() {
    // To properly handle input events, we have to update rects synchronously.
    const lineCount = this._editor.text().lineCount();

    this._maxScrollTop = Math.max(0, (lineCount - 1) * this._metrics.lineHeight);
    this._maxScrollLeft = Math.max(0, (this._editor.text().longestLineLength() + 3) * this._metrics.charWidth - this._editorRect.width);

    this._scrollLeft = Math.max(this._scrollLeft, 0);
    this._scrollLeft = Math.min(this._scrollLeft, this._maxScrollLeft);
    this._scrollTop = Math.max(this._scrollTop, 0);
    this._scrollTop = Math.min(this._scrollTop, this._maxScrollTop);

    const gutterLength = lineCount < 100 ? 3 : (this._editor.text().lineCount() + '').length;
    this._gutterRect.width = gutterLength * this._metrics.charWidth + 2 * GUTTER_PADDING_LEFT_RIGHT;
    this._gutterRect.height = this._cssHeight;

    this._editorRect.x = this._gutterRect.width + EDITOR_MARGIN_LEFT;
    this._editorRect.width = this._cssWidth - this._editorRect.x - SCROLLBAR_WIDTH;
    this._editorRect.height = this._cssHeight;

    this._vScrollbar.rect.x = this._cssWidth - SCROLLBAR_WIDTH;
    this._vScrollbar.rect.y = 0;
    this._vScrollbar.rect.width = SCROLLBAR_WIDTH;
    this._vScrollbar.rect.height = this._cssHeight;
    this._vScrollbar.updateThumbRect(this._cssHeight, lineCount * this._metrics.lineHeight, this._scrollTop, this._maxScrollTop);

    this._hScrollbar.rect.x = this._gutterRect.width;
    this._hScrollbar.rect.y = this._cssHeight - SCROLLBAR_WIDTH;
    this._hScrollbar.rect.width = this._cssWidth - this._gutterRect.width - this._vScrollbar.rect.width;
    this._hScrollbar.rect.height = this._maxScrollLeft ? SCROLLBAR_WIDTH : 0;
    this._hScrollbar.updateThumbRect(this._editorRect.width, this._editor.text().longestLineLength() * this._metrics.charWidth, this._scrollLeft, this._maxScrollLeft);

    if (!this._animationFrameId)
      this._animationFrameId = requestAnimationFrame(this._render);
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

  _mouseEventToTextPosition(event) {
    const bounds = this._canvas.getBoundingClientRect();
    const x = event.clientX - bounds.left + this._scrollLeft - this._editorRect.x;
    const y = event.clientY - bounds.top + this._scrollTop - this._editorRect.y;
    const textPosition = {
      lineNumber: Math.floor(y / this._metrics.lineHeight),
      columnNumber: Math.round(x / this._metrics.charWidth),
    };
    return this._editor.text().clampPositionIfNeeded(textPosition) || textPosition;
  }

  _render() {
    this._animationFrameId = 0;

    const ctx = this._canvas.getContext('2d');
    const {lineHeight, charWidth} = this._metrics;

    ctx.setTransform(this._ratio, 0, 0, this._ratio, 0, 0);
    ctx.clearRect(0, 0, this._cssWidth, this._cssHeight);

    const viewportStart = {
      lineNumber: Math.floor(this._scrollTop / lineHeight),
      columnNumber: Math.floor(this._scrollLeft / charWidth)
    };
    const viewportEnd = {
      lineNumber: Math.ceil((this._scrollTop + this._cssHeight) / lineHeight),
      columnNumber: Math.ceil((this._scrollLeft + this._cssWidth) / charWidth)
    };

    let fromLine = Math.min(viewportStart.lineNumber, this._editor.text().lineCount());
    let toLine = Math.min(viewportEnd.lineNumber, this._editor.text().lineCount());
    const viewport = new Viewport(this._editor.text(),
        {from: {lineNumber: fromLine, columnNumber: viewportStart.columnNumber},
         to: {lineNumber: toLine, columnNumber: viewportEnd.columnNumber}});
    for (let builder of this._builders)
      builder(viewport);

    ctx.save();
    ctx.rect(this._gutterRect.x, this._gutterRect.y, this._gutterRect.width, this._gutterRect.height);
    ctx.clip();
    this._drawGutter(ctx, viewportStart, viewportEnd);
    ctx.restore();

    ctx.save();
    ctx.rect(this._editorRect.x - EDITOR_MARGIN_LEFT, this._editorRect.y, this._editorRect.width + EDITOR_MARGIN_LEFT, this._editorRect.height);
    ctx.clip();
    ctx.translate(-this._scrollLeft + this._editorRect.x, -this._scrollTop + this._editorRect.y);
    this._drawSelections(ctx, viewportStart, viewportEnd);
    this._drawText(ctx, viewportStart, viewportEnd, viewport);
    ctx.restore();

    ctx.save();
    this._vScrollbar.draw(ctx);
    this._hScrollbar.draw(ctx);
    ctx.restore();
  }

  _drawGutter(ctx, viewportStart, viewportEnd) {
    const {lineHeight, charWidth} = this._metrics;
    ctx.fillStyle = '#eee';
    ctx.fillRect(0, 0, this._gutterRect.width, this._gutterRect.height);
    ctx.strokeStyle = 'rgb(187, 187, 187)';
    ctx.beginPath();
    ctx.moveTo(this._gutterRect.width, 0);
    ctx.lineTo(this._gutterRect.width, this._gutterRect.height);
    ctx.stroke();

    ctx.translate(0, -this._scrollTop);
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgb(128, 128, 128)';
    const textX = this._gutterRect.width - GUTTER_PADDING_LEFT_RIGHT;
    const lineCount = this._editor.text().lineCount();
    for (let i = viewportStart.lineNumber; i < viewportEnd.lineNumber && i < lineCount; ++i) {
      const number = (i + 1) + '';
      ctx.fillText(number, textX, i * lineHeight);
    }
  }

  _drawText(ctx, viewportStart, viewportEnd, viewport) {
    const {lineHeight, charWidth, charHeight} = this._metrics;
    ctx.fillStyle = 'rgb(33, 33, 33)';
    const textX = viewportStart.columnNumber * charWidth;
    const lineCount = this._editor.text().lineCount();
    for (let i = viewportStart.lineNumber; i < viewportEnd.lineNumber && i < lineCount; ++i) {
      const line = this._editor.text().line(i);
      ctx.fillText(line.substring(viewportStart.columnNumber, viewportEnd.columnNumber + 1), textX, i * lineHeight);
    }
    for (let decoration of viewport._decorations) {
      switch (decoration.name) {
        case 'background': {
          ctx.fillStyle = decoration.value;
          ctx.fillRect(
              (viewportStart.columnNumber + decoration.from) * charWidth,
              decoration.lineNumber * lineHeight,
              (decoration.to - decoration.from) * charWidth,
              lineHeight);
          break;
        }
        case 'underline': {
          ctx.strokeStyle = decoration.value;
          ctx.beginPath();
          ctx.moveTo((viewportStart.columnNumber + decoration.from) * charWidth, decoration.lineNumber * lineHeight + charHeight);
          ctx.lineTo((viewportStart.columnNumber + decoration.to) * charWidth, decoration.lineNumber * lineHeight + charHeight);
          ctx.stroke();
          break;
        }
      }
    }
  }

  _drawSelections(ctx, viewportStart, viewportEnd) {
    ctx.fillStyle = 'rgba(126, 188, 254, 0.6)';
    ctx.stokeStyle = 'rgb(33, 33, 33)';
    if (this._drawCursors) {
      const viewportRange = {from: viewportStart, to: viewportEnd};
      for (let selection of this._editor.selections()) {
        if (TextRange.intersects(selection.range(), viewportRange))
          this._drawSelection(ctx, viewportStart, viewportEnd, selection);
      }
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

class Scrollbar {
  constructor(isVertical) {
    this._vertical = !!isVertical;

    this.rect = {x: 0, y: 0, width: 0, height: 0};
    this.contentSize = 0;
    this.thumbRect = {x: 0, y: 0, width: 0, height: 0};
  }

  draw(ctx) {
    if (!this.rect.width || !this.rect.height)
      return;
    if (this._vertical) {
      ctx.strokeStyle = 'rgba(100, 100, 100, 0.2)';
      ctx.strokeRect(this.rect.x, this.rect.y, this.rect.width, this.rect.height);
    }

    ctx.fillStyle = 'rgba(100, 100, 100, 0.4)';
    ctx.fillRect(this.thumbRect.x, this.thumbRect.y, this.thumbRect.width, this.thumbRect.height);
  }

  updateThumbRect(visibleContentSize, totalContentSize, offset, maxOffset) {
    totalContentSize = Math.max(totalContentSize, visibleContentSize + maxOffset);
    const ratio = Math.min(visibleContentSize / totalContentSize, 1.0);
    if (this._vertical) {
      this.thumbRect.x = this.rect.x;
      this.thumbRect.width = this.rect.width;

      this.thumbRect.height = Math.round(this.rect.height * ratio);
      this.thumbRect.height = Math.max(MIN_THUMB_SIZE, this.thumbRect.height);
      this.thumbRect.y = Math.round((this.rect.height - this.thumbRect.height) * offset / maxOffset);
    } else {
      this.thumbRect.y = this.rect.y;
      this.thumbRect.height = this.rect.height;

      this.thumbRect.width = Math.round(this.rect.width * ratio);
      this.thumbRect.width = Math.max(MIN_THUMB_SIZE, this.thumbRect.width);
      this.thumbRect.x = this.rect.x + Math.round((this.rect.width - this.thumbRect.width) * offset / maxOffset);
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
