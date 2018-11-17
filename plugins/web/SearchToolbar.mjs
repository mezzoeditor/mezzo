import { EventEmitter } from '../../src/utils/EventEmitter.mjs';

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
   * @param {?Search} search
   */
  setSearch(search) {
    this._search = search;
    if (this._search) {
      EventEmitter.removeEventListeners(this._eventListeners);
      this._eventListeners = [
        this._search.on('changed', ({currentMatchIndex, matchesCount}) => this._updateSearchUI(currentMatchIndex, matchesCount))
      ];
      this._updateSearchUI(search.currentMatchIndex(), search.matchesCount());
      this._onSearchInput();
    } else {
      EventEmitter.removeEventListeners(this._eventListeners);
      this._updateSearchUI(0, 0);
    }
  }

  /**
   * @param {string} command
   */
  _onCommand(command) {
    const editor = this._renderer.editor();
    if (!editor || !this._search)
      return false;
    if (command === 'search.show') {
      const selectionRange = editor.document().selection()[0];
      const range = {
        from: Math.min(selectionRange.anchor, selectionRange.focus),
        to: Math.max(selectionRange.anchor, selectionRange.focus),
      };
      if (range && range.from !== range.to) {
        this._input.value = editor.document().text().content(range.from, range.to);
      }
      this._element.style.setProperty('display', 'flex');
      this._input.focus();
      this._input.select();
      this._updateSearchUI(this._search.currentMatchIndex(), this._search.matchesCount());
      this._isShown = true;
      this._onSearchInput();
      return true;
    }
    if (!this._isShown)
      return false;
    if (command === 'search.hide') {
      this._search.cancel();
      this._element.style.setProperty('display', 'none');
      this._renderer.focus();
      this._isShown = false;
      return true;
    }
    if (command === 'search.prev' && this._element.contains(document.activeElement)) {
      this._search.previousMatch();
      return true;
    }
    if (command === 'search.next' && this._element.contains(document.activeElement)) {
      this._search.nextMatch();
      return true;
    }
    return false;
  }

  _onSearchInput() {
    if (!this._search || !this._isShown)
      return;
    if (!this._input.value)
      this._search.cancel();
    else
      this._search.find(this._input.value, {caseInsensetive: this._caseInsensetive});
  }

  _updateSearchUI(currentMatchIndex, matchesCount) {
    if (!this._isShown)
      return;
    if (matchesCount === 0) {
      this._searchDetails.textContent = '0/0';
    } else {
      currentMatchIndex += 1;
      this._searchDetails.textContent = currentMatchIndex + '/' + matchesCount;
    }
  }
}
