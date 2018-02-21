import { Frame } from "../core/Frame.mjs";
import { RoundMode } from "../core/Metrics.mjs";

import { ensureTrace } from "../core/Trace.mjs";
ensureTrace();

class CtxMeasurer {
  constructor(ctx, monospace) {
    // The following will be shipped soon.
    // const fontHeight = metrics.fontBoundingBoxAscent + metrics.fontBoundingBoxDescent;
    const fontHeight = 20;
    const charHeight = fontHeight - 5;

    this._ctx = ctx;
    this._monospace = monospace;
    ctx.font = monospace ? '14px monospace' : '14px sans-serif';
    ctx.textBaseline = 'top';

    this.defaultWidth = monospace ? ctx.measureText('M').width : 0;
    this.defaultHeight = fontHeight;
    this.textOffset = fontHeight - (3 + charHeight);
    this.lineHeight = fontHeight;

    this._map = new Float32Array(65536);
    this._default = new Uint8Array(65536);
    this._default.fill(2);
  }

  measureChunk(chunk) {
    if (!chunk)
      return 0;

    if (this._monospace && CtxMeasurer._asciiRegex.test(chunk))
      return 0;

    let defaults = 0;
    let result = 0;
    for (let i = 0; i < chunk.length; i++) {
      let charCode = chunk.charCodeAt(i);
      if (this._default[charCode] === 2) {
        let width = this._ctx.measureText(chunk[i]).width;
        this._map[charCode] = width;
        this._default[charCode] = width === this.defaultWidth ? 1 : 0;
      }
      if (this._default[charCode] === 1) {
        defaults++;
      } else {
        result += this._map[charCode];
      }
    }
    return defaults === chunk.length ? 0 : result + defaults * this.defaultWidth;
  }

  measureChar(charCode) {
    if (this._default[charCode] === 2) {
      let width = this._ctx.measureText(String.fromCharCode(charCode)).width;
      this._map[charCode] = width;
      this._default[charCode] = width === this.defaultWidth ? 1 : 0;
    }
    return this._map[charCode];
  }
};

CtxMeasurer._asciiRegex = /^[\u{0020}-\u{007e}]*$/u;

const MIN_THUMB_SIZE = 30;
const GUTTER_PADDING_LEFT_RIGHT = 4;
const SCROLLBAR_WIDTH = 15;
const kMinScrollbarDecorationHeight = 5;

const MouseDownStates = {
  VSCROLL_DRAG: 'VSCROLL_DRAG',
  HSCROLL_DRAG: 'HSCROLL_DRAG',
};

function rectHasPoint(rect, x, y) {
  return rect.x <= x && x <= rect.x + rect.width && rect.y <= y && y <= rect.y + rect.height;
}

