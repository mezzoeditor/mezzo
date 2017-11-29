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
    this.setText('');
    this._input.addEventListener('focus', event => this._renderer.setCursorsVisible(true));
    this._input.addEventListener('blur', event => this._renderer.setCursorsVisible(false));
  }

  /**
   * @param {string} text
   */
  setText(text) {
    this._operation(this._text.setText(text));
    this._operation(this._text.addSelection(new Selection()));
  }

  /**
   * @return {string}
   */
  text() {
    return this._text.text();
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
    this._renderer.invalidate(op);
    if (this._operationCallback)
      this._operationCallback.call(null, op);
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
      let op = this._text.performType(this._input.value);
      this._input.value = '';
      this._operation(op);
    });
    this._input.addEventListener('keydown', event => {
      let handled = false;
      switch (event.key) {
        case 'ArrowLeft':
          this._operation(event.shiftKey ? this._text.performSelectLeft() : this._text.performMoveLeft());
          handled = true;
          break;
        case 'ArrowRight':
          this._operation(event.shiftKey ? this._text.performSelectRight() : this._text.performMoveRight());
          handled = true;
          break;
        case 'ArrowUp':
          this._operation(event.shiftKey ? this._text.performSelectUp() : this._text.performMoveUp());
          handled = true;
          break;
        case 'ArrowDown':
          this._operation(event.shiftKey ? this._text.performSelectDown() : this._text.performMoveDown());
          handled = true;
          break;
        case 'Enter':
          this._operation(this._text.performNewLine());
          handled = true;
          break;
        case 'Home':
          this._operation(event.shiftKey ? this._text.performSelectLineStart() : this._text.performMoveLineStart());
          handled = true;
          break;
        case 'End':
          this._operation(event.shiftKey ? this._text.performSelectLineEnd() : this._text.performMoveLineEnd());
          handled = true;
          break;
        case 'a':
          // TODO(dgozman): handle shortcuts properly.
          if (!event.shiftKey && (event.metaKey || event.ctrlKey)) {
            this._operation(this._text.selectAll());
            handled = true;
          }
          break;
        }
      switch (event.keyCode) {
        case 8: /* backspace */
          this._operation(this._text.performDeleteBefore());
          handled = true;
          break;
        case 46: /* delete */
          this._operation(this._text.performDeleteAfter());
          handled = true;
          break;
        case 27: /* escape */ {
          let operation = this._text.clearSelectionsIfPossible();
          if (operation) {
            this._operation(operation);
            handled = true;
          }
          break;
        }
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
    canvas.addEventListener('mousedown', event => this._onMouseDown(event));
    this._element.appendChild(canvas);
  }

  _onMouseDown(event) {
    const textPosition = this._renderer.mouseEventToTextPosition(event);
    textPosition.lineNumber = Math.min(textPosition.lineNumber, this._text.lineCount() - 1);
    textPosition.columnNumber = Math.min(textPosition.columnNumber, this._text.lineLength(textPosition.lineNumber));
    const selection = new Selection();
    selection.setCaret(textPosition);
    this._text.setSelections([selection]);
    this._renderer.invalidate();
  }
}
