import {Text} from "./Text.mjs"

export class Editor {
  constructor(domDocument) {
    //TODO: shadow dom!
    this._element = domDocument.createElement('editor-element');
    this._text = new Text();
  }

  /**
   * @param {string} text
   */
  setText(text) {
    this._text.setText(text);
  }

  /**
   * @return {string}
   */
  getText() {
    return this._text.text();
  }

  resize() {
  }

  /**
   * @return {!Element}
   */
  element() {
    return this._element;
  }

  /**
   * @param {function()}
   */
  setTextChangedCallback(callback) {
  }
}
