import { TextUtils } from "../utils/TextUtils.mjs";

class FontMetrics {
  constructor(charWidth, charHeight, lineHeight) {
    this.charWidth = charWidth;
    this.charHeight = charHeight;
    this.lineHeight = lineHeight;
  }
}

const GUTTER_PADDING_LEFT_RIGHT = 4;
const EDITOR_MARGIN_LEFT = 4;
const SCROLLBAR_WIDTH = 15;
const MIN_THUMB_SIZE = 30;

const MouseDownStates = {
  VSCROLL_DRAG: 'VSCROLL_DRAG',
  HSCROLL_DRAG: 'HSCROLL_DRAG',
};

function rectHasPoint(rect, x, y) {
  return rect.x <= x && x <= rect.x + rect.width && rect.y <= y && y <= rect.y + rect.height;
}

export class Renderer {
  /**
   * @param {!Document} domDocument
   * @param {!Document} document
   * @param {!Theme} theme
   */
  constructor(domDocument, document, theme) {
    this._canvas = domDocument.createElement('canvas');
    this._document = document;
    this._theme = theme;

    this._animationFrameId = 0;

    this._cssWidth = 0;
    this._cssHeight = 0;
    this._ratio = this._getRatio();
    this._scrollLeft = 0;
    this._scrollTop = 0;

    this._render = this._render.bind(this);

    this._canvas.addEventListener('mousedown', event => this._onMouseDown(event));
    this._canvas.addEventListener('mousemove', event => this._onMouseMove(event));
    this._canvas.addEventListener('mouseup', event => this._onMouseUp(event));
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

    this._lastCoordinates = {
      mouseDown: null,
      mouseMove: null,
      mouseUp: null,
    };
    this._mouseDownState = {
      name: null,
      scrollLeft: 0,
      scrollTop: 0
    };
  }

  _getRatio() {
    const ctx = this._canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const bsr = ctx.webkitBackingStorePixelRatio ||
      ctx.mozBackingStorePixelRatio ||
      ctx.msBackingStorePixelRatio ||
      ctx.oBackingStorePixelRatio ||
      ctx.backingStorePixelRatio || 1;
    return dpr / bsr;
  }

