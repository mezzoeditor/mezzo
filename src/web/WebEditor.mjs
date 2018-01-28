import { Document } from "../core/Document.mjs";
import { Renderer } from "./Renderer.mjs";
import { Selection } from "../plugins/Selection.mjs";
import { Editing } from "../plugins/Editing.mjs";
import { Search } from "../plugins/Search.mjs";
import { DefaultTheme } from "../themes/DefaultTheme.mjs";
import PlainHighlighter from "../syntax/plain.mjs";

export class WebEditor {
  /**
   * @param {!Document} domDocument
   */
  constructor(domDocument) {
    this._createDOM(domDocument);
    this._document = new Document(() => this._renderer.invalidate(), offset => this._renderer.reveal(offset));
    this._createRenderer(domDocument);
    this._setupSelection();
    this._setupEditing();
    this._setupSearch();
    this._syntaxHighlighter = new PlainHighlighter();
    this._document.addPlugin('syntax-highlight', this._syntaxHighlighter);
  }

  setHighlighter(highlighter) {
    this._document.removePlugin('syntax-highlight', this._syntaxHighlighter);
    this._syntaxHighlighter = highlighter;
    this._document.addPlugin('syntax-highlight', this._syntaxHighlighter);
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
    this._selection = new Selection(this._document);
    this._input.addEventListener('keydown', event => {
      let handled = false;
      switch (event.key) {
        case 'ArrowLeft':
          handled = this._document.perform(event.shiftKey ? 'selection.select.left' : 'selection.move.left');
          break;
        case 'ArrowRight':
          handled = this._document.perform(event.shiftKey ? 'selection.select.right' : 'selection.move.right');
          break;
        case 'ArrowUp':
          handled = this._document.perform(event.shiftKey ? 'selection.select.up' : 'selection.move.up');
          break;
        case 'ArrowDown':
          handled = this._document.perform(event.shiftKey ? 'selection.select.down' : 'selection.move.down');
          break;
        case 'Home':
          handled = this._document.perform(event.shiftKey ? 'selection.select.linestart' : 'selection.move.linestart');
          break;
        case 'End':
          handled = this._document.perform(event.shiftKey ? 'selection.select.lineend' : 'selection.move.lineend');
          break;
        case 'a':
        case 'A':
          // TODO: handle shortcuts properly.
          if (!event.shiftKey && (event.metaKey || event.ctrlKey))
            handled = this._document.perform('selection.select.all');
          break;
      }
      switch (event.keyCode) {
        case 27: /* escape */
          handled = this._document.perform('selection.collapse');
          break;
      }
      if (handled) {
        this._revealCursors();
        event.preventDefault();
        event.stopPropagation();
      }
    });

    let mouseRangeStartOffset = null;
    this._element.addEventListener('mousedown', event => {
      let offset = this._renderer.mouseEventToTextOffset(event);
      this._selection.setRanges([{from: offset, to: offset}]);
      mouseRangeStartOffset = offset;
      event.stopPropagation();
      event.preventDefault();
    });
    this._element.addEventListener('mousemove', event => {
      if (!mouseRangeStartOffset)
        return;
      let offset = this._renderer.mouseEventToTextOffset(event);
      this._selection.setRanges([{from: mouseRangeStartOffset, to: offset}]);
      this._revealCursors();
    });
    this._element.addEventListener('mouseup', event => {
      mouseRangeStartOffset = null;
    });
    this._element.addEventListener('copy', event => {
      let text = this._document.perform('selection.copy');
      if (text) {
        event.clipboardData.setData('text/plain', text);
        event.preventDefault();
        event.stopPropagation();
      }
    });

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

    this._document.addPlugin('selection', this._selection);
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
    this._document.addPlugin('editing', this._editing);
  }

  _setupSearch() {
    let lastTotal = 0;
    let lastCurrent = -1;
    let onUpdate = null;
    let updateRAF = null;

    this._search = new Search(this._document, this._selection, () => {
      if (!onUpdate || updateRAF)
        return;
      updateRAF = requestAnimationFrame(() => {
        this._renderer.invalidate();
        updateRAF = null;
        let total = this._search.matchesCount();
        let current = this._search.currentMatchIndex();
        if (total !== lastTotal || current !== lastCurrent) {
          lastTotal = total;
          lastCurrent = current;
          onUpdate.call(null, lastTotal, lastCurrent);
        }
      });
    });

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
    this.onSearchUpdate = callback => { onUpdate = callback; };

    this._document.addPlugin('search', this._search);
  }
}
