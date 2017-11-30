import { Editor } from "./Editor.mjs";
import { CanvasRenderer } from "./CanvasRenderer.mjs";
import { Operation } from "./Operation.mjs";
import { Selection } from "./Selection.mjs";

export class WebEditor {
  /**
   * @param {!Document} document
   */
  constructor(document) {
    this._createDOM(document);
    this._editor = new Editor();
    this._createRenderer(document);
    this.setText('');
    this._input.addEventListener('focus', event => this._renderer.setCursorsVisible(true));
    this._input.addEventListener('blur', event => this._renderer.setCursorsVisible(false));
  }

  /**
   * @param {string} text
   */
  setText(text) {
    this._operation(this._editor.setContent(text));
    this._operation(this._editor.setSelections([new Selection()]));
  }

  /**
   * @return {string}
   */
  text() {
    return this._editor.content();
  }

  /**
   * @param {!Array<!Selection>} selections
   */
  setSelections(selections) {
    this._operation(this._editor.setSelections(selections));
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
      let op = this._editor.performType(this._input.value);
      this._input.value = '';
      this._operation(op);
    });
    this._input.addEventListener('keydown', event => {
      let handled = false;
      switch (event.key) {
        case 'ArrowLeft':
          this._operation(event.shiftKey ? this._editor.performSelectLeft() : this._editor.performMoveLeft());
          handled = true;
          break;
        case 'ArrowRight':
          this._operation(event.shiftKey ? this._editor.performSelectRight() : this._editor.performMoveRight());
          handled = true;
          break;
        case 'ArrowUp':
          this._operation(event.shiftKey ? this._editor.performSelectUp() : this._editor.performMoveUp());
          handled = true;
          break;
        case 'ArrowDown':
          this._operation(event.shiftKey ? this._editor.performSelectDown() : this._editor.performMoveDown());
          handled = true;
          break;
        case 'Enter':
          this._operation(this._editor.performNewLine());
          handled = true;
          break;
        case 'Home':
          this._operation(event.shiftKey ? this._editor.performSelectLineStart() : this._editor.performMoveLineStart());
          handled = true;
          break;
        case 'End':
          this._operation(event.shiftKey ? this._editor.performSelectLineEnd() : this._editor.performMoveLineEnd());
          handled = true;
          break;
        case 'a':
          // TODO(dgozman): handle shortcuts properly.
          if (!event.shiftKey && (event.metaKey || event.ctrlKey)) {
            this._operation(this._editor.selectAll());
            handled = true;
          }
          break;
        }
      switch (event.keyCode) {
        case 8: /* backspace */
          this._operation(this._editor.performDeleteBefore());
          handled = true;
          break;
        case 46: /* delete */
          this._operation(this._editor.performDeleteAfter());
          handled = true;
          break;
        case 27: /* escape */ {
          let operation = this._editor.collapseSelections();
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
      this._operation(this._editor.performPaste(data.getData('text/plain')));
      event.preventDefault();
      event.stopPropagation();
    });
  }

  _createRenderer(document) {
    this._renderer = new CanvasRenderer(document, this._editor);
    const canvas = this._renderer.canvas();
    canvas.style.setProperty('position', 'absolute');
    canvas.style.setProperty('top', '0');
    canvas.style.setProperty('left', '0');
    canvas.addEventListener('mousedown', event => this._onMouseDown(event));
    canvas.addEventListener('wheel', event => this._onScroll(event));
    this._element.appendChild(canvas);
  }

  _onScroll(event) {
    this._renderer.advanceScroll(event.deltaX, event.deltaY);
    event.preventDefault(true);
  }

  _onMouseDown(event) {
    let textPosition = this._renderer.mouseEventToTextPosition(event);
    textPosition = this._editor.clampPosition(textPosition);
    const selection = new Selection();
    selection.setCaret(textPosition);
    this._editor.setSelections([selection]);
    this._renderer.invalidate();
  }
}
