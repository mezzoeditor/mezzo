import { WebEditor } from '../src/web/WebEditor.mjs';
import { JSHighlighter } from '../src/javascript/JSHighlighter.mjs';
import { DefaultHighlighter } from '../src/default/DefaultHighlighter.mjs';

export class EditorComponent extends HTMLElement {
  constructor() {
    super();
    this._editor = new WebEditor(document);
    this._editor.selection().setRanges([{from: 0, to: 0}]);
    this._editor.element().classList.add('editor');
    this.appendChild(this._editor.element());
    this._mimeType = 'text/plain';
  }

  setText(text) {
    this._editor.reset(text);
  }

  text() {
    return this._editor.document().content();
  }

  setMimeType(mimeType) {
    if (this._mimeType === mimeType)
      return;
    this._mimeType = mimeType;
    if (mimeType === 'text/javascript') {
      const highlighter = new JSHighlighter();
      this._editor.setHighlighter(highlighter);
    } else {
      const highlighter = new DefaultHighlighter();
      this._editor.setHighlighter(highlighter);
    }
  }

  mimeType() {
    return this._mimeType;
  }

  connectedCallback() {
    console.log('connected');
    this._editor.resize();
    this._resizeObserver = new ResizeObserver(entries => {
      console.log('Editor Resized');
      this._editor.resize();
    });
    this._resizeObserver.observe(this);
  }

  disconnectedCallback() {
    console.log('disconnected');
    this._resizeObserver.disconnect();
    this._resizeObserver = null;
  }
}

customElements.define('editor-component', EditorComponent);
