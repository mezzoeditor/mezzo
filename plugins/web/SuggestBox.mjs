import { EventEmitter } from '../../src/core/EventEmitter.mjs';
import { Document } from '../../src/core/Document.mjs';
import { Input } from '../../src/editor/Input.mjs';
import { WordDictionary } from '../../plugins/WordDictionary.mjs';
import { DOMUtils } from '../../src/web/DOMUtils.mjs';

const keymap = {
  'Ctrl-Space': 'suggestbox.show',
  'Escape': 'suggestbox.hide',
  'Up': 'suggestbox.up',
  'Down': 'suggestbox.down',
  'Enter': 'suggestbox.accept',
  'Tab': 'suggestbox.accept',
};

/**
 * Figures when to open SuggestBox.
 */
export class SuggestBoxController {
  constructor(renderer) {
    this._renderer = renderer;
    this._dictionary = null;
    this._suggestBox = null;
    this._eventListeners = [];
  }

  setDictionary(dictionary) {
    if (this._dictionary) {
      EventEmitter.removeEventListeners(this._eventListeners);
      if (this._suggestBox)
        this._hideSuggestBox();
      this._dictionary = null;
    }
    this._dictionary = dictionary;
    this._editor = dictionary.editor();
    if (this._dictionary) {
      this._eventListeners = [
        this._editor.input().on(Input.Events.UserInput, this._onInput.bind(this)),
        this._renderer.keymapHandler().addKeymap(keymap, this._onCommand.bind(this)),
      ];
    }
  }

  _onInput() {
    if (this._suggestBox)
      return;
    this._suggestBox = SuggestBox.maybeOpen(this, false /* force */);
  }

  _onCommand(command) {
    if (!this._suggestBox) {
      if (command === 'suggestbox.show') {
        this._suggestBox = SuggestBox.maybeOpen(this, true /* force */);
        return true;
      }
      return false;
    }
    if (command === 'suggestbox.hide') {
      this._suggestBox.dispose();
      this._suggestBox = null;
      return true;
    }
    if (command === 'suggestbox.up')
      return this._suggestBox.handleUp();
    if (command === 'suggestbox.down')
      return this._suggestBox.handleDown();
    if (command === 'suggestbox.accept')
      return this._suggestBox.accept();
    return false;
  }

  _hideSuggestBox() {
    this._suggestBox.dispose();
    this._suggestBox = null;
  }

  dispose() {
    EventEmitter.removeEventListeners(this._eventListeners);
    if (this._suggestBox)
      this._hideSuggestBox();
  }
}

const PARTIAL_RENDERING = 10;

class SuggestBox {
  static maybeOpen(controller, explicitlyOpened) {
    const cursor = controller._editor.document().lastCursor();
    if (!cursor)
      return null;
    const prefix = controller._dictionary.prefix(cursor.focus);
    return new SuggestBox(controller, cursor.focus - prefix.length, explicitlyOpened);
  }

  /**
   * @param {!SuggestBoxController} controller
   * @param {number} anchorOffset
   * @param {boolean} explicitlyOpened
   */
  constructor(controller, anchorOffset, explicitlyOpened) {
    this._controller = controller;
    this._renderer = controller._renderer;
    this._dictionary = controller._dictionary;
    this._editor = controller._dictionary.editor();
    this._explicitlyOpened = explicitlyOpened;

    this._domDocument = this._renderer.element().ownerDocument;
    this._element = this._domDocument.createElement('suggest-box');
    this._element.innerHTML = ``;
    this._renderer.layers().editor.appendChild(this._element);

    this._anchorHandle = this._editor.addHandle(anchorOffset, anchorOffset);
    this._plzUpdateSuggesions = false;

    this._eventListeners = [
      this._editor.addDecorationCallback(this._render.bind(this)),
      this._dictionary.on(WordDictionary.Events.Changed, this._markDirty.bind(this)),
      this._editor.document().on(Document.Events.Changed, this._onDocumentChanged.bind(this)),
      DOMUtils.on(this._element, 'mousemove', this._onMouseMove.bind(this)),
      DOMUtils.on(this._element, 'click', this._onClick.bind(this)),
    ];

    // Avoid rendering all suggestions until there's a user
    // interaction with the suggest box.
    this._fullyRendered = true;

    this._markDirty();
  }

  _onMouseMove() {
    this._ensureFullyRendered();
  }

