import { Editor } from "../builtin/Editor.mjs";
import { Renderer } from "../core/Renderer.mjs";
import { Selection } from "../builtin/Selection.mjs";
import { Viewport } from "./Viewport.mjs";

export class WebEditor {
  /**
   * @param {!Document} document
   */
  constructor(document) {
    this._createDOM(document);
    this._editor = new Editor();
    this._createRenderer(document);
    this.setText('');
    this._setupCursors();
  }

  _setupCursors() {
    let cursorsVisible = false;
    let cursorsTimeout;
    let toggleCursors = () => {
      cursorsVisible = !cursorsVisible;
      this._renderer.setCursorsVisible(cursorsVisible);
    };
    this._input.addEventListener('focus', event => {
      toggleCursors();
      cursorsTimeout = document.defaultView.setInterval(toggleCursors, 500);
    });
    this._input.addEventListener('blur', event => {
      if (cursorsVisible)
        toggleCursors();
      if (cursorsTimeout) {
        document.defaultView.clearInterval(cursorsTimeout);
        cursorsTimeout = null;
      }
    });
    this._revealCursors = () => {
      if (!cursorsTimeout)
        return;
      document.defaultView.clearInterval(cursorsTimeout);
      if (!cursorsVisible)
        toggleCursors();
      cursorsTimeout = document.defaultView.setInterval(toggleCursors, 500);
    };
    this._revealCursors();
  }

  /**
   * @param {!ViewportBuilder} builder
   */
  addViewportBuilder(builder) {
    this._renderer.addBuilder(builder);
  }

  /**
   * @param {!ViewportBuilder} builder
   */
  removeViewportBuilder(builder) {
    this._renderer.removeBuilder(builder);
  }

  invalidate() {
    this._renderer.invalidate();
  }

  /**
   * @param {string} text
   */
  setText(text) {
    this._editor.setContent(text);
    this._editor.setSelections([new Selection()]);
    this._renderer.invalidate();
  }

  /**
   * @return {string}
   */
  text() {
    return this._editor.text().content();
  }

  /**
   * @param {!Array<!Selection>} selections
   */
  setSelections(selections) {
    this._editor.setSelections(selections);
    this._renderer.invalidate();
  }

  /**
   * @param {!TextPosition} position
   * @param {boolean=} clamp
   * @return {number}
   */
  positionToOffset(position, clamp) {
    return this._editor.text().positionToOffset(position, clamp);
  }

  resize() {
    this._renderer.setSize(this._element.clientWidth, this._element.clientHeight);
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
      this._editor.performType(this._input.value);
      this._input.value = '';
      this._revealCursors();
      this._renderer.invalidate();
    });
    this._input.addEventListener('keydown', event => {
      let handled = false;
      switch (event.key) {
        case 'ArrowLeft':
          if (event.shiftKey)
            this._editor.performSelectLeft();
          else
            this._editor.performMoveLeft();
          handled = true;
          break;
        case 'ArrowRight':
          if (event.shiftKey)
            this._editor.performSelectRight();
          else
            this._editor.performMoveRight();
          handled = true;
          break;
        case 'ArrowUp':
          if (event.shiftKey)
            this._editor.performSelectUp();
          else
            this._editor.performMoveUp();
          handled = true;
          break;
        case 'ArrowDown':
          if (event.shiftKey)
            this._editor.performSelectDown();
          else
            this._editor.performMoveDown();
          handled = true;
          break;
        case 'Enter':
          this._editor.performNewLine();
          handled = true;
          break;
        case 'Home':
          if (event.shiftKey)
            this._editor.performSelectLineStart();
          else
            this._editor.performMoveLineStart();
          handled = true;
          break;
        case 'End':
          if (event.shiftKey)
            this._editor.performSelectLineEnd();
          else
            this._editor.performMoveLineEnd();
          handled = true;
          break;
        case 'a':
        case 'A':
          // TODO: handle shortcuts properly.
          if (!event.shiftKey && (event.metaKey || event.ctrlKey)) {
            this._editor.performSelectAll();
            handled = true;
          }
          break;
        case 'z':
        case 'Z':
          // TODO: handle shortcuts properly.
          if (event.metaKey || event.ctrlKey) {
            if (event.shiftKey)
              handled = this._editor.performRedo();
            else
              handled = this._editor.performUndo();
          }
          break;
      }
      switch (event.keyCode) {
        case 8: /* backspace */
          this._editor.performDeleteBefore();
          handled = true;
          break;
        case 46: /* delete */
          this._editor.performDeleteAfter();
          handled = true;
          break;
        case 27: /* escape */
          handled = this._editor.performCollapseSelections();
          break;
      }
      if (handled) {
        this._revealCursors();
        this._renderer.invalidate();
        event.preventDefault();
        event.stopPropagation();
      }
    });
    this._input.addEventListener('paste', event => {
      let data = event.clipboardData;
      if (data.types.indexOf('text/plain') === -1)
        return;
      this._editor.performPaste(data.getData('text/plain'));
      this._renderer.invalidate();
      event.preventDefault();
      event.stopPropagation();
    });
  }

  _createRenderer(document) {
    this._renderer = new Renderer(document, this._editor);
    const canvas = this._renderer.canvas();
    canvas.style.setProperty('position', 'absolute');
    canvas.style.setProperty('top', '0');
    canvas.style.setProperty('left', '0');
    this._element.appendChild(canvas);
  }
}
