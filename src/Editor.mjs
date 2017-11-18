import {Text} from "./Text.mjs"

export class Editor {
  /**
   * @param {!Document} document
   */
  constructor(document) {
    this._createDOM(document);
    this._createRenderer();
    this._text = new Text();
  }

  /**
   * @param {string} text
   */
  setText(text) {
    this._text.setText(text);
    this._render();
  }

  /**
   * @return {string}
   */
  text() {
    return this._text.text();
  }

  resize() {
    this._render();
  }

  /**
   * @return {!Element}
   */
  element() {
    return this._element;
  }

  /**
   * @param {function()} callback
   */
  setTextChangedCallback(callback) {
    this._textChangedCallback = callback;
  }

  focus() {
    this._input.focus();
  }

  /**
   * @param {!Document} document 
   */
  _createDOM(document) {
    //TODO: shadow dom!
    this._element = document.createElement('div');
    this._element.style.cssText = `
      border: 1px solid black;
      position: relative;
    `;
    this._element.addEventListener('click', event => {
      this._input.focus();
    });

    this._input = document.createElement('input');
    this._input.style.cssText = `
      width: 0;
      height: 0;
      position: absolute;
      top: 0;
      left: 0;
    `;
    this._element.appendChild(this._input);
    this._input.addEventListener('input', event => {
      this.setText(this.text() + this._input.value);
      this._input.value = '';
    });
  }

  _createRenderer() {
    this._canvas = document.createElement('div');
    this._canvas.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      bottom: 0;
      right: 0;
    `;
    this._element.appendChild(this._canvas);
  }

  _render() {
    this._canvas.textContent = this._text.text();
  }
}
