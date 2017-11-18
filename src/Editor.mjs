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
  getText() {
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

  /**
   * @param {!Document} document 
   */
  _createDOM(document) {
    //TODO: shadow dom!
    this._element = document.createElement('div');
    this._element.style.border = '1px solid black';
  }

  _createRenderer() {
  }

  _render() {
    this._element.textContent = this._text.text();
  }
}
