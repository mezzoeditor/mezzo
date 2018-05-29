import { EventEmitter } from '../../src/core/EventEmitter.mjs';

export class SearchToolbar {
  /**
   * @param {!Renderer} renderer
   */
  constructor(renderer) {
    const document = renderer.element().ownerDocument;
    this._element = document.createElement('search-toolbar');
    this._caseInsensetive = true;
    this._element.innerHTML = `
      <search-container>
        <search-btn class=case>${this._caseInsensetive ? 'aa' : 'Aa'}</search-btn>
        <search-focus-ring>
          <input></input>
          <search-details>0/0</search-details>
        </search-focus-ring>
        <search-btn class=prev tabIndex=0><span>❮</span></search-btn>
        <search-btn class=next tabIndex=0><span>❯</span></search-btn>
      </search-container>
      <search-cancel>×</search-cancel>
    `;
    this._input = this._element.querySelector('input');
    this._input.addEventListener('input', this._onSearchInput.bind(this), false);
    this._element.querySelector('search-btn.case').addEventListener('click', event => {
      let target = event.target;
      this._caseInsensetive = !this._caseInsensetive;
      if (this._caseInsensetive)
        target.textContent = 'aa';
      else
        target.textContent = 'Aa';
      this._onSearchInput();
    }, false);
    this._element.querySelector('search-btn.prev').addEventListener('click', () => {
      this._onCommand('search.prev');
    }, false);
    this._element.querySelector('search-btn.next').addEventListener('click', () => {
      this._onCommand('search.next');
    }, false);
    this._element.querySelector('search-cancel').addEventListener('click', () => {
      this._onCommand('search.hide');
    }, false);
    this._searchDetails = this._element.querySelector('search-details');

    this._renderer = renderer;
    this._renderer.keymapHandler().addKeymap({
      'Cmd/Ctrl-f': 'search.show',
      'Escape': 'search.hide',
      'Enter': 'search.next',
      'Shift-Enter': 'search.prev',
    }, this._onCommand.bind(this));

    this._eventListeners = [];
    this._isShown = false;

    renderer.element().appendChild(this._element);
  }

  /**
   * @param {string} command
   */
  _onCommand(command) {
    const editor = this._renderer.editor();
    if (!editor)
      return false;
    if (command === 'search.show') {
      const range = editor.selection().ranges()[0];
      if (range && range.from !== range.to) {
        this._input.value = editor.document().content(range.from, range.to);
      }
      this._element.style.setProperty('display', 'flex');
      this._input.focus();
      this._input.select();
      this._onSearchInput();
      EventEmitter.removeEventListeners(this._eventListeners);
      this._eventListeners = [
        editor.search().on('changed', this._onSearchChanged.bind(this))
      ];
      this._isShown = true;
      return true;
    }
    if (!this._isShown)
      return false;
    if (command === 'search.hide') {
      editor.search().cancel();
      this._element.style.setProperty('display', 'none');
      this._renderer.focus();
      EventEmitter.removeEventListeners(this._eventListeners);
      this._isShown = false;
      return true;
    }
    if (command === 'search.prev' && this._element.contains(document.activeElement)) {
      editor.search().previousMatch();
      return true;
    }
    if (command === 'search.next' && this._element.contains(document.activeElement)) {
      editor.search().nextMatch();
      return true;
    }
    return false;
  }

  _onSearchInput() {
    const editor = this._renderer.editor();
    if (!editor)
      return;
    if (!this._input.value)
      editor.search().cancel();
    else
      editor.search().find(this._input.value, {caseInsensetive: this._caseInsensetive});
  }

  _onSearchChanged({currentMatchIndex, matchesCount}) {
    if (matchesCount === 0) {
      this._searchDetails.textContent = '0/0';
    } else {
      currentMatchIndex += 1;
      this._searchDetails.textContent = currentMatchIndex + '/' + matchesCount;
    }
  }
}
