import { RoundMode, Metrics } from '../core/Metrics.mjs';
import { WrappingMode, Markup, Measurer } from '../core/Markup.mjs';
import { Frame } from '../core/Frame.mjs';
import { Editor } from '../editor/Editor.mjs';
import { trace } from '../core/Trace.mjs';
import { Document } from '../core/Document.mjs';
import { DefaultTheme } from '../default/DefaultTheme.mjs';
import { Tokenizer } from '../editor/Tokenizer.mjs';
import { EventEmitter } from '../core/EventEmitter.mjs';
import { KeymapHandler } from './KeymapHandler.mjs';

/**
 * @implements Measurer
 */
class ContextBasedMeasurer {
  constructor(ctx, monospace) {
    // The following will be shipped soon.
    // const fontHeight = metrics.fontBoundingBoxAscent + metrics.fontBoundingBoxDescent;
    const fontHeight = 20;
    const charHeight = fontHeight - 5;

    ctx.font = monospace ? '12px Menlo' : '12px BlinkMacSystemFont';
    ctx.textBaseline = 'top';

    this.textOffset = fontHeight - (3 + charHeight);

    this.width9 = ctx.measureText('9').width;
    this.widthM = ctx.measureText('M').width;

    this._defaultWidth = monospace ? ctx.measureText('M').width : 1;
    this._defaultRegex = monospace ? Metrics.asciiRegexWithNewLines : null;
    this._lineHeight = fontHeight;
    this._ctx = ctx;
  }

  defaultWidth() {
    return this._defaultWidth;
  }

  lineHeight() {
    return this._lineHeight;
  }

  defaultWidthRegex() {
    return this._defaultRegex;
  }

  measureString(s) {
    return this._ctx.measureText(s).width;
  }
};

