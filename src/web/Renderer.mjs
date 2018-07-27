import { RoundMode, Metrics } from '../core/Metrics.mjs';
import { Viewport, Measurer } from '../core/Viewport.mjs';
import { trace } from '../core/Trace.mjs';
import { Document } from '../core/Document.mjs';
import { DefaultTheme } from '../default/DefaultTheme.mjs';
import { Tokenizer } from '../editor/Tokenizer.mjs';
import { Selection } from '../editor/Selection.mjs';
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

    this._defaultWidth = monospace ? ctx.measureText('M').width : 0;
    this._defaultRegex = monospace ? Metrics.asciiRegex : null;
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

    this._muteViewportChangedEvent = false;

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
      'Cmd/Ctrl-d': 'selection.addnext',
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
    }, this._performCommand.bind(this));
  }

  measurer() {
    return this._measurer;
  }

  setEditor(editor) {
    if (this._editor)
      EventEmitter.removeEventListeners(this._eventListeners);
    this._editor = editor;
    if (this._editor) {
      this._editor.viewport().setMeasurer(this._measurer);
      this._eventListeners = [
        this._editor.viewport().on(Viewport.Events.Changed, () => {
          if (!this._muteViewportChangedEvent)
            this.invalidate(this);
        }),
        this._editor.viewport().on(Viewport.Events.Raf, this.raf.bind(this)),
        this._editor.selection().on(Selection.Events.Changed, () => this.raf())
      ];
      this.invalidate();
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

    // Actions that don't require focus.
    switch (command) {
      case 'selection.addnext':
        return this._revealSelection(this._editor.selection().addNextOccurence(), true /* center */) || true;
    }

    if (this._domDocument.activeElement !== this._input)
      return false;

    // Actions that require focus.
    switch (command) {
      case 'history.undo':
        return true;
      case 'history.redo':
        return true;

      case 'input.backspace':
        return this._revealSelection(this._editor.input().deleteBefore());
      case 'input.backspace.word':
        return this._revealSelection(this._editor.input().deleteWordBefore());
      case 'input.backspace.line':
        return this._revealSelection(this._editor.input().deleteLineBefore());
      case 'input.delete':
        return this._revealSelection(this._editor.input().deleteAfter());
      case 'input.newline':
        return this._revealSelection(this._editor.input().insertNewLine());
      case 'input.indent':
        return this._revealSelection(this._editor.input().insertIndent());
      case 'input.unindent':
        return this._revealSelection(this._editor.input().removeIndent());

      case 'selection.move.up':
        return this._revealSelection(this._editor.selection().moveUp());
      case 'selection.move.down':
        return this._revealSelection(this._editor.selection().moveDown());
      case 'selection.move.documentstart':
        return this._revealSelection(this._editor.selection().moveDocumentStart());
      case 'selection.move.documentend':
        return this._revealSelection(this._editor.selection().moveDocumentEnd());
      case 'selection.move.left':
        return this._revealSelection(this._editor.selection().moveLeft());
      case 'selection.move.right':
        return this._revealSelection(this._editor.selection().moveRight());
      case 'selection.move.word.left':
        return this._revealSelection(this._editor.selection().moveWordLeft());
      case 'selection.move.word.right':
        return this._revealSelection(this._editor.selection().moveWordRight());
      case 'selection.move.linestart':
        return this._revealSelection(this._editor.selection().moveLineStart());
      case 'selection.move.lineend':
        return this._revealSelection(this._editor.selection().moveLineEnd());
      case 'selection.select.up':
        return this._revealSelection(this._editor.selection().selectUp());
      case 'selection.select.down':
        return this._revealSelection(this._editor.selection().selectDown());
      case 'selection.select.documentstart':
        return this._revealSelection(this._editor.selection().selectDocumentStart());
      case 'selection.select.documentend':
        return this._revealSelection(this._editor.selection().selectDocumentEnd());
      case 'selection.select.left':
        return this._revealSelection(this._editor.selection().selectLeft());
      case 'selection.select.right':
        return this._revealSelection(this._editor.selection().selectRight());
      case 'selection.select.word.left':
        return this._revealSelection(this._editor.selection().selectWordLeft());
      case 'selection.select.word.right':
        return this._revealSelection(this._editor.selection().selectWordRight());
      case 'selection.select.linestart':
        return this._revealSelection(this._editor.selection().selectLineStart());
      case 'selection.select.lineend':
        return this._revealSelection(this._editor.selection().selectLineEnd());
      case 'selection.select.all':
        this._editor.selection().selectAll();
        return this._revealSelection(true);
      case 'selection.collapse':
        return this._revealSelection(this._editor.selection().collapse(), true /* center */);
    }
    return false;
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
      const text = this._editor.selection().selectedText();
      if (!text)
        return;
      event.clipboardData.setData('text/plain', text);
      this._editor.input().deleteBefore();
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
        this._editor.selection().setLastRange({from: mouseRangeStartOffset, to: mouseRangeEndOffset});
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (event.detail > 2) {
        let position = this._editor.document().offsetToPosition(offset);
        let from = this._editor.document().positionToOffset({
          line: position.line,
          column: 0
        });
        let to = this._editor.document().positionToOffset({
          line: position.line + 1,
          column: 0
        });

        this._editor.selection().setLastRange({from, to});
        mouseRangeStartOffset = from;
        mouseRangeEndOffset = to;
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (event.shiftKey) {
        mouseRangeStartOffset = this._editor.selection().anchor();
        mouseRangeEndOffset = offset;
        this._editor.selection().setRanges([{from: mouseRangeStartOffset, to: mouseRangeEndOffset}]);
      } else if ((isMac && event.metaKey) || (!isMac && event.ctrlKey)) {
        this._editor.selection().addRange({from: offset, to: offset});
        mouseRangeStartOffset = offset;
        mouseRangeEndOffset = offset;
      } else {
        this._editor.selection().setRanges([{from: offset, to: offset}]);
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
      let offset = this._mouseEventToTextOffset(event);
      if (offset <= mouseRangeStartOffset)
        this._editor.selection().setLastRange({from: mouseRangeEndOffset, to: offset});
      else if (offset >= mouseRangeEndOffset)
        this._editor.selection().setLastRange({from: mouseRangeStartOffset, to: offset});
      else
        this._editor.selection().setLastRange({from: mouseRangeStartOffset, to: mouseRangeEndOffset});
      this._revealCursors();
    });
    this._element.addEventListener('wheel', event => {
      if (!this._editor)
        return;
      if (mouseRangeStartOffset === null)
        return;
      let offset = this._mouseEventToTextOffset(lastMouseEvent);
      if (offset <= mouseRangeStartOffset)
        this._editor.selection().setLastRange({from: mouseRangeEndOffset, to: offset});
      else if (offset >= mouseRangeEndOffset)
        this._editor.selection().setLastRange({from: mouseRangeStartOffset, to: offset});
      else
        this._editor.selection().setLastRange({from: mouseRangeStartOffset, to: mouseRangeEndOffset});
      this._revealCursors();
    });
    this._element.addEventListener('mouseup', event => {
      mouseRangeStartOffset = null;
      mouseRangeEndOffset = null;
    });
    this._element.addEventListener('copy', event => {
      if (!this._editor)
        return;
      let text = this._editor.selection().selectedText();
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
      this.invalidate();
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
    if (!this._editor)
      return false;
    let focus = this._editor.selection().focus();
    if (success && focus !== null) {
      let vPadding = center ? this._editor.viewport().height() / 2 : 0;
      this._editor.viewport().reveal({from: focus, to: focus}, {top: vPadding, bottom: vPadding});
    }
    return success;
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
    // TODO: Updating in viewport every time is slow, but not doing it might be wrong on
    // scale change. We should detect that.
    // if (zoomHasChanged())
    //   this._viewport.setMeasurer(this._measurer);
    this.invalidate();

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
      this._editor.viewport().setMeasurer(this._measurer);
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
    return this._editor.viewport().viewportPointToOffset({x, y}, RoundMode.Round);
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
    this._editor.viewport().advanceScroll(event.deltaY, event.deltaX);
    event.preventDefault();
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
      this._mouseDownState.insideThumb = this._editor.viewport().scrollTop() * this._vScrollbar.ratio - (canvasPosition.y - this._vScrollbar.rect.y);
      this.raf();
      event.stopPropagation();
      event.preventDefault();
      return;
    }
    this._hScrollbar.hovered = rectHasPoint(this._hScrollbar.thumbRect, canvasPosition.x, canvasPosition.y);
    if (this._hScrollbar.hovered) {
      this._hScrollbar.dragged = true;
      this._mouseDownState.name = MouseDownStates.HSCROLL_DRAG;
      this._mouseDownState.insideThumb = this._editor.viewport().scrollLeft() * this._hScrollbar.ratio - (canvasPosition.x - this._hScrollbar.rect.x);
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
      this._editor.viewport().setScrollTop(scrollbarOffset / this._vScrollbar.ratio);
    } else if (this._mouseDownState.name === MouseDownStates.HSCROLL_DRAG) {
      let scrollbarOffset = canvasPosition.x - this._hScrollbar.rect.x + this._mouseDownState.insideThumb;
      this._editor.viewport().setScrollLeft(scrollbarOffset / this._hScrollbar.ratio);
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

  invalidate() {
    if (!this._editor || !this._cssWidth || !this._cssHeight || this._rendering)
      return;
    // To properly handle input events, we have to update rects synchronously.
    const gutterLength = (Math.max(this._editor.document().lineCount(), 100) + '').length;
    const gutterWidth = this._measurer.width9 * gutterLength;
    this._gutterRect.width = gutterWidth + GUTTER_PADDING_LEFT + GUTTER_PADDING_RIGHT;
    this._gutterRect.height = this._cssHeight;

    this._editorRect.x = this._gutterRect.width;
    this._editorRect.width = this._cssWidth - this._gutterRect.width - SCROLLBAR_WIDTH;
    this._editorRect.height = this._cssHeight;

    const viewport = this._editor.viewport();

    this._muteViewportChangedEvent = true;
    viewport.setSize(this._editorRect.width, this._editorRect.height);
    viewport.setPadding({
      left: 4,
      right: 4,
      top: 4,
      bottom: this._editorRect.height - this._measurer.lineHeight() - 4
    });
    this._muteViewportChangedEvent = false;

    this._vScrollbar.ratio = viewport.height() / (viewport.maxScrollTop() + viewport.height());
    this._vScrollbar.rect.x = this._cssWidth - SCROLLBAR_WIDTH;
    this._vScrollbar.rect.y = 0;
    this._vScrollbar.rect.width = SCROLLBAR_WIDTH;
    this._vScrollbar.rect.height = this._editorRect.height;
    this._vScrollbar.thumbRect.x = this._vScrollbar.rect.x;
    this._vScrollbar.thumbRect.y = viewport.scrollTop() * this._vScrollbar.ratio;
    this._vScrollbar.thumbRect.width = this._vScrollbar.rect.width;
    this._vScrollbar.thumbRect.height = viewport.height() * this._vScrollbar.ratio;
    if (this._vScrollbar.thumbRect.height < MIN_THUMB_SIZE) {
      let delta = MIN_THUMB_SIZE - this._vScrollbar.thumbRect.height;
      let percent = viewport.maxScrollTop() ? viewport.scrollTop() / viewport.maxScrollTop() : 1;
      this._vScrollbar.thumbRect.y -= delta * percent;
      this._vScrollbar.thumbRect.height = MIN_THUMB_SIZE;
    }

    this._hScrollbar.ratio = viewport.width() / (viewport.maxScrollLeft() + viewport.width());
    this._hScrollbar.rect.x = this._gutterRect.width;
    this._hScrollbar.rect.y = this._cssHeight - SCROLLBAR_WIDTH;
    this._hScrollbar.rect.width = this._editorRect.width;
    this._hScrollbar.rect.height = viewport.maxScrollLeft() > 0 ? SCROLLBAR_WIDTH : 0;
    this._hScrollbar.thumbRect.x = this._hScrollbar.rect.x + viewport.scrollLeft() * this._hScrollbar.ratio;
    this._hScrollbar.thumbRect.y = this._hScrollbar.rect.y;
    this._hScrollbar.thumbRect.width = viewport.width() * this._hScrollbar.ratio;
    this._hScrollbar.thumbRect.height = this._hScrollbar.rect.height;
    if (this._hScrollbar.thumbRect.width < MIN_THUMB_SIZE) {
      let delta = MIN_THUMB_SIZE - this._hScrollbar.thumbRect.width;
      let percent = viewport.maxScrollLeft() ? viewport.scrollLeft() / viewport.maxScrollLeft() : 1;
      this._hScrollbar.thumbRect.x -= delta * percent;
      this._hScrollbar.thumbRect.width = MIN_THUMB_SIZE;
    }

    this.raf();
  }

  raf() {
    if (!this._animationFrameId)
      this._animationFrameId = requestAnimationFrame(this._render);
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

    trace.begin('frame');
    const {text, background, inlineWidgets, scrollbar, lines, paddingLeft, paddingRight} = this._editor.viewport().decorate();
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
    this._drawTextAndBackground(ctx, text, background, lines, paddingLeft, paddingRight);
    this._drawInlineWidgets(ctx, inlineWidgets);
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
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, this._gutterRect.width, this._gutterRect.height);
    ctx.strokeStyle = 'rgb(187, 187, 187)';
    ctx.lineWidth = 1 / this._ratio;
    ctx.beginPath();
    ctx.moveTo(this._gutterRect.width, 0);
    ctx.lineTo(this._gutterRect.width, this._gutterRect.height);
    ctx.stroke();

    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgb(128, 128, 128)';
    const textOffset = this._measurer.textOffset;
    const textX = this._gutterRect.width - GUTTER_PADDING_RIGHT;
    for (let {first, y} of lines) {
      // TODO: show "first..last" range instead
      const number = (first + 1) + '';
      ctx.fillText(number, textX, y + textOffset);
    }
  }

  _drawTextAndBackground(ctx, text, background, lines, paddingLeft, paddingRight) {
    const lineHeight = this._measurer.lineHeight();

    for (let {y, styles} of lines) {
      for (let style of styles) {
        const theme = this._theme[style];
        if (!theme || !theme.line)
          continue;
        if (theme.line.background && theme.line.background.color) {
          ctx.fillStyle = theme.line.background.color;
          ctx.fillRect(paddingLeft, y, this._editorRect.width - paddingRight, lineHeight);
        }
        if (theme.line.border && theme.line.border.color) {
          ctx.strokeStyle = theme.line.border.color;
          ctx.lineWidth = (theme.line.border.width || 1) / this._ratio;

          ctx.beginPath();
          ctx.moveTo(paddingLeft, y);
          ctx.lineTo(this._editorRect.width - paddingRight, y);
          ctx.moveTo(paddingLeft, y + lineHeight);
          ctx.lineTo(this._editorRect.width - paddingRight, y + lineHeight);
          ctx.stroke();
        }
      }
    }

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

    const textOffset = this._measurer.textOffset;
    for (let {x, y, content, style} of text) {
      const theme = this._theme[style];
      if (theme && theme.text) {
        ctx.fillStyle = theme.text.color || 'rgb(33, 33, 33)';
        ctx.fillText(content, x, y + textOffset);
      }
    }
  }

  _drawInlineWidgets(ctx, inlineWidgets) {
    const lineHeight = this._measurer.lineHeight();
    for (let {x, y, inlineWidget} of inlineWidgets) {
      // TODO: support dom elements instead.
      ctx.fillStyle = inlineWidget.width === 43 ? 'red' : 'green';
      ctx.fillRect(x, y + 2, inlineWidget.width, lineHeight - 4);
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
      if (!theme || !theme.line.scrollbar || !theme.line.scrollbar || !theme.line.scrollbar.color)
        continue;
      ctx.fillStyle = theme.line.scrollbar.color;
      let left = Math.round(rect.width * (theme.line.scrollbar.left || 0) / 100);
      let right = Math.round(rect.width * (theme.line.scrollbar.right || 100) / 100);
      ctx.fillRect(rect.x + left, rect.y + y, right - left, height);
    }
  }
}

