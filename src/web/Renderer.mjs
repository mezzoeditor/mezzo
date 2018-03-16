import { RoundMode, Unicode } from '../core/Unicode.mjs';
import { Viewport } from '../core/Viewport.mjs';
import { trace } from '../core/Trace.mjs';

class ContextBasedMetrics {
  constructor(ctx, monospace) {
    // The following will be shipped soon.
    // const fontHeight = metrics.fontBoundingBoxAscent + metrics.fontBoundingBoxDescent;
    const fontHeight = 20;
    const charHeight = fontHeight - 5;

    ctx.font = monospace ? '14px monospace' : '14px sans-serif';
    ctx.textBaseline = 'top';

    this.textOffset = fontHeight - (3 + charHeight);
    this.lineHeight = fontHeight;

    this.width9 = ctx.measureText('9').width;
    this.widthM = ctx.measureText('M').width;

    this.measurer = new Unicode.CachingMeasurer(
      monospace ? ctx.measureText('M').width : 0,
      fontHeight,
      monospace ? Unicode.asciiRegex : null,
      s => ctx.measureText(s).width,
      s => ctx.measureText(s).width
    );
  }
};

const MIN_THUMB_SIZE = 30;
const GUTTER_PADDING_LEFT_RIGHT = 4;
const SCROLLBAR_WIDTH = 15;

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
    this._beforeFrameCallbacks = [];
    this._rendering = false;

    this._cssWidth = 0;
    this._cssHeight = 0;
    this._ratio = this._getRatio();
    this._viewport = new Viewport(document);
    this._viewport.setRevealCallback(() => this.invalidate());
    this._updateMetrics();

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
    this._updateMetrics(true);
    this.invalidate();
  }

  /**
   * @param {boolean} monospace
   */
  setUseMonospaceFont(monospace) {
    this._monospace = monospace;
    this._updateMetrics();
    this.invalidate();
  }

  addBeforeFrameCallback(callback) {
    this._beforeFrameCallbacks.push(callback);
  }

  removeBeforeFrameCallback(callback) {
    let index = this._beforeFrameCallbacks.indexOf(callback);
    if (index !== -1)
      this._beforeFrameCallbacks.splice(index, 1);
  }

  /**
   * @return {!Element}
   */
  canvas() {
    return this._canvas;
  }

  _updateMetrics(fromResizeBuggy) {
    this._metrics = new ContextBasedMetrics(this._canvas.getContext('2d'), this._monospace);
    // Updating in viewport every time is slow, but not doing it might be wrong on
    // scale change. We should detect that.
    if (!fromResizeBuggy)
      this._viewport.setMeasurer(this._metrics.measurer);
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
    if (!this._cssWidth || !this._cssHeight || this._rendering)
      return;
    // To properly handle input events, we have to update rects synchronously.
    const gutterLength = (Math.max(this._document.lineCount(), 100) + '').length;
    const gutterWidth = this._metrics.width9 * gutterLength;
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
      right: this._metrics.widthM * 3,
      top: 4,
      bottom: this._editorRect.height - this._metrics.lineHeight - 4
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
    trace.beginGroup('render');
    this._rendering = true;

    trace.begin('beforeframe');
    for (let callback of this._beforeFrameCallbacks)
      callback();
    trace.end('beforeframe');

    this._animationFrameId = 0;

    const ctx = this._canvas.getContext('2d');
    ctx.setTransform(this._ratio, 0, 0, this._ratio, 0, 0);
    ctx.clearRect(0, 0, this._cssWidth, this._cssHeight);
    ctx.lineWidth = 1 / this._ratio;

    trace.begin('frame');
    const {text, background, scrollbar, lines} = this._viewport.decorate();
    trace.end('frame');

    trace.begin('gutter');
    ctx.save();
    ctx.beginPath();
    ctx.rect(this._gutterRect.x, this._gutterRect.y, this._gutterRect.width, this._gutterRect.height);
    ctx.clip();
    this._drawGutter(ctx, lines);
    ctx.restore();
    trace.end('gutter');

    trace.beginGroup('text');
    ctx.save();
    ctx.beginPath();
    ctx.rect(this._editorRect.x, this._editorRect.y, this._editorRect.width, this._editorRect.height);
    ctx.clip();
    ctx.translate(this._editorRect.x, this._editorRect.y);
    this._drawTextAndBackground(ctx, text, background);
    ctx.restore();
    trace.endGroup('text');

    trace.beginGroup('scrollbar');
    ctx.save();
    this._drawScrollbarMarkers(ctx, scrollbar, this._vScrollbar.rect);
    this._drawScrollbar(ctx, this._vScrollbar, true /* isVertical */);
    this._drawScrollbar(ctx, this._hScrollbar, false /* isVertical */);
    ctx.restore();
    trace.endGroup('scrollbar');

    this._rendering = false;
    trace.endGroup('render', 50);
  }

  _drawGutter(ctx, lines) {
    ctx.fillStyle = '#eee';
    ctx.fillRect(0, 0, this._gutterRect.width, this._gutterRect.height);
    ctx.strokeStyle = 'rgb(187, 187, 187)';
    ctx.lineWidth = 1 / this._ratio;
    ctx.beginPath();
    ctx.moveTo(this._gutterRect.width, 0);
    ctx.lineTo(this._gutterRect.width, this._gutterRect.height);
    ctx.stroke();

    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgb(128, 128, 128)';
    const textOffset = this._metrics.textOffset;
    const textX = this._gutterRect.width - GUTTER_PADDING_LEFT_RIGHT;
    for (let {line, y} of lines) {
      const number = (line + 1) + '';
      ctx.fillText(number, textX, y + textOffset);
    }
  }

  _drawTextAndBackground(ctx, text, background) {
    const lineHeight = this._metrics.lineHeight;

    for (let {x, y, width, style} of background) {
      const theme = this._theme[style];
      if (!theme)
        continue;

      if (theme.background && theme.background.color) {
        ctx.fillStyle = theme.background.color;
        ctx.fillRect(x, y, width, lineHeight);
      }

      if (theme.border) {
        // TODO: lines of width not divisble by ratio should be snapped by 1 / ratio.
        // Note: border decorations spanning multiple lines are not supported,
        // and we silently crop them per line.
        ctx.strokeStyle = theme.border.color || 'transparent';
        ctx.lineWidth = (theme.border.width || 1) / this._ratio;

        ctx.beginPath();
        if (!width) {
          ctx.moveTo(x, y);
          ctx.lineTo(x, y + lineHeight);
        } else {
          // TODO: border.radius should actually clip background.
          const radius = Math.min(theme.border.radius || 0, Math.min(lineHeight, width) / 2) / this._ratio;
          if (radius)
            roundRect(ctx, x, y, width, lineHeight, radius);
          else
            ctx.rect(x, y, width, lineHeight);
        }
        ctx.stroke();
      }
    }

    const textOffset = this._metrics.textOffset;
    for (let {x, y, content, style} of text) {
      const theme = this._theme[style];
      if (theme && theme.text) {
        ctx.fillStyle = theme.text.color || 'rgb(33, 33, 33)';
        ctx.fillText(content, x, y + textOffset);
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

  _drawScrollbarMarkers(ctx, scrollbar, rect) {
    for (let {y, height, style} of scrollbar) {
      const theme = this._theme[style];
      if (!theme || !theme.scrollbar || !theme.scrollbar.color)
        continue;
      ctx.fillStyle = theme.scrollbar.color;
      let left = Math.round(rect.width * (theme.scrollbar.left || 0) / 100);
      let right = Math.round(rect.width * (theme.scrollbar.right || 100) / 100);
      ctx.fillRect(rect.x + left, rect.y + y, right - left, height);
    }
  }
}
