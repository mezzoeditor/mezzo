import { Document } from '../core/Document.mjs';
import { Decorator } from '../core/Decorator.mjs';
import { Renderer } from './Renderer.mjs';
import { Selection } from '../plugins/Selection.mjs';
import { History } from '../plugins/History.mjs';
import { Editing } from '../plugins/Editing.mjs';
import { Search } from '../plugins/Search.mjs';
import { DefaultTheme } from '../default/DefaultTheme.mjs';
import { DefaultHighlighter } from '../default/DefaultHighlighter.mjs';
import { DefaultTokenizer } from '../default/DefaultTokenizer.mjs';
import { Tokenizer } from '../core/Tokenizer.mjs';

const isMac = navigator.platform.toUpperCase().indexOf('MAC') !== -1;

export class WebEditor {
  /**
   * @param {!Document} domDocument
   */
  constructor(domDocument) {
    this._createDOM(domDocument);
    this._handles = new Decorator();
    this._document = new Document(this.invalidate.bind(this));
    this._document.setTokenizer(new DefaultTokenizer());
    this._document.addReplaceCallback(this._onReplace.bind(this));
    this._createRenderer(domDocument);
    this._setupScheduler();
    this._setupSelection();
    this._setupHistory();
    this._setupEditing();
    this._setupSearch();
    this._highlighter = null;
    this.setHighlighter(new DefaultHighlighter());
    this._keymap = new Map();
    this._installKeyMap({
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
      'Shift-Cmd-Left': 'selection.select.linestart',
      'Shift-Cmd-Right': 'selection.select.lineend',
      'Escape': 'selection.collapse',
    });
  }

  _installKeyMap(keyMap) {
    this._keymap.clear();
    for (let key in keyMap) {
      let value = keyMap[key];
      this._keymap.set(stringToHash(key), value);
    }
  }

  invalidate() {
    if (this._renderer)
      this._renderer.invalidate();
  }

  reset(text) {
    this._document.reset(text);
    this._history.reset();
  }

  /**
   * @return {!Document}
   */
  document() {
    return this._document;
  }

  /**
   * @return {!Selection}
   */
  selection() {
    return this._selection;
  }

  resize() {
    this._renderer.setSize(this._element.clientWidth, this._element.clientHeight);
  }

  /**
   * @param {!MouseEvent} event
   * @return {number}
   */
  mouseEventToTextOffset(event) {
    return this._renderer.mouseEventToTextOffset(event);
  }

  /**
   * @return {!Element}
   */
  element() {
    return this._element;
  }

  focus() {
    this._input.focus();
  }

  /**
   * @param {boolean} monospace
   */
  setUseMonospaceFont(monospace) {
    this._renderer.setUseMonospaceFont(monospace);
  }

  addIdleCallback(callback) {
    this._idleCallbacks.push(callback);
    this._renderer.addBeforeFrameCallback(callback);
  }

  removeIdleCallback(callback) {
    let index = this._idleCallbacks.indexOf(callback);
    if (index !== -1)
      this._idleCallbacks.splice(index, 1);
    this._renderer.removeBeforeFrameCallback(callback);
  }

  addDecorationCallback(callback) {
    this._renderer.viewport().addDecorationCallback(callback);
    this.invalidate();
  }

  removeDecorationCallback(callback) {
    this._renderer.viewport().removeDecorationCallback(callback);
    this.invalidate();
  }

  addHandle(from, to, onRemoved) {
    if (to === undefined)
      to = from;
    return new RangeHandle(this._document, this._handles, from, to, onRemoved);
  }

  setHighlighter(highlighter) {
    if (highlighter === this._highlighter)
      return;
    if (this._highlighter)
      this._highlighter.uninstall(this._renderer.viewport());
    this._highlighter = highlighter;
    if (this._highlighter)
      this._highlighter.install(this._renderer.viewport());
    this.invalidate();
  }

