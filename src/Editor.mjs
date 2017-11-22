import { Text } from "./Text.mjs";
import { SimpleRenderer } from "./SimpleRenderer.mjs";
import { Operation } from "./Operation.mjs";
import { Selection } from "./Selection.mjs";

export class Editor {
  /**
   * @param {!Document} document
   */
  constructor(document) {
    this._createDOM(document);
    this._text = new Text();
    this._createRenderer(document);
    this._setupCursors();
    this.setText('');
  }

  /**
   * @param {string} text
   */
  setText(text) {
    this._operation(this._text.setText(text));
    let selection = new Selection({lineNumber: 0, columnNumber: 0});
    this._operation(this._text.addSelection(selection));
  }

  /**
   * @return {string}
   */
  text() {
    return this._text.text();
  }

  resize() {
    this._renderer.setViewport({
      origin: {x: 0, y: 0},
      size: {width: this._element.clientWidth, height: this._element.clientHeight}
    });
  }

  /**
   * @return {!Element}
   */
  element() {
    return this._element;
  }

  /**
   * @param {function(!Operation)} callback
   */
  setOperationCallback(callback) {
    this._operationCallback = callback;
  }

  focus() {
    this._input.focus();
  }

  /**
   * @param {?Operation} op
   */
  _operation(op) {
    if (!op)
      return;
    this._revealCursors();
    this._renderer.invalidate(op);
    if (this._operationCallback)
      this._operationCallback.call(null, op);
  }

  _setupCursors() {
    let cursorsVisible = false;
    let cursorsTimeout;
    let toggleCursors = () => {
      cursorsVisible = !cursorsVisible;
      this._renderer.setCursorsVisible(cursorsVisible);
    };
    this._input.addEventListener('focus', event => {
      if (cursorsTimeout)
        document.defaultView.clearInterval(cursorsTimeout);
      if (!cursorsVisible)
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
  }

  /**
   * @param {!Document} document 
   */
  _createDOM(document) {
    //TODO: shadow dom?
    this._element = document.createElement('div');
    this._element.style.cssText = `
      border: 1px solid black;
      position: relative;
      overflow: hidden;
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
      let op = this._text.performType(this._input.value);
      this._input.value = '';
      this._operation(op);
    });
    this._input.addEventListener('keydown', event => {
      let handled = false;
      switch (event.key) {
        case 'ArrowLeft':
          this._operation(this._text.performLeft());
          handled = true;
          break;
        case 'ArrowRight':
          this._operation(this._text.performRight());
          handled = true;
          break;
        case 'ArrowUp':
          this._operation(this._text.performUp());
          handled = true;
          break;
        case 'ArrowDown':
          this._operation(this._text.performDown());
          handled = true;
          break;
        case 'Enter':
          this._operation(this._text.performNewLine());
          handled = true;
          break;
      }
      switch (event.keyCode) {
        case 8: /* backspace */
          this._operation(this._text.performBackspace());
          handled = true;
          break;
        case 46: /* delete */
          this._operation(this._text.performDelete());
          handled = true;
          break;
      }
      if (handled) {
        event.preventDefault();
        event.stopPropagation();
      }
    });
    this._input.addEventListener('paste', event => {
      let data = event.clipboardData;
      if (data.types.indexOf('text/plain') === -1)
        return;
      this._operation(this._text.performPaste(data.getData('text/plain')));
      event.preventDefault();
      event.stopPropagation();
    });
  }

  _createRenderer(document) {
    this._renderer = new SimpleRenderer(document, this._text);
    const canvas = this._renderer.canvas();
    canvas.style.setProperty('position', 'absolute');
    canvas.style.setProperty('top', '0');
    canvas.style.setProperty('left', '0');
    this._element.appendChild(canvas);
    let overlay = this._renderer.overlay();
    overlay.style.setProperty('position', 'absolute');
    overlay.style.setProperty('top', '0');
    overlay.style.setProperty('left', '0');
    this._element.appendChild(overlay);
  }
}
