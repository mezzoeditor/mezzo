import { Renderer } from "../src/web/Renderer.mjs";
import { WebPlatformSupport } from "../src/web/WebPlatformSupport.mjs";
import { Editor } from "../src/editor/Editor.mjs";
import { JSHighlighter } from "../src/javascript/JSHighlighter.mjs";
import { DefaultHighlighter } from "../src/default/DefaultHighlighter.mjs";

import { SelectedWordHighlighter } from '../plugins/SelectedWordHighlighter.mjs';
import { SmartBraces } from '../plugins/SmartBraces.mjs';
import { Search } from '../plugins/Search.mjs';
import { BlockIndentation } from '../plugins/BlockIndentation.mjs';
import { AddNextOccurence } from '../plugins/AddNextOccurence.mjs';
import { SearchToolbar } from '../plugins/web/SearchToolbar.mjs';

const mimeTypeMap = new Map(Object.entries({
  'text/javascript': '../src/javascript/JSHighlighter.mjs',
  'text/plain': '../src/default/DefaultHighlighter.mjs',
}));

export class WebEmbedder {
  /**
   * @param {!Document} document
   */
  constructor(document) {
    this._renderer = new Renderer(document);
    this._editor = new Editor(this._renderer.measurer(), WebPlatformSupport.instance());
    this._renderer.setEditor(this._editor);

    this._plugins = {
      selectedWordHighlighter: new SelectedWordHighlighter(this._editor),
      smartBraces: new SmartBraces(this._editor),
      blockIndentation: new BlockIndentation(this._editor),
      addNextOccurence: new AddNextOccurence(this._editor),
      search: new Search(this._editor),
    };
    this._searchToolbar = new SearchToolbar(this._renderer);
    this._searchToolbar.setSearch(this._plugins.search);

    this._plugins.search.on(Search.Events.Changed, ({enabled}) => this._plugins.selectedWordHighlighter.setEnabled(!enabled));

    this.setMimeType('text/plain');
  }

  /**
   * @param {string} mimeType
   */
  async setMimeType(mimeType) {
    if (!mimeTypeMap.has(mimeType))
      mimeType = 'text/plain';
    if (this._mimeType === mimeType)
      return;
    this._mimeType = mimeType;
    //debugger;
    //const highlighter = await import(mimeTypeMap.get(mimeType));
    const highlighter = mimeType.toLowerCase() === 'text/javascript' ? new JSHighlighter(this._editor) : new DefaultHighlighter(this._editor);
    this._editor.setHighlighter(highlighter);
  }

  /**
   * @param {string} text
   */
  setText(text) {
    this._editor.reset(text);
  }

  /**
   * @return {string}
   */
  text() {
    return this._editor.document().text().content();
  }

  /**
   * @return {!Document}
   */
  document() {
    return this._editor.document();
  }

  /**
   * @return {!Element}
   */
  element() {
    return this._renderer.element();
  }

  /**
   * @param {boolean} enabled
   */
  setUseMonospaceFont(enabled) {
    this._renderer.setUseMonospaceFont(enabled);
  }

  /**
   * @return {!Editor}
   */
  editor() {
    return this._editor;
  }

  resize() {
    this._renderer.resize();
  }

  focus() {
    this._renderer.focus();
  }
}
