import { EventEmitter } from '../src/core/EventEmitter.mjs';
import { Editor } from '../src/editor/Editor.mjs';
import { Selection } from '../src/editor/Selection.mjs';
import { Renderer } from '../src/web/Renderer.mjs';
import { WebPlatformSupport } from '../src/web/WebPlatformSupport.mjs';
import { JSHighlighter } from '../src/javascript/JSHighlighter.mjs';
import { DefaultHighlighter } from '../src/default/DefaultHighlighter.mjs';

import { SelectedWordHighlighter } from '../plugins/SelectedWordHighlighter.mjs';
import { SmartBraces } from '../plugins/SmartBraces.mjs';
import { BlockIndentation } from '../plugins/BlockIndentation.mjs';
import { SearchToolbar } from '../plugins/web/SearchToolbar.mjs';

export class EditorComponent extends HTMLElement {
  constructor() {
    super();
    this._renderer = new Renderer(document);
    this._searchToolbar = new SearchToolbar(this._renderer);
    this._editor = null;
    this._eventListeners = [];
    this._renderer.element().classList.add('editor');
    this.appendChild(this._renderer.element());
    this._selectionChangedCallback = null;
    this._selectionDescription = document.createElement('span');

    const isMac = navigator.platform.toUpperCase().indexOf('MAC') !== -1;
    this._rafId = 0;
  }

  focus() {
    this._renderer.focus();
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
      if (range.anchor === range.focus) {
        const position = this._editor.document().text().offsetToPosition(range.focus);
        this._selectionDescription.textContent = `Line ${position.line + 1}, Column ${position.column + 1}`;
        return;
      }
      const fromPosition = this._editor.document().text().offsetToPosition(Math.min(range.anchor, range.focus));
      const toPosition = this._editor.document().text().offsetToPosition(Math.max(range.anchor, range.focus));
      // TODO: this should measure columns, not offsets.
      const charDelta = Math.abs(range.focus - range.anchor);
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
    if (this._editor) {
      this._eventListeners = [
        this._editor.selection().on(Selection.Events.Changed, this._onSelectionChanged.bind(this))
      ];
      this._onSelectionChanged();
    } else {
      this._selectionDescription.textContent = '';
    }
  }

  text() {
    return this._editor.document().text().content();
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
    const editor = new Editor(this._renderer.measurer(), WebPlatformSupport.instance());
    editor.selection().setRanges([{anchor: 0, focus: 0}]);

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
