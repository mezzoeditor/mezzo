import { Document } from "../core/Document.mjs";
import { Renderer } from "./Renderer.mjs";
import { Selection } from "../plugins/Selection.mjs";
import { Editing } from "../plugins/Editing.mjs";
import { DefaultTheme } from "../themes/DefaultTheme.mjs";
import PlainHighlighter from "../syntax/plain.mjs";

export class WebEditor {
  /**
   * @param {!Document} domDocument
   */
  constructor(domDocument) {
    this._createDOM(domDocument);
    this._document = new Document(() => this._renderer.invalidate());
    this._createRenderer(domDocument);
    this._setupSelection();
    this._setupEditing();
    this._syntaxHighlighter = new PlainHighlighter();
    this._document.addPlugin('syntax-highlight', this._syntaxHighlighter);
  }

  setHighlighter(highlighter) {
    this._document.removePlugin('syntax-highlight', this._syntaxHighlighter);
    this._syntaxHighlighter = highlighter;
    this._document.addPlugin('syntax-highlight', this._syntaxHighlighter);
  }

  /**
   * @param {string} name
   * @param {!Plugin} plugin
   */
  addPlugin(name, plugin) {
    this._document.addPlugin(name, plugin);
    this.invalidate();
  }

  /**
   * @param {string} name
   * @param {!Plugin} plugin
   */
  removePlugin(name, plugin) {
    this._document.removePlugin(name, plugin);
    this.invalidate();
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
    this._selection = new Selection(this);
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
        event.preventDefault();
        event.stopPropagation();
      }
    });
    this._document.addPlugin('selection', this._selection);
  }

  _setupEditing() {
    this._editing = new Editing(this._document, this._selection);
    this._element.addEventListener('paste', event => {
      let data = event.clipboardData;
      if (data.types.indexOf('text/plain') === -1)
        return;
      this._document.perform('editing.paste', data.getData('text/plain'));
      event.preventDefault();
      event.stopPropagation();
    });
    this._element.addEventListener('cut', event => {
      const text = this._document.perform('selection.copy');
      if (!text)
        return;
      event.clipboardData.setData('text/plain', text);
      this._document.perform('editing.delete.before');
      event.preventDefault();
      event.stopPropagation();
    });
    this._input.addEventListener('input', event => {
      this._document.perform('editing.type', this._input.value);
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
            handled = this._document.perform(event.shiftKey ? 'history.redo' : 'history.undo');
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
        event.preventDefault();
        event.stopPropagation();
      }
    });
    this._document.addPlugin('editing', this._editing);
  }
}