function roundRect(ctx, x, y, width, height, radius) {
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
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
    this._monospace = true;

    this._animationFrameId = 0;

    this._cssWidth = 0;
    this._cssHeight = 0;
    this._ratio = this._getRatio();
    this._updateMeasurer();
    this._viewport = document.createViewport();
    this._viewport.setInvalidateCallback(() => this.invalidate());
    this._viewport.setRevealCallback(() => this.invalidate());

    this._render = this._render.bind(this);

    this._canvas.addEventListener('mousedown', event => this._onMouseDown(event));
    this._canvas.addEventListener('mousemove', event => this._onMouseMove(event));
    this._canvas.addEventListener('mouseup', event => this._onMouseUp(event));
    this._canvas.addEventListener('mouseout', event => this._onMouseOut(event));
    this._canvas.addEventListener('wheel', event => this._onScroll(event));

    // Rects are in css pixels, in canvas coordinates.
    this._gutterRect = {
      x: 0, y: 0, width: 0, height: 0
    };
    this._editorRect = {
      x: 0, y: 0, width: 0, height: 0
    };
    this._vScrollbar = {
      rect: {x: 0, y: 0, width: 0, height: 0},
      thumbRect: {x: 0, y: 0, width: 0, height: 0},
      hovered: false,
      dragged: false
    };
    this._hScrollbar = {
      rect: {x: 0, y: 0, width: 0, height: 0},
      thumbRect: {x: 0, y: 0, width: 0, height: 0},
      hovered: false,
      dragged: false
    };

    this._lastCoordinates = {
      mouseDown: null,
      mouseMove: null,
      mouseUp: null,
    };
    this._mouseDownState = {
      name: null,
    };
  }

  /**
   * @return {!Viewport}
   */
  viewport() {
    return this._viewport;
  }

  theme() {
    return this._theme;
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
    this._updateMeasurer(true);
    this.invalidate();
  }

  /**
   * @param {boolean} monospace
   */
  setUseMonospaceFont(monospace) {
    this._monospace = monospace;
    this._updateMeasurer();
    this.invalidate();
  }

  /**
   * @return {!Element}
   */
  canvas() {
    return this._canvas;
  }

  _updateMeasurer(fromResizeBuggy) {
    this._measurer = new CtxMeasurer(this._canvas.getContext('2d'), this._monospace);
    // Updating in document every time is slow, but not doing it is a bug.
    if (!fromResizeBuggy)
      this._document.setMeasurer(this._measurer);
  }

  _mouseEventToCanvas(event) {
    const bounds = this._canvas.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const y = event.clientY - bounds.top;
    return {x, y};
  }

  _canvasToTextOffset({x, y}) {
    x -= this._editorRect.x;
    y -= this._editorRect.y;
    return this._document.pointToOffset(
        this._viewport.viewportPointToDocumentPoint({x, y}),
        RoundMode.Round);
  }

  /**
   * @param {!MouseEvent} event
   * @return {number}
   */
  mouseEventToTextOffset(event) {
    return this._canvasToTextOffset(this._mouseEventToCanvas(event));
  }

  _onScroll(event) {
    this._viewport.advanceScroll(event.deltaY, event.deltaX);
    this.invalidate();
    event.preventDefault();
  }

  _onMouseDown(event) {
    const canvasPosition = this._mouseEventToCanvas(event);
    this._lastCoordinates.mouseDown = canvasPosition;

    this._vScrollbar.hovered = rectHasPoint(this._vScrollbar.thumbRect, canvasPosition.x, canvasPosition.y);
    if (this._vScrollbar.hovered) {
      this._vScrollbar.dragged = true;
      this._mouseDownState.name = MouseDownStates.VSCROLL_DRAG;
      this._mouseDownState.insideThumb = this._viewport.vScrollbar.thumbOffset() - (canvasPosition.y - this._vScrollbar.rect.y);
      this._scheduleRender();
      event.stopPropagation();
      event.preventDefault();
      return;
    }
    this._hScrollbar.hovered = rectHasPoint(this._hScrollbar.thumbRect, canvasPosition.x, canvasPosition.y);
    if (this._hScrollbar.hovered) {
      this._hScrollbar.dragged = true;
      this._mouseDownState.name = MouseDownStates.HSCROLL_DRAG;
      this._mouseDownState.insideThumb = this._viewport.hScrollbar.thumbOffset() - (canvasPosition.x - this._hScrollbar.rect.x);
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
      let textHovered = rectHasPoint(this._editorRect, canvasPosition.x, canvasPosition.y);
      if (textHovered && !this._hScrollbar.hovered && !this._vScrollbar.hovered)
        this._canvas.style.setProperty('cursor', 'text');
      else
        this._canvas.style.setProperty('cursor', 'default' || gutterHovered);
      this._scheduleRender();
    } else if (this._mouseDownState.name === MouseDownStates.VSCROLL_DRAG) {
      let scrollbarOffset = canvasPosition.y - this._vScrollbar.rect.y + this._mouseDownState.insideThumb;
      this._viewport.vScrollbar.setThumbOffset(scrollbarOffset);
      this.invalidate();
    } else if (this._mouseDownState.name === MouseDownStates.HSCROLL_DRAG) {
      let scrollbarOffset = canvasPosition.x - this._hScrollbar.rect.x + this._mouseDownState.insideThumb;
      this._viewport.hScrollbar.setThumbOffset(scrollbarOffset);
      this.invalidate();
    }
  }

  _onMouseUp(event) {
    const canvasPosition = this._mouseEventToCanvas(event);
    this._lastCoordinates.mouseUp = canvasPosition;
    this._mouseDownState.name = null;
    this._mouseDownState.insideThumb = null;
    this._vScrollbar.dragged = false;
    this._hScrollbar.dragged = false;
    this._vScrollbar.hovered = rectHasPoint(this._vScrollbar.thumbRect, canvasPosition.x, canvasPosition.y);
    this._hScrollbar.hovered = rectHasPoint(this._hScrollbar.thumbRect, canvasPosition.x, canvasPosition.y);
    this._scheduleRender();
  }

  _onMouseOut(event) {
    const canvasPosition = this._mouseEventToCanvas(event);
    this._lastCoordinates.mouseUp = canvasPosition;
    this._mouseDownState.name = null;
    this._mouseDownState.insideThumb = null;
    this._vScrollbar.dragged = false;
    this._hScrollbar.dragged = false;
    this._vScrollbar.hovered = false;
    this._hScrollbar.hovered = false;
    this._scheduleRender();
  }

  invalidate() {
    if (!this._cssWidth || !this._cssHeight)
      return;
    // To properly handle input events, we have to update rects synchronously.
    const gutterLength = (Math.max(this._document.lineCount(), 100) + '').length;
    const gutterWidth = (this._measurer.measureChunk('9') || this._measurer.defaultWidth) * gutterLength;
    this._gutterRect.width = gutterWidth + 2 * GUTTER_PADDING_LEFT_RIGHT;
    this._gutterRect.height = this._cssHeight;

    this._editorRect.x = this._gutterRect.width;
    this._editorRect.width = this._cssWidth - this._gutterRect.width - SCROLLBAR_WIDTH;
    this._editorRect.height = this._cssHeight;

    this._viewport.setSize(this._editorRect.width, this._editorRect.height);
    this._viewport.vScrollbar.setSize(this._cssHeight);
    this._viewport.hScrollbar.setSize(this._cssWidth - this._gutterRect.width - SCROLLBAR_WIDTH);
    this._viewport.setPadding({
      left: 4,
      right: this._measurer.measureChunk('MMM') || this._measurer.defaultWidth * 3,
      top: 4,
      bottom: this._editorRect.height - this._measurer.lineHeight - 4
    });

    this._vScrollbar.rect.x = this._cssWidth - SCROLLBAR_WIDTH;
    this._vScrollbar.rect.y = 0;
    this._vScrollbar.rect.width = SCROLLBAR_WIDTH;
    this._vScrollbar.rect.height = this._viewport.vScrollbar.size();
    this._vScrollbar.thumbRect.x = this._vScrollbar.rect.x;
    this._vScrollbar.thumbRect.y = this._viewport.vScrollbar.thumbOffset();
    this._vScrollbar.thumbRect.width = this._vScrollbar.rect.width;
    this._vScrollbar.thumbRect.height = this._viewport.vScrollbar.thumbSize();
    if (this._vScrollbar.thumbRect.height < MIN_THUMB_SIZE) {
      let delta = MIN_THUMB_SIZE - this._vScrollbar.thumbRect.height;
      this._vScrollbar.thumbRect.y -= delta * this._viewport.vScrollbar.scrolledPercentage();
      this._vScrollbar.thumbRect.height = MIN_THUMB_SIZE;
    }

    this._hScrollbar.rect.x = this._gutterRect.width;
    this._hScrollbar.rect.y = this._cssHeight - SCROLLBAR_WIDTH;
    this._hScrollbar.rect.width = this._viewport.hScrollbar.size();
    this._hScrollbar.rect.height = this._viewport.hScrollbar.isScrollable() ? SCROLLBAR_WIDTH : 0;
    this._hScrollbar.thumbRect.x = this._hScrollbar.rect.x + this._viewport.hScrollbar.thumbOffset();
    this._hScrollbar.thumbRect.y = this._hScrollbar.rect.y;
    this._hScrollbar.thumbRect.width = this._viewport.hScrollbar.thumbSize();
    this._hScrollbar.thumbRect.height = this._hScrollbar.rect.height;
    if (this._hScrollbar.thumbRect.width < MIN_THUMB_SIZE) {
      let delta = MIN_THUMB_SIZE - this._hScrollbar.thumbRect.width;
      this._hScrollbar.thumbRect.x -= delta * this._viewport.hScrollbar.scrolledPercentage();
      this._hScrollbar.thumbRect.width = MIN_THUMB_SIZE;
    }

    this._scheduleRender();
  }

  _scheduleRender() {
    if (!this._animationFrameId)
      this._animationFrameId = requestAnimationFrame(this._render);
  }

  _render() {
    self.trace.beginGroup('render');
    this._animationFrameId = 0;

    const ctx = this._canvas.getContext('2d');
    ctx.setTransform(this._ratio, 0, 0, this._ratio, 0, 0);
    ctx.clearRect(0, 0, this._cssWidth, this._cssHeight);
    ctx.lineWidth = 1 / this._ratio;

    self.trace.begin('frame');
    const {frame, text, scrollbar} = this._viewport.createFrame();
    self.trace.end('frame');

    self.trace.begin('gutter');
    ctx.save();
    ctx.beginPath();
    ctx.rect(this._gutterRect.x, this._gutterRect.y, this._gutterRect.width, this._gutterRect.height);
    ctx.clip();
    this._drawGutter(ctx, frame);
    ctx.restore();
    self.trace.end('gutter');

    self.trace.beginGroup('text');
    ctx.save();
    ctx.beginPath();
    ctx.rect(this._editorRect.x, this._editorRect.y, this._editorRect.width, this._editorRect.height);
    ctx.clip();
    let textOrigin = this._viewport.documentPointToViewportPoint({x: 0, y: 0});
    textOrigin.x += this._editorRect.x;
    textOrigin.y += this._editorRect.y;
    ctx.translate(textOrigin.x, textOrigin.y);
    this._drawText(ctx, frame, text);
    ctx.restore();
    self.trace.endGroup('text');

    self.trace.beginGroup('scrollbar');
    ctx.save();
    this._drawScrollbarMarkers(ctx, frame, scrollbar, this._vScrollbar.rect, this._viewport.vScrollbar);
    this._drawScrollbar(ctx, this._vScrollbar, true /* isVertical */);
    this._drawScrollbar(ctx, this._hScrollbar, false /* isVertical */);
    ctx.restore();
    self.trace.endGroup('scrollbar');

    frame.cleanup();

    self.trace.endGroup('render', 50);
  }

  _drawGutter(ctx, frame) {
    const textOffset = this._measurer.textOffset;
    ctx.fillStyle = '#eee';
    ctx.fillRect(0, 0, this._gutterRect.width, this._gutterRect.height);
    ctx.strokeStyle = 'rgb(187, 187, 187)';
    ctx.lineWidth = 1 / this._ratio;
    ctx.beginPath();
    ctx.moveTo(this._gutterRect.width, 0);
    ctx.lineTo(this._gutterRect.width, this._gutterRect.height);
    ctx.stroke();

    const textOrigin = this._viewport.documentPointToViewportPoint({x: 0, y: 0});
    ctx.translate(0, textOrigin.y);
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgb(128, 128, 128)';
    const textX = this._gutterRect.width - GUTTER_PADDING_LEFT_RIGHT;
    for (let line of frame.lines()) {
      const number = (line.line + 1) + '';
      ctx.fillText(number, textX, line.start.y + textOffset);
    }
  }

  _drawText(ctx, frame, textDecorators) {
    const lineHeight = this._measurer.lineHeight;
    const textOffset = this._measurer.textOffset;
    const lines = frame.lines();
    const frameRight = frame.origin().x + frame.width();

    for (let decorator of textDecorators) {
      for (let line of lines) {
        let lineContent = line.content();
        let offsetToX = new Float32Array(line.to.offset - line.from.offset + 1);
        for (let x = line.from.x, i = 0; i <= line.to.offset - line.from.offset; i++) {
          offsetToX[i] = x;
          if (i < lineContent.length)
            x += this._measurer.measureChar(lineContent.charCodeAt(i));
        }

        decorator.visitTouching(line.from.offset, line.to.offset, decoration => {
          self.trace.count('decorations');
          const style = this._theme[decoration.data];
          if (!style)
            return;

          if (style.text) {
            ctx.fillStyle = style.text.color || 'rgb(33, 33, 33)';
            let from = Math.max(line.from.offset, decoration.from);
            let to = Math.min(line.to.offset, decoration.to);
            if (from < to) {
              let text = lineContent.substring(from - line.from.offset, to - line.from.offset);
              ctx.fillText(text, offsetToX[from - line.from.offset], line.start.y + textOffset);
            }
          }

          // TODO: note that some editors only show selection up to line length. Setting?
          if (style.background && style.background.color) {
            ctx.fillStyle = style.background.color;
            let from = decoration.from < line.from.offset ? line.from.x : offsetToX[decoration.from - line.from.offset];
            let to = decoration.to > line.to.offset ? frameRight : offsetToX[decoration.to - line.from.offset];
            if (from <= to)
              ctx.fillRect(from, line.start.y, to - from, lineHeight);
          }

          // TODO: lines of width not divisble by ratio should be snapped by 1 / ratio.
          if (style.border) {
            ctx.strokeStyle = style.border.color || 'transparent';
            ctx.lineWidth = (style.border.width || 1) / this._ratio;

            // Note: border decorations spanning multiple lines are not supported,
            // and we silently crop them here.
            let from = decoration.from < line.from.offset ? line.from.x - 1 : offsetToX[decoration.from - line.from.offset];
            let to = decoration.to > line.to.offset ? frameRight + 1 : offsetToX[decoration.to - line.from.offset];

            ctx.beginPath();
            if (from === to) {
              ctx.moveTo(from, line.start.y);
              ctx.lineTo(from, line.start.y + lineHeight);
            } else {
              const width = to - from;
              // TODO: border.radius should actually clip background.
              const radius = Math.min(style.border.radius || 0, Math.min(lineHeight, width) / 2) / this._ratio;
              if (radius)
                roundRect(ctx, from, line.start.y, width, lineHeight, radius);
              else
                ctx.rect(from, line.start.y, width, lineHeight);
            }
            ctx.stroke();
          }
        });
      }
    }
  }

  _drawScrollbar(ctx, scrollbar, isVertical) {
    if (!scrollbar.rect.width || !scrollbar.rect.height)
      return;
    if (isVertical) {
      ctx.strokeStyle = 'rgba(100, 100, 100, 0.2)';
      ctx.strokeRect(scrollbar.rect.x, scrollbar.rect.y, scrollbar.rect.width, scrollbar.rect.height);
    }

    if (scrollbar.dragged)
      ctx.fillStyle = 'rgba(100, 100, 100, 0.8)';
    else if (scrollbar.hovered)
      ctx.fillStyle = 'rgba(100, 100, 100, 0.6)';
    else
      ctx.fillStyle = 'rgba(100, 100, 100, 0.4)'
    ctx.fillRect(scrollbar.thumbRect.x, scrollbar.thumbRect.y, scrollbar.thumbRect.width, scrollbar.thumbRect.height);
  }

  _drawScrollbarMarkers(ctx, frame, scrollbarDecorators, rect, scrollbar) {
    for (let decorator of scrollbarDecorators) {
      const styleName = decorator.style();
      if (!styleName)
        continue;
      const style = this._theme[styleName];
      if (!style || !style.scrollbar || !style.scrollbar.color)
        continue;
      ctx.fillStyle = style.scrollbar.color;
      let left = Math.round(rect.width * (style.scrollbar.left || 0) / 100);
      let right = Math.round(rect.width * (style.scrollbar.right || 100) / 100);

      let lastTop = -1;
      let lastBottom = -1;
      decorator.sparseVisitAll(decoration => {
        self.trace.count('decorations');
        const from = frame.offsetToLocation(decoration.from);
        const to = frame.offsetToLocation(decoration.to);

        let top = scrollbar.contentOffsetToScrollbarOffset(this._viewport.documentPointToViewPoint(from).y);
        let bottom = scrollbar.contentOffsetToScrollbarOffset(this._viewport.documentPointToViewPoint({
          x: 0,
          y: to.y + frame.document().measurer().defaultHeight
        }).y);
        bottom = Math.max(bottom, top + kMinScrollbarDecorationHeight);

        if (top <= lastBottom) {
          lastBottom = bottom;
        } else {
          if (lastTop >= 0)
            ctx.fillRect(rect.x + left, rect.y + lastTop, right - left, lastBottom - lastTop);
          lastTop = top;
          lastBottom = bottom;
        }

        let nextY = this._viewport.viewPointToDocumentPoint({x: 0, y: scrollbar.scrollbarOffsetToContentOffset(bottom)}).y;
        let line = frame.pointToPosition({x: 0, y: nextY}).line;
        line = Math.max(to.line, line);
        return Math.max(decoration.to, frame.positionToOffset({line, column: 0}));
      });
      if (lastTop >= 0)
        ctx.fillRect(rect.x + left, rect.y + lastTop, right - left, lastBottom - lastTop);
    }
  }
}
