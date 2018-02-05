import { Document } from "../core/Document.mjs";
import { Renderer } from "./Renderer.mjs";
import { Selection } from "../plugins/Selection.mjs";
import { Editing } from "../plugins/Editing.mjs";
import { Search } from "../plugins/Search.mjs";
import { IdleScheduler } from "./IdleScheduler.mjs";
import { DefaultTheme } from "../themes/DefaultTheme.mjs";
import PlainHighlighter from "../syntax/plain.mjs";

const isMac = navigator.platform.toUpperCase().indexOf('MAC') !== -1;

export class WebEditor {
  /**
   * @param {!Document} domDocument
   */
  constructor(domDocument) {
    this._createDOM(domDocument);
    this._document = new Document();
    this._createRenderer(domDocument);
    this._setupSelection();
    this._setupEditing();
    this._setupSearch();
    this._syntaxHighlighter = new PlainHighlighter();
    this._document.addPlugin(this._syntaxHighlighter);
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
      'Shift-Cmd-Left': 'selection.select.linestart',
      'Shift-Cmd-Right': 'selection.select.lineend',
      'Esc': 'selection.collapse',
    });
  }

  _installKeyMap(keyMap) {
    this._keymap.clear();
    for (let key in keyMap) {
      let value = keyMap[key];
      this._keymap.set(stringToHash(key), value);
    }
  }

  setHighlighter(highlighter) {
    this._document.removePlugin(this._syntaxHighlighter);
    this._syntaxHighlighter = highlighter;
    this._document.addPlugin(this._syntaxHighlighter);
  }

  invalidate() {
    this._renderer.invalidate();
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
        handled = this._document.perform(command);
      if (handled) {
        this._revealCursors();
        event.preventDefault();
        event.stopPropagation();
      }
    });

    let mouseRangeStartOffset = null;
    let mouseRangeEndOffset = null;
    this._element.addEventListener('mousedown', event => {
      let offset = this._renderer.mouseEventToTextOffset(event);
      if (event.detail > 1) {
        let offset = this._renderer.mouseEventToTextOffset(event);
        let range = this._selection.selectWordContaining(offset);
        mouseRangeStartOffset = range.from;
        mouseRangeEndOffset = range.to;
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
      let offset = this._renderer.mouseEventToTextOffset(event);
      this._selection.setRanges([{
        from: Math.min(offset, mouseRangeStartOffset),
        to: Math.max(offset, mouseRangeEndOffset)
      }]);
      this._revealCursors();
    });
    this._element.addEventListener('mouseup', event => {
      mouseRangeStartOffset = null;
      mouseRangeEndOffset = null;
    });
    this._element.addEventListener('copy', event => {
      let text = this._document.perform('selection.copy');
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

    this._document.addPlugin(this._selection);
  }

  _setupEditing() {
    this._editing = new Editing(this._document, this._selection);
    this._element.addEventListener('paste', event => {
      let data = event.clipboardData;
      if (data.types.indexOf('text/plain') === -1)
        return;
      this._document.perform('editing.paste', data.getData('text/plain'));
      this._revealCursors();
      event.preventDefault();
      event.stopPropagation();
    });
    this._element.addEventListener('cut', event => {
      const text = this._document.perform('selection.copy');
      if (!text)
        return;
      event.clipboardData.setData('text/plain', text);
      this._document.perform('editing.delete.before');
      this._revealCursors();
      event.preventDefault();
      event.stopPropagation();
    });
    this._input.addEventListener('input', event => {
      if (!this._input.value)
        return;
      this._document.perform('editing.type', this._input.value);
      this._revealCursors();
      this._input.value = '';
    });
    this._input.addEventListener('keydown', event => {
      let handled = false;
      switch (event.key) {
        case 'Enter':
          handled = this._document.perform('editing.newline');
          break;
        case 'z':
        case 'Z':
          // TODO: handle shortcuts properly.
          if (event.metaKey || event.ctrlKey)
            handled = this._document.perform(event.shiftKey ? 'history.redo' : 'history.undo', '!selection');
          break;
      }
      switch (event.keyCode) {
        case 8: /* backspace */
          handled = this._document.perform('editing.delete.before');
          break;
        case 46: /* delete */
          handled = this._document.perform('editing.delete.after');
          break;
      }
      if (handled) {
        this._revealCursors();
        event.preventDefault();
        event.stopPropagation();
      }
    });
    this._document.addPlugin(this._editing);
  }

  _setupSearch() {
    let updateCallback = null;
    this.onSearchUpdate = callback => { updateCallback = callback; };
    let onUpdate = (currentMatchIndex, totalMatchesCount) => {
      if (updateCallback)
      updateCallback.call(null, currentMatchIndex, totalMatchesCount);
    };
    this._search = new Search(this._document, new IdleScheduler(), this._selection, onUpdate);

    this.find = query => {
      this._document.perform('search.find', {query});
    };
    this.findCancel = () => {
      this._document.perform('search.cancel');
    };
    this.findNext = () => {
      this._document.perform('search.next');
    };
    this.findPrevious = () => {
      this._document.perform('search.previous');
    };

    this._document.addPlugin(this._search);
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