  _onClick(event) {
    if (event.target.tagName !== 'SUGGEST-ENTRY')
      return;
    this._acceptSuggestionAndHide(event.target);
    event.stopPropagation();
    event.preventDefault();
    this._renderer.focus();
  }

  handleUp() {
    const selected = this._element.querySelector('.selected');
    if (!selected)
      return false;
    const prev = selected.previousElementSibling;
    if (!prev)
      return false;
    this._ensureFullyRendered();
    selected.classList.remove('selected');
    prev.classList.add('selected');
    prev.scrollIntoView({block: 'nearest'});
    return true;
  }

  handleDown() {
    const selected = this._element.querySelector('.selected');
    if (!selected)
      return false;
    const next = selected.nextElementSibling;
    if (!next)
      return false;
    this._ensureFullyRendered();
    selected.classList.remove('selected');
    next.classList.add('selected');
    next.scrollIntoView({block: 'nearest'});
    return true;
  }

  accept() {
    const selected = this._element.querySelector('.selected');
    if (!selected)
      return false;
    this._acceptSuggestionAndHide(selected);
    return true;
  }

  _acceptSuggestionAndHide(suggestionElement) {
    const postfix = suggestionElement.textContent.substring(this._prefix.length);
    this._editor.input().type(postfix);
    this._controller._hideSuggestBox();
  }

  dispose() {
    EventEmitter.removeEventListeners(this._eventListeners);
    this._element.remove();
    this._anchorHandle.remove();
  }

  _onDocumentChanged({selectionChanged}) {
    if (!selectionChanged)
      return;
    const cursor = this._editor.document().lastCursor();
    if (!cursor || this._anchorHandle.removed()) {
      this._controller._hideSuggestBox();
      return;
    }
    const prefix = this._dictionary.prefix(cursor.focus);
    if (cursor.focus - prefix.length !== this._anchorHandle.resolve().from)
      this._controller._hideSuggestBox();
    else
      this._markDirty();
  }

  _markDirty() {
    this._plzUpdateSuggesions = true;
    this._editor.raf();
  }

  _render() {
    if (this._anchorHandle.removed()) {
      this._controller._hideSuggestBox();
      return;
    }
    const anchorOffset = this._anchorHandle.resolve().from;
    const point = this._renderer.offsetToEditorPoint(anchorOffset);
    point.y += this._editor.markup().lineHeight();
    const cursor = this._editor.document().lastCursor();
    // If there's no selection or if suggestbox went off screen - hide.
    if (point.x <= 0 || point.y <= 0 || !cursor) {
      this._controller._hideSuggestBox();
      return;
    }
    // If cursor moved away from initial suggestion anchor - hide.
    this._prefix = this._dictionary.prefix(cursor.focus);
    // SuggestBox should be hidden if it wasn't explicitly opened.
    if (!this._explicitlyOpened && !this._prefix.length) {
      this._controller._hideSuggestBox();
      return;
    }
    // Update suggest box position.
    this._element.style.setProperty('--x', `${point.x}px`);
    this._element.style.setProperty('--y', `${point.y}px`);

    // Rerender suggestions only if necessary.
    if (!this._plzUpdateSuggesions)
      return;
    this._plzUpdateSuggesions = false;

    const suggestions = this._dictionary.wordsWithPrefix(this._prefix, PARTIAL_RENDERING /* limit */);
    if (!suggestions.length) {
      this._controller._hideSuggestBox();
      return;
    }
    this._element.textContent = '';
    for (const suggestion of suggestions)
      this._element.appendChild(this._buildSuggestionDOM(suggestion));
    this._element.firstChild.classList.add('selected');
    if (suggestions.length === PARTIAL_RENDERING) {
      this._fullyRendered = false;
    } else {
      this._fullyRendered = true;
    }
  }

  _ensureFullyRendered() {
    if (this._fullyRendered)
      return;
    this._fullyRendered = true;
    const suggestions = this._dictionary.wordsWithPrefix(this._prefix);
    for (const suggestion of suggestions.slice(PARTIAL_RENDERING))
      this._element.appendChild(this._buildSuggestionDOM(suggestion));
  }

  _buildSuggestionDOM(suggestion) {
    const entry = this._domDocument.createElement('suggest-entry');
    const prefixSpan = this._domDocument.createElement('b');
    prefixSpan.textContent = this._prefix;
    const postfixNode = this._domDocument.createTextNode(suggestion.substring(this._prefix.length));
    entry.appendChild(prefixSpan);
    entry.appendChild(postfixNode);
    return entry;
  }
}
