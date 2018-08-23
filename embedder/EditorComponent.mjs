import { EventEmitter } from '../src/core/EventEmitter.mjs';
import { Editor } from '../src/editor/Editor.mjs';
import { Document } from '../src/core/Document.mjs';
import { Renderer } from '../src/web/Renderer.mjs';
import { WebPlatformSupport } from '../src/web/WebPlatformSupport.mjs';
import { JSHighlighter } from '../src/javascript/JSHighlighter.mjs';
import { DefaultHighlighter } from '../src/default/DefaultHighlighter.mjs';

import { SelectedWordHighlighter } from '../plugins/SelectedWordHighlighter.mjs';
import { SmartBraces } from '../plugins/SmartBraces.mjs';
import { AddNextOccurence } from '../plugins/AddNextOccurence.mjs';
import { BlockIndentation } from '../plugins/BlockIndentation.mjs';
import { Search } from '../plugins/Search.mjs';
import { SearchToolbar } from '../plugins/web/SearchToolbar.mjs';

export class EditorComponent extends HTMLElement {
  constructor() {
    super();
    this._renderer = new Renderer(document);
    this._renderer.keymapHandler().addKeymap({
      'Cmd/Ctrl-d': 'selection.addnext',
    }, command => {
      if (!this._editor)
        return false;
      if (command === 'selection.addnext') {
        PluginManager.ensurePlugins(this._editor).addNextOccurence.addNext();
        return true;
      }
      return false;
    });
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
      const ranges = this._editor.document().selection();
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
      this._searchToolbar.setSearch(PluginManager.ensurePlugins(this._editor).search);
      this._eventListeners = [
        this._editor.document().on(Document.Events.Changed, ({selectionChanged}) => {
          if (selectionChanged)
            this._onSelectionChanged();
        })
      ];
      this._onSelectionChanged();
    } else {
      this._searchToolbar.setSearch(null);
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
    PluginManager.ensurePlugins(editor);
    editor.document().setSelection([{anchor: 0, focus: 0}]);

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

const pluginRegistrySymbol = Symbol('plugin registry');

class PluginManager {
  static ensurePlugins(editor) {
    let registry = editor[pluginRegistrySymbol];
    if (!registry) {
      registry = new PluginManager(editor);
      editor[pluginRegistrySymbol] = registry;
    }
    return registry;
  }

  constructor(editor) {
    this.selectedWordHighlighter = new SelectedWordHighlighter(editor);
    this.smartBraces = new SmartBraces(editor);
    this.blockIndentation = new BlockIndentation(editor);
    this.addNextOccurence = new AddNextOccurence(editor);
    this.search = new Search(editor);
    this.search.on(Search.Events.Changed, ({enabled}) => this.selectedWordHighlighter.setEnabled(!enabled));
  }
}

customElements.define('editor-component', EditorComponent);
