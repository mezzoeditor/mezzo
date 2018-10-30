import { Renderer } from "../src/web/Renderer.mjs";
import { WebPlatformSupport } from "../src/web/WebPlatformSupport.mjs";
import { Editor } from "../src/editor/Editor.mjs";
import { DefaultHighlighter } from "../src/default/DefaultHighlighter.mjs";
import { Thread } from '../src/editor/Thread.mjs';

import { SelectedWordHighlighter } from '../plugins/SelectedWordHighlighter.mjs';
import { SmartBraces } from '../plugins/SmartBraces.mjs';
import { Search } from '../plugins/Search.mjs';
import { BlockIndentation } from '../plugins/BlockIndentation.mjs';
import { AddNextOccurence } from '../plugins/AddNextOccurence.mjs';
import { SearchToolbar } from '../plugins/web/SearchToolbar.mjs';

export class WebEmbedder {
  static async createWithWorker(document) {
    const thread = await Thread.create(WebPlatformSupport.instance());
    const renderer = new Renderer(document);
    const editor = await Editor.createWithRemoteDocument(renderer.measurer(), WebPlatformSupport.instance(), thread);
    return new WebEmbedder(renderer, editor);
  }

  static create(document) {
    const renderer = new Renderer(document);
    const editor = Editor.create(renderer.measurer(), WebPlatformSupport.instance());
    return new WebEmbedder(renderer, editor);
  }

  /**
   * @param {!Renderer} renderer
   * @param {!Editor} editor
   */
  constructor(renderer, editor) {
    this._renderer = renderer;
    this._editor = editor;
    this._renderer.setEditor(this._editor);

    this._plugins = {
      selectedWordHighlighter: new SelectedWordHighlighter(this._editor),
      smartBraces: new SmartBraces(this._editor),
      blockIndentation: new BlockIndentation(this._editor),
      addNextOccurence: new AddNextOccurence(this._editor),
      search: new Search(this._editor),
    };
    this._renderer.keymapHandler().addKeymap({
      'Cmd/Ctrl-d': 'selection.addnext',
    }, command => {
      if (command === 'selection.addnext') {
        if (this._plugins.addNextOccurence.addNext()) {
          const cursor = this._editor.document().lastCursor();
          this._editor.revealRange({
            from: cursor.anchor,
            to: cursor.focus
          });
        }
        return true;
      }
      return false;
    });
    this._searchToolbar = new SearchToolbar(this._renderer);
    this._searchToolbar.setSearch(this._plugins.search);

    this._plugins.search.on(Search.Events.Changed, ({enabled}) => this._plugins.selectedWordHighlighter.setEnabled(!enabled));

    this.setMimeType('text/plain');
  }

  /**
   * @param {string} mimeType
   */
  async setMimeType(mimeType) {
    mimeType = mimeType.toLowerCase();
    if (this._mimeType === mimeType)
      return;
    this._mimeType = mimeType;
    if (mimeType === 'text/javascript') {
      const {JSHighlighter} = await import('../src/javascript/JSHighlighter.mjs');
      this._editor.setHighlighter(await JSHighlighter.create(this._editor));
      return;
    }
    if (mimeType === 'text/css') {
      const {CMHighlighter} = await import('../cmmodes/CMHighlighter.mjs');
      const highlighter = await CMHighlighter.createCSS(this._editor);
      this._editor.setHighlighter(highlighter);
      return;
    }
    if (mimeType === 'text/html') {
      const {CMHighlighter} = await import('../cmmodes/CMHighlighter.mjs');
      const highlighter = await CMHighlighter.createHTML(this._editor);
      this._editor.setHighlighter(highlighter);
      return;
    }
    this._editor.setHighlighter(new DefaultHighlighter(this._editor));
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

  setWrappingMode(value) {
    this._renderer.setWrappingMode(value);
  }

  /**
   * @return {!Editor}
   */
  editor() {
    return this._editor;
  }

  renderer() {
    return this._renderer;
  }

  resize() {
    this._renderer.resize();
  }

  focus() {
    this._renderer.focus();
  }
}