const MIN_THUMB_SIZE = 30;
const GUTTER_PADDING_LEFT = 4;
const GUTTER_PADDING_RIGHT = 12;
const SCROLLBAR_WIDTH = 15;
const isMac = navigator.platform.toUpperCase().indexOf('MAC') !== -1;

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
   */
  constructor(domDocument) {
    this._domDocument = domDocument;
    this._element = domDocument.createElement('div');
    this._element.style.cssText = `
      position: relative;
      overflow: hidden;
      user-select: none;
      cursor: text;
    `;
    this._canvas = domDocument.createElement('canvas');
    this._canvas.style.setProperty('position', 'absolute');
    this._canvas.style.setProperty('top', '0');
    this._canvas.style.setProperty('left', '0');
    this._element.appendChild(this._canvas);

    this._input = domDocument.createElement('input');
    this._input.style.cssText = `
      outline: none;
      border: none;
      width: 0;
      height: 0;
      position: absolute;
      top: 0;
      left: 0;
    `;
    this._input.addEventListener('input', this._onInputInput.bind(this), false);
    this._element.addEventListener('keydown', this._onInputKeydown.bind(this), false);

    this._element.appendChild(this._input);

    this._theme = DefaultTheme;
    this._monospace = true;
    this._wrappingMode = WrappingMode.None;
    this._eventListeners = [];

    this._animationFrameId = 0;
    this._rendering = false;

    this._cssWidth = 0;
    this._cssHeight = 0;
    this._ratio = this._getRatio();
    this._measurer = new ContextBasedMeasurer(this._canvas.getContext('2d'), this._monospace);

    this._render = this._render.bind(this);

    this._canvas.addEventListener('mousedown', event => this._onMouseDown(event));
    this._canvas.addEventListener('mousemove', event => this._onMouseMove(event));
    this._canvas.addEventListener('mouseup', event => this._onMouseUp(event));
    this._canvas.addEventListener('mouseout', event => this._onMouseOut(event));
    this._canvas.addEventListener('mousein', event => this._onMouseIn(event));
    this._canvas.addEventListener('wheel', event => this._onScroll(event));
    this._element.addEventListener('click', event => this._onClick(event));

    this._windowListeners = {
      mousemove: this._onMouseMove.bind(this),
      mouseup: this._onMouseUp.bind(this),
    };

    // Rects are in css pixels, in canvas coordinates.
    this._gutterRect = {
      x: 0, y: 0, width: 0, height: 0
    };
    this._editorRect = {
      x: 0, y: 0, width: 0, height: 0
    };
    this._vScrollbar = {
      ratio: 1,
      rect: {x: 0, y: 0, width: 0, height: 0},
      thumbRect: {x: 0, y: 0, width: 0, height: 0},
      hovered: false,
      dragged: false
    };
    this._hScrollbar = {
      ratio: 1,
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

    this._scrollTop = 0;
    this._scrollLeft = 0;
    this._maxScrollTop = 0;
    this._maxScrollLeft = 0;
    this._padding = { left: 0, right: 0, top: 0, bottom: 0 };

    this._setupSelection();
    this._setupEventListeners();

    this._keymapHandler = new KeymapHandler();
    this._keymapHandler.addKeymap({
      'Up': 'selection.move.up',
      'Down': 'selection.move.down',
      'Left': 'selection.move.left',
      'Right': 'selection.move.right',
      'Alt-Left': 'selection.move.word.left',
      'Alt-Right': 'selection.move.word.right',
      'Shift-Up': 'selection.select.up',
      'Shift-Down': 'selection.select.down',
      'Shift-Left': 'selection.select.left',
      'Shift-Right': 'selection.select.right',
      'Alt-Shift-Left': 'selection.select.word.left',
      'Alt-Shift-Right': 'selection.select.word.right',
      'Home': 'selection.move.linestart',
      'Home-Shift': 'selection.select.linestart',
      'End': 'selection.move.lineend',
      'End-Shift': 'selection.select.lineend',
      'Cmd/Ctrl-a': 'selection.select.all',
      'Cmd-Left': 'selection.move.linestart',
      'Cmd-Right': 'selection.move.lineend',
      'Cmd-Up': 'selection.move.documentstart',
      'Cmd-Down': 'selection.move.documentend',
      'Cmd-Shift-Up': 'selection.select.documentstart',
      'Cmd-Shift-Down': 'selection.select.documentend',
      'Shift-Cmd-Left': 'selection.select.linestart',
      'Shift-Cmd-Right': 'selection.select.lineend',
      'Escape': 'selection.collapse',

      'Enter': 'input.newline',
      'Backspace': 'input.backspace',
      'Delete': 'input.delete',
      'Alt-Backspace': 'input.backspace.word',
      'Cmd-Backspace': 'input.backspace.line',
      'Tab': 'input.indent',
      'Shift-Tab': 'input.unindent',

      'Cmd/Ctrl-z': 'history.undo',
      'Cmd/Ctrl-Shift-z': 'history.redo',
      'Cmd/Ctrl-u': 'history.softundo',
      'Cmd/Ctrl-Shift-u': 'history.softredo',
    }, this._performCommand.bind(this));

    this._invalidate();
  }

  measurer() {
    return this._measurer;
  }

  scrollTop() {
    return this._scrollTop;
  }

  scrollLeft() {
    return this._scrollLeft;
  }

  setEditor(editor) {
    // TODO: save/restore scroll positions.
    if (this._editor)
      EventEmitter.removeEventListeners(this._eventListeners);
    this._editor = editor;
    if (this._editor) {
      this._editor.markup().setMeasurer(this._measurer);
      this._eventListeners = [
        this._editor.on(Editor.Events.Raf, this.raf.bind(this)),
        this._editor.document().on(Document.Events.Changed, ({selectionChanged}) => {
          if (selectionChanged)
            this.raf();
        }),
        this._editor.on(Editor.Events.Reveal, this._reveal.bind(this)),
        this._editor.markup().on(Markup.Events.Changed, this._invalidate.bind(this)),
      ];
      this._invalidate();
    } else {
      this.raf();
    }
  }

  editor() {
    return this._editor;
  }

  _onInputInput(event) {
    if (!this._editor)
      return;
    if (!this._input.value)
      return;

    this._editor.input().type(this._input.value);
    this._revealSelection(true);
    this._revealCursors();
    this._input.value = '';
  }

  _onInputKeydown(event) {
    if (!this._editor)
      return;
    if (this._keymapHandler.handleKeyDown(event))
      this._revealCursors();
  }

  keymapHandler() {
    return this._keymapHandler;
  }

  _performCommand(command) {
    if (!this._editor)
      return false;

    if (this._domDocument.activeElement !== this._input)
      return false;

    if (command === 'history.undo') {
      this._editor.document().undo();
      return this._revealSelection(true);
    }

    if (command === 'history.redo') {
      this._editor.document().redo();
      return this._revealSelection(true);
    }

    if (command === 'history.softundo') {
      this._editor.document().softUndo();
      return this._revealSelection(true);
    }

    if (command === 'history.softredo') {
      this._editor.document().softRedo();
      return this._revealSelection(true);
    }

    if (command === 'selection.select.all') {
      this._editor.input().selectAll();
      return this._revealSelection(true);
    }
    if (command === 'selection.collapse')
      return this._revealSelection(this._editor.input().collapseSelection(), true /* center */);

    if (command === 'input.backspace')
      return this._revealSelection(this._editor.input().deleteBefore());
    if (command === 'input.backspace.word')
      return this._revealSelection(this._editor.input().deleteWordBefore());
    if (command === 'input.backspace.line')
      return this._revealSelection(this._editor.input().deleteLineBefore());
    if (command === 'input.delete')
      return this._revealSelection(this._editor.input().deleteAfter());
    if (command === 'input.newline')
      return this._revealSelection(this._editor.input().insertNewLine());
    if (command === 'input.indent')
      return this._revealSelection(this._editor.input().insertIndent());
    if (command === 'input.unindent')
      return this._revealSelection(this._editor.input().removeIndent());
    if (command === 'selection.move.up')
      return this._revealSelection(this._editor.input().moveUp(this._editor.markup()));
    if (command === 'selection.move.down')
      return this._revealSelection(this._editor.input().moveDown(this._editor.markup()));
    if (command === 'selection.move.documentstart')
      return this._revealSelection(this._editor.input().moveDocumentStart());
    if (command === 'selection.move.documentend')
      return this._revealSelection(this._editor.input().moveDocumentEnd());
    if (command === 'selection.move.left')
      return this._revealSelection(this._editor.input().moveLeft());
    if (command === 'selection.move.right')
      return this._revealSelection(this._editor.input().moveRight());
    if (command === 'selection.move.word.left')
      return this._revealSelection(this._editor.input().moveWordLeft());
    if (command === 'selection.move.word.right')
      return this._revealSelection(this._editor.input().moveWordRight());
    if (command === 'selection.move.linestart')
      return this._revealSelection(this._editor.input().moveLineStart());
    if (command === 'selection.move.lineend')
      return this._revealSelection(this._editor.input().moveLineEnd());
    if (command === 'selection.select.up')
      return this._revealSelection(this._editor.input().selectUp(this._editor.markup()));
    if (command === 'selection.select.down')
      return this._revealSelection(this._editor.input().selectDown(this._editor.markup()));
    if (command === 'selection.select.documentstart')
      return this._revealSelection(this._editor.input().selectDocumentStart());
    if (command === 'selection.select.documentend')
      return this._revealSelection(this._editor.input().selectDocumentEnd());
    if (command === 'selection.select.left')
      return this._revealSelection(this._editor.input().selectLeft());
    if (command === 'selection.select.right')
      return this._revealSelection(this._editor.input().selectRight());
    if (command === 'selection.select.word.left')
      return this._revealSelection(this._editor.input().selectWordLeft());
    if (command === 'selection.select.word.right')
      return this._revealSelection(this._editor.input().selectWordRight());
    if (command === 'selection.select.linestart')
      return this._revealSelection(this._editor.input().selectLineStart());
    if (command === 'selection.select.lineend')
      return this._revealSelection(this._editor.input().selectLineEnd());
    if (command === 'selection.select.all')
      return this._revealSelection(this._editor.input().selectAll());
    if (command === 'selection.collapse')
      return this._revealSelection(this._editor.input().collapseSelection());
  }

  _setupEventListeners() {
    this._element.addEventListener('paste', event => {
      if (!this._editor)
        return;
      let data = event.clipboardData;
      if (data.types.indexOf('text/plain') === -1)
        return;
      this._editor.input().paste(data.getData('text/plain'));
      this._revealSelection(true);
      this._revealCursors();
      event.preventDefault();
      event.stopPropagation();
    });
    this._element.addEventListener('cut', event => {
      if (!this._editor)
        return;
      const text = this._editor.document().selectedText();
      if (!text)
        return;
      event.clipboardData.setData('text/plain', text);
      this._editor.input().cut();
      this._revealSelection(true);
      this._revealCursors();
      event.preventDefault();
      event.stopPropagation();
    });

    let mouseRangeStartOffset = null;
    let mouseRangeEndOffset = null;
    let lastMouseEvent = null;
    this._element.addEventListener('mousedown', event => {
      if (!this._editor)
        return;
      if (event.target !== this._canvas && event.target !== this._element)
        return;
      lastMouseEvent = event;
      let offset = this._mouseEventToTextOffset(event);
      if (event.detail === 2) {
        let range = Tokenizer.characterGroupRange(this._editor.document(), this._editor.tokenizer(), offset);
        mouseRangeStartOffset = range.from;
        mouseRangeEndOffset = range.to;
        this._editor.input().setLastCursor({anchor: mouseRangeStartOffset, focus: mouseRangeEndOffset});
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (event.detail > 2) {
        let position = this._editor.document().text().offsetToPosition(offset);
        let from = this._editor.document().text().positionToOffset({
          line: position.line,
          column: 0
        });
        let to = this._editor.document().text().positionToOffset({
          line: position.line + 1,
          column: 0
        });

        this._editor.input().setLastCursor({anchor: from, focus: to});
        mouseRangeStartOffset = from;
        mouseRangeEndOffset = to;
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (event.shiftKey) {
        const lastCursor = this._editor.document().lastCursor();
        mouseRangeStartOffset = lastCursor ? lastCursor.anchor : 0;
        mouseRangeEndOffset = offset;
        this._editor.document().setSelection([{anchor: mouseRangeStartOffset, focus: mouseRangeEndOffset}]);
      } else if ((isMac && event.metaKey) || (!isMac && event.ctrlKey)) {
        const selection = this._editor.document().selection();
        selection.push({anchor: offset, focus: offset});
        this._editor.document().setSelection(selection);
        mouseRangeStartOffset = offset;
        mouseRangeEndOffset = offset;
      } else {
        this._editor.document().setSelection([{anchor: offset, focus: offset}]);
        mouseRangeStartOffset = offset;
        mouseRangeEndOffset = offset;
      }
      event.stopPropagation();
      event.preventDefault();
    }, false);
    this._element.addEventListener('mousemove', event => {
      if (!this._editor)
        return;
      if (mouseRangeStartOffset === null)
        return;
      lastMouseEvent = event;
      this._editor.document().operation(() => {
        let offset = this._mouseEventToTextOffset(event);
        if (offset <= mouseRangeStartOffset)
          this._editor.input().setLastCursor({anchor: mouseRangeEndOffset, focus: offset});
        else if (offset >= mouseRangeEndOffset)
          this._editor.input().setLastCursor({anchor: mouseRangeStartOffset, focus: offset});
        else
          this._editor.input().setLastCursor({anchor: mouseRangeStartOffset, focus: mouseRangeEndOffset});
      }, Document.History.Merge);
      this._revealCursors();
    });
    this._element.addEventListener('wheel', event => {
      if (!this._editor)
        return;
      if (mouseRangeStartOffset === null)
        return;
      this._editor.document().operation(() => {
        let offset = this._mouseEventToTextOffset(lastMouseEvent);
        if (offset <= mouseRangeStartOffset)
          this._editor.input().setLastCursor({anchor: mouseRangeEndOffset, focus: offset});
        else if (offset >= mouseRangeEndOffset)
          this._editor.input().setLastCursor({anchor: mouseRangeStartOffset, focus: offset});
        else
          this._editor.input().setLastCursor({anchor: mouseRangeStartOffset, focus: mouseRangeEndOffset});
      }, Document.History.Merge);
      this._revealCursors();
    });
    this._element.addEventListener('mouseup', event => {
      mouseRangeStartOffset = null;
      mouseRangeEndOffset = null;
    });
    this._element.addEventListener('copy', event => {
      if (!this._editor)
        return;
      let text = this._editor.document().selectedText();
      if (text) {
        event.clipboardData.setData('text/plain', text);
        event.preventDefault();
        event.stopPropagation();
      }
    }, false);
  }

  _setupSelection() {
    let theme = this._theme;
    let selectionFocusTheme = theme['selection.focus'];
    let cursorsVisible = false;
    let cursorsTimeout;
    let toggleCursors = () => {
      cursorsVisible = !cursorsVisible;
      if (cursorsVisible)
        theme['selection.focus'] = selectionFocusTheme;
      else
        delete theme['selection.focus'];
      this._invalidate();
    };
    this._input.addEventListener('focusin', event => {
      toggleCursors();
      cursorsTimeout = window.setInterval(toggleCursors, 500);
    });
    this._input.addEventListener('focusout', event => {
      if (cursorsVisible)
        toggleCursors();
      if (cursorsTimeout) {
        window.clearInterval(cursorsTimeout);
        cursorsTimeout = null;
      }
    });
    this._revealCursors = () => {
      if (!cursorsTimeout)
        return;
      window.clearInterval(cursorsTimeout);
      if (!cursorsVisible)
        toggleCursors();
      cursorsTimeout = window.setInterval(toggleCursors, 500);
    };
    this._revealCursors();
  }

  _revealSelection(success, center = false) {
    if (!this._editor || !success)
      return false;
    const lastCursor = this._editor.document().lastCursor();
    let focus = lastCursor ? lastCursor.focus : null;
    if (focus !== null) {
      let vPadding = center ? this._editorRect.height / 2 : 0;
      this._reveal({from: focus, to: focus}, {top: vPadding, bottom: vPadding});
    }
    return true;
  }

  element() {
    return this._element;
  }

  focus() {
    this._input.focus();
  }

  resize() {
    this._setSize(this._element.clientWidth, this._element.clientHeight);
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
  _setSize(cssWidth, cssHeight) {
    if (this._cssWidth === cssWidth && this._cssHeight === cssHeight)
      return;
    this._ratio = this._getRatio();
    this._cssWidth = cssWidth;
    this._cssHeight = cssHeight;
    this._canvas.width = cssWidth * this._ratio;
    this._canvas.height = cssHeight * this._ratio;
    this._canvas.style.width = cssWidth + 'px';
    this._canvas.style.height = cssHeight + 'px';
    this._measurer = new ContextBasedMeasurer(this._canvas.getContext('2d'), this._monospace);
    // TODO: Updating in markup every time is slow, but not doing it might be wrong on
    // scale change. We should detect that.
    // if (zoomHasChanged())
    //   this._editor.markup().setMeasurer(this._measurer);

    this._invalidate();
    if (this._editor && this._wrappingMode !== WrappingMode.None)
      this._editor.markup().setWrappingMode(this._wrappingMode, this._wrappingLimit());

    // Changing cavas width/height clears the canvas synchronously.
    // We need to re-render so that it doesn't blink on continious resizing.
    this._render();
  }

  /**
   * @param {boolean} monospace
   */
  setUseMonospaceFont(monospace) {
    this._monospace = monospace;
    this._measurer = new ContextBasedMeasurer(this._canvas.getContext('2d'), this._monospace);
    if (this._editor)
      this._editor.markup().setMeasurer(this._measurer);
    this._invalidate();
  }

  /**
   * @param {!WrappingMode} wrappingMode
   */
  setWrappingMode(wrappingMode) {
    if (this._wrappingMode === wrappingMode)
      return;
    this._wrappingMode = wrappingMode;
    if (this._editor)
      this._editor.markup().setWrappingMode(this._wrappingMode, this._wrappingLimit());
  }

  /**
   * @return {number?}
   */
  _wrappingLimit() {
    if (this._wrappingMode === WrappingMode.None)
      return null;
    return Math.max(2 * this._measurer.defaultWidth(), this._editorRect.width - this._padding.left - this._padding.right);
  }

  _mouseEventToCanvas(event) {
    const bounds = this._canvas.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const y = event.clientY - bounds.top;
    return {x, y};
  }

  positionToViewportPoint(position) {
    const offset = this._editor.document().text().positionToOffset(position, false /* strict */);
    const point = this._editor.markup().offsetToPoint(offset);
    if (!point)
      return null;
    const bounds = this._canvas.getBoundingClientRect();
    return {
      x: point.x - this._scrollLeft + this._padding.left + bounds.left + this._editorRect.x,
      y: point.y - this._scrollTop + this._padding.top + bounds.top + this._editorRect.y
    };
  }

  _canvasToTextOffset({x, y}) {
    return this._editor.markup().pointToOffset({
      x: x - this._editorRect.x + this._scrollLeft - this._padding.left,
      y: y - this._editorRect.y + this._scrollTop - this._padding.top
    }, RoundMode.Round);
  }

  /**
   * @param {!MouseEvent} event
   * @return {number}
   */
  _mouseEventToTextOffset(event) {
    return this._canvasToTextOffset(this._mouseEventToCanvas(event));
  }

  _onScroll(event) {
    if (!this._editor)
      return;
    event.preventDefault();
    this._scrollTop += event.deltaY;
    this._scrollLeft += event.deltaX;
    this._invalidate();
  }

  _onClick(event) {
    if (event.target !== this._canvas && event.target !== this._element)
      return;
    this._input.focus();
  }

  _onMouseDown(event) {
    if (!this._editor)
      return;
    const canvasPosition = this._mouseEventToCanvas(event);
    this._lastCoordinates.mouseDown = canvasPosition;

    this._vScrollbar.hovered = rectHasPoint(this._vScrollbar.thumbRect, canvasPosition.x, canvasPosition.y);
    if (this._vScrollbar.hovered) {
      this._vScrollbar.dragged = true;
      this._mouseDownState.name = MouseDownStates.VSCROLL_DRAG;
      this._mouseDownState.insideThumb = this._scrollTop * this._vScrollbar.ratio - (canvasPosition.y - this._vScrollbar.rect.y);
      this.raf();
      event.stopPropagation();
      event.preventDefault();
      return;
    }
    this._hScrollbar.hovered = rectHasPoint(this._hScrollbar.thumbRect, canvasPosition.x, canvasPosition.y);
    if (this._hScrollbar.hovered) {
      this._hScrollbar.dragged = true;
      this._mouseDownState.name = MouseDownStates.HSCROLL_DRAG;
      this._mouseDownState.insideThumb = this._scrollLeft * this._hScrollbar.ratio - (canvasPosition.x - this._hScrollbar.rect.x);
      this.raf();
      event.stopPropagation();
      event.preventDefault();
      return;
    }
  }

  _onMouseMove(event) {
    if (!this._editor)
      return;
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
      this.raf();
    } else if (this._mouseDownState.name === MouseDownStates.VSCROLL_DRAG) {
      let scrollbarOffset = canvasPosition.y - this._vScrollbar.rect.y + this._mouseDownState.insideThumb;
      this._scrollTop = scrollbarOffset / this._vScrollbar.ratio;
      this._invalidate();
    } else if (this._mouseDownState.name === MouseDownStates.HSCROLL_DRAG) {
      let scrollbarOffset = canvasPosition.x - this._hScrollbar.rect.x + this._mouseDownState.insideThumb;
      this._scrollLeft = scrollbarOffset / this._hScrollbar.ratio;
      this._invalidate();
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
    this.raf();
  }

  _onMouseOut(event) {
    if (this._mouseDownState.name !== MouseDownStates.VSCROLL_DRAG &&
        this._mouseDownState.name !== MouseDownStates.HSCROLL_DRAG) {
      const canvasPosition = this._mouseEventToCanvas(event);
      this._lastCoordinates.mouseUp = canvasPosition;
      this._mouseDownState.name = null;
      this._mouseDownState.insideThumb = null;
      this._vScrollbar.dragged = false;
      this._hScrollbar.dragged = false;
      this._vScrollbar.hovered = false;
      this._hScrollbar.hovered = false;
      this.raf();
    } else {
      window.removeEventListener('mousemove', this._windowListeners.mousemove, false);
      window.removeEventListener('mouseup', this._windowListeners.mouseup, false);
      window.addEventListener('mousemove', this._windowListeners.mousemove, false);
      window.addEventListener('mouseup', this._windowListeners.mouseup, false);
    }
  }

  _onMouseIn(event) {
    window.removeEventListener('mousemove', this._windowListeners.mousemove, false);
    window.removeEventListener('mouseup', this._windowListeners.mouseup, false);
  }

  _invalidate() {
    if (!this._editor || !this._cssWidth || !this._cssHeight || this._rendering)
      return;
    // To properly handle input events, we have to update rects synchronously.

    const gutterLength = (Math.max(this._editor.document().text().lineCount(), 100) + '').length;
    const gutterWidth = this._measurer.width9 * gutterLength;
    this._gutterRect.width = gutterWidth + GUTTER_PADDING_LEFT + GUTTER_PADDING_RIGHT;
    this._gutterRect.height = this._cssHeight;

    this._editorRect.x = this._gutterRect.width;
    this._editorRect.width = this._cssWidth - this._gutterRect.width - SCROLLBAR_WIDTH;
    this._editorRect.height = this._cssHeight;

    this._padding = {
      left: 4,
      right: 4,
      top: 4,
      bottom: this._editorRect.height - this._measurer.lineHeight() - 4
    };

    this._maxScrollTop = Math.max(0, this._editor.markup().contentHeight() - this._editorRect.height + this._padding.top + this._padding.bottom);
    this._maxScrollLeft = Math.max(0, this._editor.markup().contentWidth() - this._editorRect.width + this._padding.left + this._padding.right);
    this._scrollLeft = Math.max(this._scrollLeft, 0);
    this._scrollLeft = Math.min(this._scrollLeft, this._maxScrollLeft);
    this._scrollTop = Math.max(this._scrollTop, 0);
    this._scrollTop = Math.min(this._scrollTop, this._maxScrollTop);

    this._vScrollbar.ratio = this._editorRect.height / (this._maxScrollTop + this._editorRect.height);
    this._vScrollbar.rect.x = this._cssWidth - SCROLLBAR_WIDTH;
    this._vScrollbar.rect.y = 0;
    this._vScrollbar.rect.width = SCROLLBAR_WIDTH;
    this._vScrollbar.rect.height = this._editorRect.height;
    this._vScrollbar.thumbRect.x = this._vScrollbar.rect.x;
    this._vScrollbar.thumbRect.y = this._scrollTop * this._vScrollbar.ratio;
    this._vScrollbar.thumbRect.width = this._vScrollbar.rect.width;
    this._vScrollbar.thumbRect.height = this._editorRect.height * this._vScrollbar.ratio;
    if (this._vScrollbar.thumbRect.height < MIN_THUMB_SIZE) {
      let delta = MIN_THUMB_SIZE - this._vScrollbar.thumbRect.height;
      let percent = this._maxScrollTop ? this._scrollTop / this._maxScrollTop : 1;
      this._vScrollbar.thumbRect.y -= delta * percent;
      this._vScrollbar.thumbRect.height = MIN_THUMB_SIZE;
    }

    this._hScrollbar.ratio = this._editorRect.width / (this._maxScrollLeft + this._editorRect.width);
    this._hScrollbar.rect.x = this._gutterRect.width;
    this._hScrollbar.rect.y = this._cssHeight - SCROLLBAR_WIDTH;
    this._hScrollbar.rect.width = this._editorRect.width;
    this._hScrollbar.rect.height = this._maxScrollLeft > 0 ? SCROLLBAR_WIDTH : 0;
    this._hScrollbar.thumbRect.x = this._hScrollbar.rect.x + this._scrollLeft * this._hScrollbar.ratio;
    this._hScrollbar.thumbRect.y = this._hScrollbar.rect.y;
    this._hScrollbar.thumbRect.width = this._editorRect.width * this._hScrollbar.ratio;
    this._hScrollbar.thumbRect.height = this._hScrollbar.rect.height;
    if (this._hScrollbar.thumbRect.width < MIN_THUMB_SIZE) {
      let delta = MIN_THUMB_SIZE - this._hScrollbar.thumbRect.width;
      let percent = this._maxScrollLeft ? this._scrollLeft / this._maxScrollLeft : 1;
      this._hScrollbar.thumbRect.x -= delta * percent;
      this._hScrollbar.thumbRect.width = MIN_THUMB_SIZE;
    }

    this.raf();
  }

  raf() {
    if (!this._animationFrameId)
      this._animationFrameId = requestAnimationFrame(this._render);
  }

  /**
   * @param {!Range} range
   * @param {!{left: number, right: number, top: number, bottom: number}=} rangePadding
   */
  _reveal(range, rangePadding) {
    if (this._rendering)
      throw new Error('Cannot reveal while rendering');

    rangePadding = Object.assign({
      left: 10,
      right: 10,
      top: this._editorRect.height / 2,
      bottom: this._editorRect.height / 2,
    }, rangePadding);

    let from = this._editor.markup().offsetToPoint(range.from);
    if (!from)
      return;
    from = {
      x: from.x + this._padding.left,
      y: from.y + this._padding.top
    };

    let to = this._editor.markup().offsetToPoint(range.to);
    if (!to)
      return;
    to = {
      x: to.x + this._padding.left,
      y: to.y + this._padding.top + this._editor.markup().lineHeight()
    };

    if (this._scrollTop > from.y) {
      this._scrollTop = Math.max(from.y - rangePadding.top, 0);
    } else if (this._scrollTop + this._editorRect.height < to.y) {
      this._scrollTop = Math.min(to.y - this._editorRect.height + rangePadding.bottom, this._maxScrollTop);
    }
    if (this._scrollLeft > from.x) {
      this._scrollLeft = Math.max(from.x - rangePadding.left, 0);
    } else if (this._scrollLeft + this._editorRect.width < to.x) {
      this._scrollLeft = Math.min(to.x - this._editorRect.width + rangePadding.right, this._maxScrollLeft);
    }
    this._invalidate();
  }

  _render() {
    this._animationFrameId = 0;

    if (!this._editor) {
      const ctx = this._canvas.getContext('2d');
      ctx.setTransform(this._ratio, 0, 0, this._ratio, 0, 0);
      ctx.clearRect(0, 0, this._cssWidth, this._cssHeight);
      return;
    }

    trace.beginGroup('render');
    this._rendering = true;

    const ctx = this._canvas.getContext('2d');
    ctx.setTransform(this._ratio, 0, 0, this._ratio, 0, 0);
    ctx.clearRect(0, 0, this._cssWidth, this._cssHeight);
    ctx.lineWidth = 1 / this._ratio;

    trace.begin('buildFrame');
    const frame = new Frame();
    frame.translateLeft = -this._scrollLeft + this._padding.left;
    frame.translateTop = -this._scrollTop + this._padding.top;

    frame.lineLeft = this._scrollLeft - Math.min(this._scrollLeft, this._padding.left);
    frame.lineRight = this._scrollLeft - this._padding.left + this._editorRect.width
        + Math.min(this._maxScrollLeft - this._scrollLeft - this._padding.right, 0);

    const contentRect = {
      left: this._scrollLeft - this._padding.left,
      top: this._scrollTop - this._padding.top,
      width: this._editorRect.width,
      height: this._editorRect.height
    };
    const scrollbar = {
      ratio: this._editorRect.height / (this._maxScrollTop + this._editorRect.height),
      minDecorationHeight: 5
    }
    this._editor.markup().buildFrame(frame, contentRect, scrollbar, this._editor.decorationCallbacks());
    trace.end('buildFrame');

    trace.begin('drawGutter');
    ctx.save();
    ctx.beginPath();
    ctx.rect(this._gutterRect.x, this._gutterRect.y, this._gutterRect.width, this._gutterRect.height);
    ctx.clip();
    this._drawGutter(ctx, frame);
    ctx.restore();
    trace.end('drawGutter');

    trace.beginGroup('drawContent');
    ctx.save();
    ctx.beginPath();
    ctx.rect(this._editorRect.x, this._editorRect.y, this._editorRect.width, this._editorRect.height);
    ctx.clip();
    ctx.translate(this._editorRect.x, this._editorRect.y);
    ctx.translate(frame.translateLeft, frame.translateTop);
    this._drawTextAndBackground(ctx, frame);
    this._drawMarks(ctx, frame);
    ctx.restore();
    trace.endGroup('drawContent');

    trace.beginGroup('drawScrollbar');
    ctx.save();
    this._drawScrollbarMarkers(ctx, frame, this._vScrollbar.rect);
    this._drawScrollbar(ctx, this._vScrollbar, true /* isVertical */);
    this._drawScrollbar(ctx, this._hScrollbar, false /* isVertical */);
    ctx.restore();
    trace.endGroup('drawScrollbar');

    this._rendering = false;
    trace.endGroup('render', 50);
  }

  _drawGutter(ctx, frame) {
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, this._gutterRect.width, this._gutterRect.height);
    ctx.strokeStyle = 'rgb(187, 187, 187)';
    ctx.lineWidth = 1 / this._ratio;
    ctx.beginPath();
    ctx.moveTo(this._gutterRect.width, 0);
    ctx.lineTo(this._gutterRect.width, this._gutterRect.height);
    ctx.stroke();

    ctx.translate(0, frame.translateTop);
    for (let {y, styles} of frame.lines) {
      for (let style of styles) {
        const theme = this._theme[style];
        if (!theme || !theme.gutter)
          continue;
        if (theme.gutter.color) {
          ctx.fillStyle = theme.gutter.color;
          ctx.fillRect(0, y, this._gutterRect.width, frame.lineHeight);
        }
        if (theme.gutter.border) {
          ctx.strokeStyle = theme.gutter.border;
          ctx.lineWidth = 1 / this._ratio;
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(this._gutterRect.width, y);
          ctx.moveTo(0, y + frame.lineHeight);
          ctx.lineTo(this._gutterRect.width, y + frame.lineHeight);
          ctx.stroke();
        }
      }
    }

    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgb(128, 128, 128)';
    const textOffset = this._measurer.textOffset;
    const textX = this._gutterRect.width - GUTTER_PADDING_RIGHT;
    let joinFirstTwo = false;
    if (frame.lines.length >= 2 && frame.lines[0].first === frame.lines[1].first &&
        frame.lines[0].y + frame.translateTop < 0) {
      joinFirstTwo = true;
    }
    for (let i = 0; i < frame.lines.length; i++) {
      const line = frame.lines[i];
      if (i < 2 && joinFirstTwo) {
        if (i === 0) {
          const number = (line.first + 1) + '';
          ctx.fillText(number, textX, -frame.translateTop + textOffset);
        }
      } else if (i === 0 || line.first !== frame.lines[i - 1].first) {
        const number = (line.first + 1) + '';
        ctx.fillText(number, textX, line.y + textOffset);
      }
    }
  }

  _drawTextAndBackground(ctx, frame) {
    for (let {y, styles} of frame.lines) {
      for (let style of styles) {
        const theme = this._theme[style];
        if (!theme || !theme.line)
          continue;
        if (theme.line.background && theme.line.background.color) {
          ctx.fillStyle = theme.line.background.color;
          ctx.fillRect(frame.lineLeft, y, frame.lineRight - frame.lineLeft, frame.lineHeight);
        }
        if (theme.line.border && theme.line.border.color) {
          ctx.strokeStyle = theme.line.border.color;
          ctx.lineWidth = (theme.line.border.width || 1) / this._ratio;
          ctx.beginPath();
          ctx.moveTo(frame.lineLeft, y);
          ctx.lineTo(frame.lineRight, y);
          ctx.moveTo(frame.lineLeft, y + frame.lineHeight);
          ctx.lineTo(frame.lineRight, y + frame.lineHeight);
          ctx.stroke();
        }
      }
    }

    for (let {x, y, width, style} of frame.background) {
      const theme = this._theme[style];
      if (!theme)
        continue;

      if (theme.background && theme.background.color) {
        ctx.fillStyle = theme.background.color;
        ctx.fillRect(x, y, width, frame.lineHeight);
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
          ctx.lineTo(x, y + frame.lineHeight);
        } else {
          // TODO: border.radius should actually clip background.
          const radius = Math.min(theme.border.radius || 0, Math.min(frame.lineHeight, width) / 2) / this._ratio;
          if (radius)
            roundRect(ctx, x, y, width, frame.lineHeight, radius);
          else
            ctx.rect(x, y, width, frame.lineHeight);
        }
        ctx.stroke();
      }
    }

    const textOffset = this._measurer.textOffset;
    for (let {x, y, content, style} of frame.text) {
      const theme = this._theme[style];
      if (theme && theme.text) {
        ctx.fillStyle = theme.text.color || 'rgb(33, 33, 33)';
        ctx.fillText(content, x, y + textOffset);
      }
    }
  }

  _drawMarks(ctx, frame) {
    const lineHeight = this._measurer.lineHeight();
    for (let {x, y, mark} of frame.marks) {
      // TODO: need some rendering!
      ctx.fillStyle = 'red';
      ctx.fillRect(x, y + 2, mark.width, lineHeight - 4);
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

  _drawScrollbarMarkers(ctx, frame, rect) {
    for (let {y, height, style} of frame.scrollbar) {
      const theme = this._theme[style];
      if (!theme || !theme.line || !theme.line.scrollbar || !theme.line.scrollbar || !theme.line.scrollbar.color)
        continue;
      ctx.fillStyle = theme.line.scrollbar.color;
      let left = Math.round(rect.width * (theme.line.scrollbar.left || 0) / 100);
      let right = Math.round(rect.width * (theme.line.scrollbar.right || 100) / 100);
      ctx.fillRect(rect.x + left, rect.y + y, right - left, height);
    }
  }
}
