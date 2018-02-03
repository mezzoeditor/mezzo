import { TextUtils } from "../utils/TextUtils.mjs";
import { Frame } from "../core/Frame.mjs";

class FontMetrics {
  constructor(charWidth, lineHeight, charHeight, baseline) {
    this.charWidth = charWidth;
    this.lineHeight = lineHeight;
    this.charHeight = charHeight;
    this.baseline = baseline;
  }

  textOffset() {
    return this.lineHeight - (this.baseline + this.charHeight);
  }
}

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

    this._animationFrameId = 0;

    this._cssWidth = 0;
    this._cssHeight = 0;
    this._ratio = this._getRatio();
    this._metrics = this._computeFontMetrics();
    this._viewport = document.createViewport(this._metrics.lineHeight, this._metrics.charWidth);
    this._viewport.setInvalidateCallback(() => this.invalidate());
    this._viewport.setRevealCallback(() => this.invalidate());

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

    this._lastCoordinates = {
      mouseDown: null,
      mouseMove: null,
      mouseUp: null,
    };
    this._mouseDownState = {
      name: null,
    };

    this._counters = new Map();
    this._renderCount = 0;
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
    this._metrics = this._computeFontMetrics();
    this.invalidate();
  }

  /**
   * @return {!Element}
   */
  canvas() {
    return this._canvas;
  }

  /**
   * @return {!FontMetrics}
   */
  _computeFontMetrics() {
    const ctx = this._canvas.getContext('2d');
    ctx.font = '14px monospace';
    ctx.textBaseline = 'top';

    const metrics = ctx.measureText('M');
    const fontHeight = 20;
    // The following will be shipped soon.
    // const fontHeight = metrics.fontBoundingBoxAscent + metrics.fontBoundingBoxDescent;

    return new FontMetrics(metrics.width, fontHeight, fontHeight - 5, 3);
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
    return this._document.positionToOffset(this._viewport.viewportPositionToTextPosition({x, y}), true /* clamp */);
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
      this._mouseDownState.insideThumb = this._vScrollbar.thumbRect.y - canvasPosition.y;
      this._scheduleRender();
      event.stopPropagation();
      event.preventDefault();
      return;
    }
    this._hScrollbar.hovered = rectHasPoint(this._hScrollbar.thumbRect, canvasPosition.x, canvasPosition.y);
    if (this._hScrollbar.hovered) {
      this._hScrollbar.dragged = true;
      this._mouseDownState.name = MouseDownStates.HSCROLL_DRAG;
      this._mouseDownState.insideThumb = this._hScrollbar.thumbRect.x - canvasPosition.x;
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

  invalidate() {
    if (!this._cssWidth || !this._cssHeight)
      return;
    // To properly handle input events, we have to update rects synchronously.
    const lineCount = this._document.lineCount();

    const gutterLength = lineCount < 100 ? 3 : (this._document.lineCount() + '').length;
    this._gutterRect.width = gutterLength * this._metrics.charWidth + 2 * GUTTER_PADDING_LEFT_RIGHT;
    this._gutterRect.height = this._cssHeight;

    this._editorRect.x = this._gutterRect.width;
    this._editorRect.width = this._cssWidth - this._gutterRect.width - SCROLLBAR_WIDTH;
    this._editorRect.height = this._cssHeight;

    this._viewport.setSize(this._editorRect.width, this._editorRect.height);
    this._viewport.vScrollbar.setSize(this._cssHeight);
    this._viewport.hScrollbar.setSize(this._cssWidth - this._gutterRect.width - SCROLLBAR_WIDTH);
    this._viewport.setPadding({
      left: 4,
      right: 3 * this._metrics.charWidth,
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

    this._hScrollbar.rect.x = this._gutterRect.width;
    this._hScrollbar.rect.y = this._cssHeight - SCROLLBAR_WIDTH;
    this._hScrollbar.rect.width = this._viewport.hScrollbar.size();
    this._hScrollbar.rect.height = this._viewport.hScrollbar.isScrollable() ? SCROLLBAR_WIDTH : 0;
    this._hScrollbar.thumbRect.x = this._hScrollbar.rect.x + this._viewport.hScrollbar.thumbOffset();
    this._hScrollbar.thumbRect.y = this._hScrollbar.rect.y;
    this._hScrollbar.thumbRect.width = this._viewport.hScrollbar.thumbSize();
    this._hScrollbar.thumbRect.height = this._hScrollbar.rect.height;

    this._scheduleRender();
  }

  _scheduleRender() {
    if (!this._animationFrameId)
      this._animationFrameId = requestAnimationFrame(this._render);
  }

  _measureTime(name, time) {
    let now = window.performance.now();
    this._counters.set(name, (this._counters.get(name) || 0) + (now - time));
    return now;
  }

  _render() {
    let time = window.performance.now();
    let startTime = time;

    this._animationFrameId = 0;

    const ctx = this._canvas.getContext('2d');

    ctx.setTransform(this._ratio, 0, 0, this._ratio, 0, 0);
    ctx.clearRect(0, 0, this._cssWidth, this._cssHeight);
    ctx.lineWidth = 1 / this._ratio;

    time = this._measureTime('setup', time);

    const {frame, decorators} = this._viewport.createFrame();

    time = this._measureTime('frame', time);

    ctx.save();
    ctx.beginPath();
    ctx.rect(this._gutterRect.x, this._gutterRect.y, this._gutterRect.width, this._gutterRect.height);
    ctx.clip();
    this._drawGutter(ctx, frame, decorators);
    ctx.restore();

    time = this._measureTime('gutter', time);

    ctx.save();
    ctx.beginPath();
    ctx.rect(this._editorRect.x, this._editorRect.y, this._editorRect.width, this._editorRect.height);
    ctx.clip();
    let textOrigin = this._viewport.textPositionToViewportPosition({line: 0, column: 0});
    textOrigin.x += this._editorRect.x;
    textOrigin.y += this._editorRect.y;
    ctx.translate(textOrigin.x, textOrigin.y);
    this._drawText(ctx, frame, decorators);
    ctx.restore();

    time = this._measureTime('text', time);

    ctx.save();
    this._drawScrollbarMarkers(ctx, frame, decorators, this._vScrollbar.rect, this._viewport.vScrollbar);
    this._vScrollbar.draw(ctx);
    this._hScrollbar.draw(ctx);
    ctx.restore();

    time = this._measureTime('scrollbar', time);

    frame.cleanup();

    time = this._measureTime('cleanup', time);
    this._measureTime('render', startTime);

    if (++this._renderCount === 100) {
      console.groupCollapsed(`Avg render time: ${this._counters.get('render') / 100}`);
      for (let key of this._counters.keys())
        console.log(`${key}: ${this._counters.get(key) / 100}`);
      console.groupEnd();
      this._counters.clear();
      this._renderCount = 0;
    }
  }

  _drawGutter(ctx, frame, decorators) {
    const {lineHeight, charWidth} = this._metrics;
    const textOffset = this._metrics.textOffset();
    ctx.fillStyle = '#eee';
    ctx.fillRect(0, 0, this._gutterRect.width, this._gutterRect.height);
    ctx.strokeStyle = 'rgb(187, 187, 187)';
    ctx.lineWidth = 1 / this._ratio;
    ctx.beginPath();
    ctx.moveTo(this._gutterRect.width, 0);
    ctx.lineTo(this._gutterRect.width, this._gutterRect.height);
    ctx.stroke();

    const textOrigin = this._viewport.textPositionToViewportPosition({line: 0, column: 0});
    ctx.translate(0, textOrigin.y);
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgb(128, 128, 128)';
    const textX = this._gutterRect.width - GUTTER_PADDING_LEFT_RIGHT;
    for (let line of frame.lines()) {
      const number = (line.line + 1) + '';
      ctx.fillText(number, textX, line.line * lineHeight + textOffset);
    }
  }

  _drawText(ctx, frame, decorators) {
    const {lineHeight, charWidth} = this._metrics;
    const textOffset = this._metrics.textOffset();
    const lines = frame.lines();
    const startLine = lines[0].line;
    const startColumn = frame.startPosition().column;
    const endColumn = frame.endPosition().column;

    for (let decorator of decorators) {
      for (let line of lines) {
        let lineContent = frame.lineContent(line);
        decorator.visitTouching(line.from, line.to, decoration => {
          this._counters.set('decorations-text', (this._counters.get('decorations-text') || 0) + 1);
          const style = this._theme[decoration.style];
          if (!style)
            return;

          if (style.text) {
            ctx.fillStyle = style.text.color || 'rgb(33, 33, 33)';
            let from = Math.max(line.from, decoration.from);
            let to = Math.min(line.to, decoration.to);
            if (from < to) {
              let text = lineContent.substring(from - line.from, to - line.from);
              let column = from - line.from + startColumn;
              ctx.fillText(text, column * charWidth, line.line * lineHeight + textOffset);
            }
          }

          // TODO: note that some editors only show selection up to line length. Setting?
          if (style.background && style.background.color) {
            ctx.fillStyle = style.background.color;
            let from = decoration.from < line.start ? line.start + startColumn : Math.max(line.start + startColumn, decoration.from);
            let to = decoration.to > line.end ? line.start + endColumn : Math.min(line.start + endColumn, decoration.to);
            if (from <= to)
              ctx.fillRect((from - line.start) * charWidth, line.line * lineHeight, (to - from) * charWidth, lineHeight);
          }

          // TODO: lines of width not divisble by ratio should be snapped by 1 / ratio.
          if (style.border) {
            ctx.strokeStyle = style.border.color || 'transparent';
            ctx.lineWidth = (style.border.width || 1) / this._ratio;

            // Note: border decorations spanning multiple lines are not supported,
            // and we silently crop them here.
            let from = decoration.from < line.start ? line.start + startColumn - 1 : Math.max(line.start + startColumn - 1, decoration.from);
            let to = decoration.to > line.end ? line.start + endColumn + 1 : Math.min(line.start + endColumn + 1, decoration.to);

            ctx.beginPath();
            if (from === to) {
              ctx.moveTo((from - line.start) * charWidth, line.line * lineHeight);
              ctx.lineTo((from - line.start) * charWidth, line.line * lineHeight + lineHeight);
            } else {
              const width = to - from;
              // TODO: border.radius should actually clip background.
              const radius = Math.min(style.border.radius || 0, Math.min(lineHeight, width * charWidth) / 2) / this._ratio;
              if (radius)
                roundRect(ctx, (from - line.start) * charWidth, line.line * lineHeight, width * charWidth, lineHeight, radius);
              else
                ctx.rect((from - line.start) * charWidth, line.line * lineHeight, width * charWidth, lineHeight);
            }
            ctx.stroke();
          }
        });
      }
    }
  }

  _drawScrollbarMarkers(ctx, frame, decorators, rect, scrollbar) {
    for (let decorator of decorators) {
      const styleName = decorator.scrollbarStyle();
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
        this._counters.set('decorations-scrollbar', (this._counters.get('decorations-scrollbar') || 0) + 1);
        const from = frame.offsetToPosition(decoration.from);
        const to = frame.offsetToPosition(decoration.to);

        let top = scrollbar.contentOffsetToScrollbarOffset(this._viewport.textPositionToContentPosition(from).y);
        let bottom = scrollbar.contentOffsetToScrollbarOffset(this._viewport.textPositionToContentPosition({
          line: to.line + 1,
          column: 0
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

        let line = this._viewport.contentPositionToTextPosition({x: 0, y: scrollbar.scrollbarOffsetToContentOffset(bottom)}).line;
        line = Math.max(to.line, line);
        return Math.max(decoration.to, frame.positionToOffset({line, column: 0}, true /* clamp */));
      });
      if (lastTop >= 0)
        ctx.fillRect(rect.x + left, rect.y + lastTop, right - left, lastBottom - lastTop);
    }
  }
}

class Scrollbar {
  constructor(isVertical) {
    this._vertical = !!isVertical;
    this.hovered = false;

    this.rect = {x: 0, y: 0, width: 0, height: 0};
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
}