  /**
   * @param {!Document} domDocument
   */
  _createDOM(domDocument) {
    //TODO: shadow dom?
    this._element = domDocument.createElement('div');
    this._element.style.cssText = `
      position: relative;
      overflow: hidden;
      user-select: none;
      cursor: text;
    `;
    this._element.addEventListener('click', event => {
      this._input.focus();
    });
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
    this._element.appendChild(this._input);
  }

  /**
   * @param {!Document} domDocument
   */
  _createRenderer(domDocument) {
    this._renderer = new Renderer(domDocument, this._document, DefaultTheme);
    const canvas = this._renderer.canvas();
    canvas.style.setProperty('position', 'absolute');
    canvas.style.setProperty('top', '0');
    canvas.style.setProperty('left', '0');
    this._element.appendChild(canvas);
  }

  _setupSelection() {
    this._selection = new Selection(this._renderer.viewport());
    this._input.addEventListener('keydown', event => {
      let handled = false;
      let command = this._keymap.get(eventToHash(event));
      if (command)
        handled = this._performCommand(command);
      if (handled) {
        this._revealCursors();
        event.preventDefault();
        event.stopPropagation();
      }
    });

    let mouseRangeStartOffset = null;
    let mouseRangeEndOffset = null;
    let lastMouseEvent = null;
    this._element.addEventListener('mousedown', event => {
      lastMouseEvent = event;
      let offset = this._renderer.mouseEventToTextOffset(event);
      if (event.detail === 2) {
        mouseRangeStartOffset = Tokenizer.previousWord(this._document, offset);
        mouseRangeEndOffset = Tokenizer.nextWord(this._document, offset);
        this._selection.setRanges([{from: mouseRangeStartOffset, to: mouseRangeEndOffset}]);
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (event.detail > 2) {
        let position = this._document.offsetToPosition(offset);
        let from = this._document.positionToOffset({
          line: position.line,
          column: 0
        });
        let to = this._document.positionToOffset({
          line: position.line + 1,
          column: 0
        });

        this._selection.setRanges([{from, to}]);
        mouseRangeStartOffset = from;
        mouseRangeEndOffset = to;
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      this._selection.setRanges([{from: offset, to: offset}]);
      mouseRangeStartOffset = offset;
      mouseRangeEndOffset = offset;
      event.stopPropagation();
      event.preventDefault();
    });
    this._element.addEventListener('mousemove', event => {
      if (mouseRangeStartOffset === null)
        return;
      lastMouseEvent = event;
      let offset = this._renderer.mouseEventToTextOffset(event);
      if (offset <= mouseRangeStartOffset)
        this._selection.setRanges([{from: mouseRangeEndOffset, to: offset}]);
      else if (offset >= mouseRangeEndOffset)
        this._selection.setRanges([{from: mouseRangeStartOffset, to: offset}]);
      else
        this._selection.setRanges([{from: mouseRangeStartOffset, to: mouseRangeEndOffset}]);
      this._revealCursors();
    });
    this._element.addEventListener('wheel', event => {
      if (mouseRangeStartOffset === null)
        return;
      let offset = this._renderer.mouseEventToTextOffset(lastMouseEvent);
      if (offset <= mouseRangeStartOffset)
        this._selection.setRanges([{from: mouseRangeEndOffset, to: offset}]);
      else if (offset >= mouseRangeEndOffset)
        this._selection.setRanges([{from: mouseRangeStartOffset, to: offset}]);
      else
        this._selection.setRanges([{from: mouseRangeStartOffset, to: mouseRangeEndOffset}]);
      this._revealCursors();
    });
    this._element.addEventListener('mouseup', event => {
      mouseRangeStartOffset = null;
      mouseRangeEndOffset = null;
    });
    this._element.addEventListener('copy', event => {
      let text = this._selection.selectedText();
      if (text) {
        event.clipboardData.setData('text/plain', text);
        event.preventDefault();
        event.stopPropagation();
      }
    }, false);

    let theme = this._renderer.theme();
    let selectionFocusTheme = theme['selection.focus'];
    let cursorsVisible = false;
    let cursorsTimeout;
    let toggleCursors = () => {
      cursorsVisible = !cursorsVisible;
      if (cursorsVisible)
        theme['selection.focus'] = selectionFocusTheme;
      else
        delete theme['selection.focus'];
      this._renderer.invalidate();
    };
    this._element.addEventListener('focusin', event => {
      toggleCursors();
      cursorsTimeout = window.setInterval(toggleCursors, 500);
    });
    this._element.addEventListener('focusout', event => {
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

  _setupHistory() {
    this._history = new History(this._document, this._selection);
  }

  _setupEditing() {
    this._editing = new Editing(this._document, this._selection, this._history);
    this._element.addEventListener('paste', event => {
      let data = event.clipboardData;
      if (data.types.indexOf('text/plain') === -1)
        return;
      this._editing.paste(data.getData('text/plain'));
      this._revealSelection(true);
      this._revealCursors();
      event.preventDefault();
      event.stopPropagation();
    });
    this._element.addEventListener('cut', event => {
      const text = this._selection.selectedText();
      if (!text)
        return;
      event.clipboardData.setData('text/plain', text);
      this._editing.deleteBefore();
      this._revealSelection(true);
      this._revealCursors();
      event.preventDefault();
      event.stopPropagation();
    });
    this._input.addEventListener('input', event => {
      if (!this._input.value)
        return;
      this._editing.type(this._input.value);
      this._revealSelection(true);
      this._revealCursors();
      this._input.value = '';
    });
    this._input.addEventListener('keydown', event => {
      let handled = false;
      switch (event.key) {
        case 'Enter':
          handled = this._editing.insertNewLine();
          this._revealSelection(handled);
          break;
        case 'z':
        case 'Z':
          // TODO: handle shortcuts properly.
          if (event.metaKey || event.ctrlKey)
            handled = event.shiftKey ? this._history.redo() : this._history.undo();
          break;
      }
      switch (event.keyCode) {
        case 8: /* backspace */
          handled = this._editing.deleteBefore();
          this._revealSelection(handled);
          break;
        case 46: /* delete */
          handled = this._editing.deleteAfter();
          this._revealSelection(handled);
          break;
      }
      if (handled) {
        this._revealCursors();
        event.preventDefault();
        event.stopPropagation();
      }
    });
  }

  _setupSearch() {
    let updateCallback = null;
    this.onSearchUpdate = callback => { updateCallback = callback; };
    let onUpdate = (currentMatchIndex, totalMatchesCount) => {
      if (updateCallback)
      updateCallback.call(null, currentMatchIndex, totalMatchesCount);
    };
    this._search = new Search(this._renderer.viewport(), this._selection, onUpdate);

    this.find = query => {
      this._search.search({query});
    };
    this.findCancel = () => {
      this._search.cancel();
    };
    this.findNext = () => {
      this._search.nextMatch();
    };
    this.findPrevious = () => {
      this._search.previousMatch();
    };

    this.addIdleCallback(this._search.searchChunk.bind(this._search));
  }

  _setupScheduler() {
    this._idleCallbacks = [];
    let scheduleId = null;

    let runCallbacks = (deadline) => {
      scheduleId = null;
      while (true) {
        let hasMore = false;
        for (let idleCallback of this._idleCallbacks)
          hasMore |= idleCallback();
        if (!hasMore || deadline.didTimeout || deadline.timeRemaining() <= 0)
          break;
      }
      schedule();
    };

    let schedule = () => {
      if (!scheduleId)
        scheduleId = self.requestIdleCallback(runCallbacks, {timeout: 1000});
    };

    schedule();
  }

  _performCommand(command) {
    switch (command) {
      case 'selection.move.up':
        return this._revealSelection(this._selection.moveUp());
      case 'selection.move.down':
        return this._revealSelection(this._selection.moveDown());
      case 'selection.move.documentstart':
        return this._revealSelection(this._selection.moveDocumentStart());
      case 'selection.move.documentend':
        return this._revealSelection(this._selection.moveDocumentEnd());
      case 'selection.move.left':
        return this._revealSelection(this._selection.moveLeft());
      case 'selection.move.right':
        return this._revealSelection(this._selection.moveRight());
      case 'selection.move.word.left':
        return this._revealSelection(this._selection.moveWordLeft());
      case 'selection.move.word.right':
        return this._revealSelection(this._selection.moveWordRight());
      case 'selection.move.linestart':
        return this._revealSelection(this._selection.moveLineStart());
      case 'selection.move.lineend':
        return this._revealSelection(this._selection.moveLineEnd());
      case 'selection.select.up':
        return this._revealSelection(this._selection.selectUp());
      case 'selection.select.down':
        return this._revealSelection(this._selection.selectDown());
      case 'selection.select.left':
        return this._revealSelection(this._selection.selectLeft());
      case 'selection.select.right':
        return this._revealSelection(this._selection.selectRight());
      case 'selection.select.word.left':
        return this._revealSelection(this._selection.selectWordLeft());
      case 'selection.select.word.right':
        return this._revealSelection(this._selection.selectWordRight());
      case 'selection.select.linestart':
        return this._revealSelection(this._selection.selectLineStart());
      case 'selection.select.lineend':
        return this._revealSelection(this._selection.selectLineEnd());
      case 'selection.select.all':
        this._selection.selectAll();
        return this._revealSelection(true);
      case 'selection.collapse':
        return this._revealSelection(this._selection.collapse());
    }
    return false;
  }

  _revealSelection(success) {
    let focus = this._selection.focus();
    if (success && focus !== null)
      this._renderer.viewport().reveal({from: focus, to: focus});
    return success;
  }

  _onReplace({from, to, inserted}) {
    for (let removed of this._handles.replace(from, to, inserted))
      removed[RangeHandle._symbol]._wasRemoved();
  }
}

function eventToHash(event) {
  let hash = [];
  if (event.ctrlKey)
    hash.push('CTRL');
  if (event.metaKey)
    hash.push('CMD');
  if (event.altKey)
    hash.push('ALT');
  if (event.shiftKey)
    hash.push('SHIFT');
  let key = event.key.toUpperCase();
  if (key.startsWith('ARROW'))
    hash.push(key.substring('ARROW'.length));
  else if (key !== 'META' && key !== 'CONTROL' && key !== 'ALT' && key !== 'SHIFT')
    hash.push(key);
  return hash.join('-');
}

function stringToHash(eventString) {
  let tokens = eventString.toUpperCase().split('-');
  let ctrlOrCmd = tokens.includes('CMD/CTRL');
  let ctrl = tokens.includes('CTRL') || (ctrlOrCmd && !isMac);
  let cmd = tokens.includes('CMD') || (ctrlOrCmd && isMac);

  let hash = [];
  if (ctrl)
    hash.push('CTRL');
  if (cmd)
    hash.push('CMD');
  if (tokens.includes('ALT'))
    hash.push('ALT');
  if (tokens.includes('SHIFT'))
    hash.push('SHIFT');
  tokens = tokens.filter(token => token !== 'ALT' && token !== 'CTRL' && token !== 'SHIFT' && token !== 'CMD' && token !== 'CMD/CTRL');
  tokens.sort();
  hash.push(...tokens);
  return hash.join('-');
}

class RangeHandle {
  constructor(document, decorator, from, to, onRemoved) {
    this._document = document;
    this._decorator = decorator;
    this._onRemoved = onRemoved || function() {};
    this._handle = decorator.add(from, to, this);
    this._handle[RangeHandle._symbol] = this;
  }

  remove() {
    if (this.removed())
      return;
    let {from, to} = this.resolve();
    this._decorator.remove(this._handle);
    delete this._handle[RangeHandle._symbol];
    this._onRemoved = undefined;
  }

  resolve() {
    if (this.removed())
      throw 'Handle was removed!';
    let {from, to} = this._decorator.resolve(this._handle);
    return {from: this._document.offsetToLocation(from), to: this._document.offsetToLocation(to)};
  }

  _wasRemoved() {
    delete this._handle[RangeHandle._symbol];
    let onRemoved = this._onRemoved;
    this._onRemoved = undefined;
    onRemoved();
  }

  removed() {
    return !this._onRemoved;
  }
}

RangeHandle._symbol = Symbol('RangeHandle');
