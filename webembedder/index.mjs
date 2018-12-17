import { Renderer } from "../src/web/Renderer.mjs";
import { WebPlatformSupport } from "../src/web/WebPlatformSupport.mjs";
import { Editor } from "../src/editor/Editor.mjs";
import { Thread } from '../src/editor/Thread.mjs';

import { SelectedWordHighlighter } from '../plugins/SelectedWordHighlighter.mjs';
import { SmartBraces } from '../plugins/SmartBraces.mjs';
import { Search } from '../plugins/Search.mjs';
import { WordDictionary } from '../plugins/WordDictionary.mjs';
import { BlockIndentation } from '../plugins/BlockIndentation.mjs';
import { AddNextOccurence } from '../plugins/AddNextOccurence.mjs';
import { SearchToolbar } from '../plugins/web/SearchToolbar.mjs';
import { SuggestBoxController } from '../plugins/web/SuggestBox.mjs';
import { DOMUtils } from '../src/web/DOMUtils.mjs';
import { createHighlighterForMimeType } from '../lang/mimetypes.mjs';

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
    this._renderer.setFontConfig({
      family: DOMUtils.isMac() ? 'Menlo' : 'monospace',
      size: 12,
      monospace: true,
      topAscent: 2,
      bottomDescent: 6
    });

    this._plugins = {
      selectedWordHighlighter: new SelectedWordHighlighter(this._editor),
      smartBraces: new SmartBraces(this._editor),
      blockIndentation: new BlockIndentation(this._editor),
      addNextOccurence: new AddNextOccurence(this._editor),
      search: new Search(this._editor),
      wordDictionary: new WordDictionary(this._editor, {
        // Ignore numbers by default.
        ignore: [/^\d+$/],
      }),
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

    this._suggestBoxController = new SuggestBoxController(this._renderer);
    this._suggestBoxController.setDictionary(this._plugins.wordDictionary);

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
    this._editor.setHighlighter(await createHighlighterForMimeType(this._editor, this._mimeType));
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
