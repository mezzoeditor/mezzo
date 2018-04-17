import { EventEmitter } from '../src/core/EventEmitter.mjs';
import { Editor } from '../src/editor/Editor.mjs';
import { Selection } from '../src/editor/Selection.mjs';
import { Renderer, PlatformSupport } from '../src/web/Renderer.mjs';
import { JSHighlighter } from '../src/javascript/JSHighlighter.mjs';
import { DefaultHighlighter } from '../src/default/DefaultHighlighter.mjs';

import { SelectedWordHighlighter } from '../src/plugins/SelectedWordHighlighter.mjs';
import { SmartBraces } from '../src/plugins/SmartBraces.mjs';
import { BlockIndentation } from '../src/plugins/BlockIndentation.mjs';

export class EditorComponent extends HTMLElement {
  constructor() {
    super();
    this._renderer = new Renderer(document);
    this._editor = null;
    this._eventListeners = [];
    this._renderer.element().classList.add('editor');
    this.appendChild(this._renderer.element());
    this._selectionChangedCallback = null;
    this._selectionDescription = document.createElement('span');

    this._rafId = 0;
  }

  _onSelectionChanged() {
    if (this._rafId)
      return;
    this._rafId = requestAnimationFrame(() => {
      this._rafId = 0;
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
  }

  setEditor(editor) {
    EventEmitter.removeEventListeners(this._eventListeners);
    this._editor = editor;
    this._renderer.setEditor(editor);
    this._eventListeners = [
      this._editor.selection().on(Selection.Events.Changed, this._onSelectionChanged.bind(this))
    ];
    this._onSelectionChanged();
  }

  text() {
    return this._editor.document().content();
  }

  selectionDescriptionElement() {
    return this._selectionDescription;
  }

  connectedCallback() {
    console.log('connected');
    this._renderer.resize();
    this._resizeObserver = new ResizeObserver(entries => {
      console.log('Editor Resized');
      this._renderer.resize();
    });
    this._resizeObserver.observe(this);
  }

  disconnectedCallback() {
    console.log('disconnected');
    this._resizeObserver.disconnect();
    this._resizeObserver = null;
  }

  createEditor(mimeType) {
    const editor = new Editor(this._renderer.measurer(), PlatformSupport.instance());
    editor.selection().setRanges([{from: 0, to: 0}]);

    const selectedWordHighlighter = new SelectedWordHighlighter(editor);
    const smartBraces = new SmartBraces(editor);
    const blockIndentation = new BlockIndentation(editor);
    if (mimeType === 'text/javascript') {
      const highlighter = new JSHighlighter(editor);
      editor.setHighlighter(highlighter);
    } else {
      const highlighter = new DefaultHighlighter(editor);
      editor.setHighlighter(highlighter);
    }
    return editor;
  }
}

customElements.define('editor-component', EditorComponent);
