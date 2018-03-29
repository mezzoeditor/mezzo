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
    this._selectionChangedCallback = null;
    this._selectionDescription = document.createElement('span');

    let rafId = 0;
    this._editor.selection().addChangeCallback(() => {
      if (rafId)
        return;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        const ranges = this._editor.selection().ranges();
        if (!ranges.length) {
          this._selectionDescription.textContent = ``;
          return;
        }
        if (ranges.length > 1) {
          this._selectionDescription.textContent = `${ranges.length} selection regions`;
          return;
        }
        const range = ranges[0];
        if (range.from === range.to) {
          const position = this._editor.document().offsetToPosition(range.from);
          this._selectionDescription.textContent = `Line ${position.line + 1}, Column ${position.column + 1}`;
          return;
        }
        const fromPosition = this._editor.document().offsetToPosition(range.from);
        const toPosition = this._editor.document().offsetToPosition(range.to);
        // TODO: this should measure columns, not offsets.
        const charDelta = Math.abs(range.from - range.to);
        const lineDelta = Math.abs(fromPosition.line - toPosition.line);
        if (!lineDelta) {
          this._selectionDescription.textContent = `${charDelta} character${charDelta > 1 ? 's' : ''} selected`;
        } else {
          this._selectionDescription.textContent = `${lineDelta + 1} lines, ${charDelta} character${charDelta > 1 ? 's' : ''} selected`;
        }
      });
    });
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

  selectionDescriptionElement() {
    return this._selectionDescription;
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