  /**
   * @param {number} cssWidth
   * @param {number} cssHeight
   */
  setSize(cssWidth, cssHeight) {
    if (this._cssWidth === cssWidth && this._cssHeight === cssHeight)
      return;
    this._ratio = this._getRatio();
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
   * @return {!Element}
   */
  canvas() {
    return this._canvas;
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

  _mouseEventToCanvas(event) {
    const bounds = this._canvas.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const y = event.clientY - bounds.top;
    return {x, y};
  }

  _canvasToTextOffset({x, y}) {
    x += this._scrollLeft - this._editorRect.x;
    y += this._scrollTop - this._editorRect.y;

    const position = {
      line: Math.floor(y / this._metrics.lineHeight),
      column: Math.round(x / this._metrics.charWidth),
    };
    return this._document.positionToOffset(position, true /* clamp */);
  }

  /**
   * @param {!MouseEvent} event
   * @return {number}
   */
  mouseEventToTextOffset(event) {
    return this._canvasToTextOffset(this._mouseEventToCanvas(event));
  }

  _onScroll(event) {
    this._scrollTop += event.deltaY;
    this._scrollLeft += event.deltaX;
    this.invalidate();

    event.stopPropagation();
    event.preventDefault();
  }

  _onMouseDown(event) {
    const canvasPosition = this._mouseEventToCanvas(event);
    this._lastCoordinates.mouseDown = canvasPosition;

    this._vScrollbar.hovered = rectHasPoint(this._vScrollbar.thumbRect, canvasPosition.x, canvasPosition.y);
    if (this._vScrollbar.hovered) {
      this._vScrollbar.dragged = true;
      this._mouseDownState.name = MouseDownStates.VSCROLL_DRAG;
      this._mouseDownState.scrollTop = this._scrollTop;
      this._mouseDownState.scrollLeft = this._scrollLeft;
      this._scheduleRender();
      event.stopPropagation();
      event.preventDefault();
      return;
    }
    this._hScrollbar.hovered = rectHasPoint(this._hScrollbar.thumbRect, canvasPosition.x, canvasPosition.y);
    if (this._hScrollbar.hovered) {
      this._hScrollbar.dragged = true;
      this._mouseDownState.name = MouseDownStates.HSCROLL_DRAG;
      this._mouseDownState.scrollTop = this._scrollTop;
      this._mouseDownState.scrollLeft = this._scrollLeft;
      this._scheduleRender();
      event.stopPropagation();
      event.preventDefault();
      return;
    }
  }

  _onMouseMove(event) {
    const canvasPosition = this._mouseEventToCanvas(event);
    this._lastCoordinates.mouseMove = canvasPosition;

    if (!this._mouseDownState.name) {
      this._vScrollbar.hovered = rectHasPoint(this._vScrollbar.thumbRect, canvasPosition.x, canvasPosition.y);
      this._hScrollbar.hovered = rectHasPoint(this._hScrollbar.thumbRect, canvasPosition.x, canvasPosition.y);
      if (this._vScrollbar.hovered || this._hScrollbar.hovered)
        this._canvas.style.setProperty('cursor', 'default');
      else
        this._canvas.style.setProperty('cursor', 'text');
      this._scheduleRender();
    } else if (this._mouseDownState.name === MouseDownStates.VSCROLL_DRAG) {
      const ratio = (canvasPosition.y - this._lastCoordinates.mouseDown.y) / (this._vScrollbar.rect.height - this._vScrollbar.thumbRect.height);
      this._scrollTop = this._mouseDownState.scrollTop + this._maxScrollTop * ratio;
      this.invalidate();
    } else if (this._mouseDownState.name === MouseDownStates.HSCROLL_DRAG) {
      const ratio = (canvasPosition.x - this._lastCoordinates.mouseDown.x) / (this._hScrollbar.rect.width  - this._hScrollbar.thumbRect.width);
      this._scrollLeft = this._mouseDownState.scrollLeft + this._maxScrollLeft * ratio;
      this.invalidate();
    }
  }

  _onMouseUp(event) {
    const canvasPosition = this._mouseEventToCanvas(event);
    this._lastCoordinates.mouseUp = canvasPosition;
    this._mouseDownState.name = null;
    this._vScrollbar.dragged = false;
    this._hScrollbar.dragged = false;
    this._vScrollbar.hovered = rectHasPoint(this._vScrollbar.thumbRect, canvasPosition.x, canvasPosition.y);
    this._hScrollbar.hovered = rectHasPoint(this._hScrollbar.thumbRect, canvasPosition.x, canvasPosition.y);
    this._scheduleRender();
  }

  invalidate() {
    // To properly handle input events, we have to update rects synchronously.
    const lineCount = this._document.lineCount();

    this._maxScrollTop = Math.max(0, (lineCount - 1) * this._metrics.lineHeight);
    this._maxScrollLeft = Math.max(0, (this._document.longestLineLength() + 3) * this._metrics.charWidth - this._editorRect.width);

    this._scrollLeft = Math.max(this._scrollLeft, 0);
    this._scrollLeft = Math.min(this._scrollLeft, this._maxScrollLeft);
    this._scrollTop = Math.max(this._scrollTop, 0);
    this._scrollTop = Math.min(this._scrollTop, this._maxScrollTop);

    const gutterLength = lineCount < 100 ? 3 : (this._document.lineCount() + '').length;
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
    this._hScrollbar.updateThumbRect(this._editorRect.width, this._document.longestLineLength() * this._metrics.charWidth, this._scrollLeft, this._maxScrollLeft);

    this._scheduleRender();
  }

  _scheduleRender() {
    if (!this._animationFrameId)
      this._animationFrameId = requestAnimationFrame(this._render);
  }

  _render() {
    this._animationFrameId = 0;

    const ctx = this._canvas.getContext('2d');
    const {lineHeight, charWidth} = this._metrics;

    ctx.setTransform(this._ratio, 0, 0, this._ratio, 0, 0);
    ctx.clearRect(0, 0, this._cssWidth, this._cssHeight);
    ctx.lineWidth = 1 / this._ratio;

    const start = {
      line: Math.floor(this._scrollTop / lineHeight),
      column: Math.max(Math.floor((this._scrollLeft - EDITOR_MARGIN_LEFT) / charWidth), 0)
    };
    const end = {
      line: Math.ceil((this._scrollTop + this._cssHeight) / lineHeight),
      column: Math.ceil((this._scrollLeft + this._cssWidth) / charWidth)
    };
    const viewport = this._document.buildViewport(start, end.column - start.column, end.line - start.line);

    ctx.save();
    ctx.beginPath();
    ctx.rect(this._gutterRect.x, this._gutterRect.y, this._gutterRect.width, this._gutterRect.height);
    ctx.clip();
    this._drawGutter(ctx, viewport);
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.rect(this._editorRect.x - EDITOR_MARGIN_LEFT, this._editorRect.y, this._editorRect.width + EDITOR_MARGIN_LEFT, this._editorRect.height);
    ctx.clip();
    ctx.translate(-this._scrollLeft + this._editorRect.x, -this._scrollTop + this._editorRect.y);
    this._drawText(ctx, viewport);
    ctx.restore();

    ctx.save();
    this._vScrollbar.draw(ctx);
    this._hScrollbar.draw(ctx);
    ctx.restore();
  }

  _drawGutter(ctx, viewport) {
    const {lineHeight, charWidth} = this._metrics;
    ctx.fillStyle = '#eee';
    ctx.fillRect(0, 0, this._gutterRect.width, this._gutterRect.height);
    ctx.strokeStyle = 'rgb(187, 187, 187)';
    ctx.lineWidth = 1 / this._ratio;
    ctx.beginPath();
    ctx.moveTo(this._gutterRect.width, 0);
    ctx.lineTo(this._gutterRect.width, this._gutterRect.height);
    ctx.stroke();

    ctx.translate(0, -this._scrollTop);
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgb(128, 128, 128)';
    const textX = this._gutterRect.width - GUTTER_PADDING_LEFT_RIGHT;
    const lineCount = this._document.lineCount();
    for (let i = viewport.startLine(); i < viewport.startLine() + viewport.height() && i < lineCount; ++i) {
      const number = (i + 1) + '';
      ctx.fillText(number, textX, i * lineHeight);
    }
  }

  _drawText(ctx, viewport) {
    const {lineHeight, charWidth, charHeight} = this._metrics;
    const start = {
      line: viewport.startLine(),
      column: viewport.startColumn(),
    };
    const end = {
      line: start.line + viewport.height(),
      column: start.column + viewport.width()
    };

    for (const decoration of viewport.decorations()) {
      const style = this._theme[decoration.style];
      if (!style)
        continue;
      const from = viewport.document().offsetToPosition(decoration.from);
      const to = viewport.document().offsetToPosition(decoration.to);
      if (style.color) {
        ctx.fillStyle = style.color;
        if (from.column < end.column) {
          let rEnd = end.column;
          if (to.line === from.line && to.column < end.column)
            rEnd = to.column;
          let rBegin = from.column;
          const text = TextUtils.lineChunk(this._document, from.line, rBegin, rEnd);
          ctx.fillText(text, rBegin * charWidth, from.line * lineHeight);
        }
        for (let i = from.line + 1; i < to.line; ++i) {
          let rBegin = Math.max(start.column - 1, 0);
          let rHeight = to.line - from.line - 1;
          const text = TextUtils.lineChunk(this._document, i, rBegin, end.column);
          ctx.fillText(text, rBegin * charWidth, i * lineHeight);
        }
        if (from.line < to.line && to.column > start.column) {
          let rBegin = Math.max(start.column - 1, 0);
          const text = TextUtils.lineChunk(this._document, to.line, rBegin, to.column);
          ctx.fillText(text, rBegin * charWidth, to.line * lineHeight);
        }
      }
      if (style.backgroundColor) {
        ctx.fillStyle = style.backgroundColor;
        if (from.column < end.column) {
          let rEnd = end.column;
          if (to.line === from.line && to.column < end.column)
            rEnd = to.column;
          let rBegin = from.column;
          ctx.fillRect(rBegin * charWidth, from.line * lineHeight, charWidth * (rEnd - rBegin), lineHeight);
        }
        if (to.line - from.line > 1) {
          let rBegin = Math.max(start.column - 1, 0);
          let rHeight = to.line - from.line - 1;
          ctx.fillRect(rBegin * charWidth, (from.line + 1) * lineHeight, charWidth * (end.column - rBegin), lineHeight * rHeight);
        }
        if (from.line < to.line && to.column > start.column) {
          let rBegin = Math.max(start.column - 1, 0);
          ctx.fillRect(rBegin * charWidth, to.line * lineHeight, charWidth * (to.column - rBegin), lineHeight);
        }
      }
      if (style.borderColor) {
        ctx.strokeStyle = style.borderColor;
        ctx.lineWidth = (style.borderWidth || 1) / this._ratio;
        ctx.beginPath();
        if (decoration.from === decoration.to) {
          ctx.moveTo(from.column * charWidth, from.line * lineHeight);
          ctx.lineTo(from.column * charWidth, from.line * lineHeight + lineHeight);
        } else {
          const width = to.column - from.column;
          const height = to.line - from.line + 1;
          ctx.rect(from.column * charWidth, from.line * lineHeight, width * charWidth, height * lineHeight);
        }
        ctx.stroke();
      }
    }
  }
}

class Scrollbar {
  constructor(isVertical) {
    this._vertical = !!isVertical;
    this.hovered = false;

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

    if (this.dragged)
      ctx.fillStyle = 'rgba(100, 100, 100, 0.8)';
    else if (this.hovered)
      ctx.fillStyle = 'rgba(100, 100, 100, 0.6)';
    else
      ctx.fillStyle = 'rgba(100, 100, 100, 0.4)'
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
