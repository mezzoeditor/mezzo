import {Text} from "./Text.mjs"
import {SimpleRenderer} from "./SimpleRenderer.mjs"

export class Editor {
  /**
   * @param {!Document} document
   */
  constructor(document) {
    this._createDOM(document);
    this._text = new Text();
    this._createRenderer(document);
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
    this._renderer.setSize(this._element.clientWidth, this._element.clientHeight);
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
      // this._text.insert(this._input.value);
      // this._renderer.render(text, x,
      this.setText(this.text() + this._input.value);
      this._input.value = '';
    });
  }

  _createRenderer(document) {
    this._renderer = new SimpleRenderer(document, this._text);
    const canvas = this._renderer.canvas();
    canvas.style.setProperty('position', 'absolute');
    canvas.style.setProperty('top', '0');
    canvas.style.setProperty('left', '0');
    this._element.appendChild(canvas);
  }

  _render() {
    this._renderer.invalidate();
  }
}
