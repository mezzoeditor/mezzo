import { Document } from "../core/Document.mjs";
import { Renderer } from "../render/Renderer.mjs";
import { Selection } from "../plugins/Selection.mjs";
import { Editing } from "../plugins/Editing.mjs";
import { DefaultTheme } from "../themes/DefaultTheme.mjs";

export class WebEditor {
  /**
   * @param {!Document} document
   */
  constructor(document) {
    this._createDOM(document);
    this._document = new Document(() => this._renderer.invalidate());
    this._createRenderer(document);
    this._selection = new Selection(this);
    this._editing = new Editing(this, this._selection);
    this._document.addPlugin('selection', this._selection);
    this._document.addPlugin('editing', this._editing);
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
   * @param {!Document} document
   */
  _createDOM(document) {
    //TODO: shadow dom?
    this._element = document.createElement('div');
    this._element.style.cssText = `
      position: relative;
      overflow: hidden;
      user-select: none;
      cursor: text;
    `;
    this._element.addEventListener('click', event => {
      this._input.focus();
    });

    this._input = document.createElement('input');
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
    this._input.addEventListener('input', event => {
      this._document.perform('editing.type', this._input.value);
      this._input.value = '';
    });
    this._input.addEventListener('keydown', event => {
      let handled = false;
      switch (event.key) {
        case 'ArrowLeft':
          if (event.shiftKey)
            this._document.perform('selection.select.left');
          else
            this._document.perform('selection.move.left');
          handled = true;
          break;
        case 'ArrowRight':
          if (event.shiftKey)
            this._document.perform('selection.select.right');
          else
            this._document.perform('selection.move.right');
          handled = true;
          break;
        case 'ArrowUp':
          if (event.shiftKey)
            this._document.perform('selection.select.up');
          else
            this._document.perform('selection.move.up');
          handled = true;
          break;
        case 'ArrowDown':
          if (event.shiftKey)
            this._document.perform('selection.select.down');
          else
            this._document.perform('selection.move.down');
          handled = true;
          break;
        case 'Enter':
          this._document.perform('editing.newline');
          handled = true;
          break;
        case 'Home':
          if (event.shiftKey)
            this._document.perform('selection.select.linestart');
          else
            this._document.perform('selection.move.linestart');
          handled = true;
          break;
        case 'End':
          if (event.shiftKey)
            this._document.perform('selection.select.lineend');
          else
            this._document.perform('selection.move.lineend');
          handled = true;
          break;
        case 'a':
        case 'A':
          // TODO: handle shortcuts properly.
          if (!event.shiftKey && (event.metaKey || event.ctrlKey)) {
            this._document.perform('selection.select.all');
            handled = true;
          }
          break;
        case 'z':
        case 'Z':
          // TODO: handle shortcuts properly.
          if (event.metaKey || event.ctrlKey) {
            if (event.shiftKey)
              handled = this._document.redo();
            else
              handled = this._document.undo();
          }
          break;
      }
      switch (event.keyCode) {
        case 8: /* backspace */
          this._document.perform('editing.delete.before');
          handled = true;
          break;
        case 46: /* delete */
          this._document.perform('editing.delete.after');
          handled = true;
          break;
        case 27: /* escape */
          handled = this._document.perform('selection.collapse');
          break;
      }
      if (handled) {
        event.preventDefault();
        event.stopPropagation();
      }
    });
  }

  _createRenderer(document) {
    this._renderer = new Renderer(document, this._document, DefaultTheme);
    const canvas = this._renderer.canvas();
    canvas.style.setProperty('position', 'absolute');
    canvas.style.setProperty('top', '0');
    canvas.style.setProperty('left', '0');
    this._element.appendChild(canvas);
  }
}
