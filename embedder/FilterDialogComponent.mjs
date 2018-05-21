import { FuzzySearch } from './FuzzySearch.mjs';
import { Icons } from './Icons.mjs';

// Number of search results to render immediately.
const SEARCH_RENDER_COUNT = 50;

export class FilterDialogComponent extends HTMLElement {
  constructor() {
    super();
    this._content = document.createElement('dialog-content');
    this.appendChild(this._content);

    this._input = document.createElement('input');
    this._content.appendChild(this._input);
    this._input.setAttribute('type', 'search');
    this._input.setAttribute('autocomplete', 'off');
    this._input.setAttribute('autocapitalize', 'off');
    this._input.setAttribute('spellcheck', 'false');
    this._input.setAttribute('size', '1');

    this._searchResultsElements = document.createElement('search-results');
    this._content.appendChild(this._searchResultsElements);
    this._items = [];
    this._visible = false;

    this._showOtherItem = document.createElement('search-item-custom');

    this._selectedElement = null;

    this._input.addEventListener('keydown', event => {
      if (event.key === 'Escape' || event.keyCode === 27) {
        event.preventDefault();
        this.setVisible(false);
      } else if (event.key === 'ArrowDown') {
        this._selectNext(event);
      } else if (event.key === 'ArrowUp') {
        this._selectPrevious(event);
      } else if (event.key === 'Enter') {
        event.preventDefault();
        if (this._selectedElement);
          this._selectedElement.click();
      }
    }, false);
    this._input.addEventListener('input', () => {
      this._search(this._input.value);
    }, false);
    this.addEventListener('click', event => {
      if (this._input.contains(event.target))
        return;
      let item = event.target;
      while (item && item.parentElement !== this._searchResultsElements)
        item = item.parentElement;
      if (!item) {
        this.setVisible(false);
        return;
      }
      if (item === this._showOtherItem) {
        // Render the rest.
        for (const result of this._remainingResults) {
          const element = this._renderResult(result);
          this._searchResultsElements.appendChild(element);
        }
        this._selectElement(this._showOtherItem.nextSibling);
        this._showOtherItem.remove();
        this._input.focus();
        event.preventDefault();
      } else {
        event.preventDefault();
        this.setVisible(false);
        item[FilterDialogComponent._symbol].select();
      }
    }, false);
  }

  setItems(items) {
    this._items = items;
  }

  setVisible(visible) {
    if (visible === this._visible)
      return;
    this._visible = visible;
    if (visible) {
      document.body.appendChild(this);
      this._input.focus();
    } else {
      this.remove();
    }
  }

  isVisible() {
    return this._visible;
  }

  setQuery(query) {
    this._input.value = query;
    this._search(query);
  }

  _search(query) {
    const results = []
    this._remainingResults = [];

    if (query) {
      const fuzzySearch = new FuzzySearch(query);
      for (const item of this._items) {
        let matches = [];
        let score = fuzzySearch.score(item.filterText(), matches);
        if (score !== 0) {
          results.push({item, score, matches});
        }
      }
      if (results.length === 0) {
        this._searchResultsElements.innerHTML = `<search-item-custom>No Results</search-item-custom>`;
        return;
      }
      results.sort((a, b) => {
        const scoreDiff = b.score - a.score;
        if (scoreDiff)
          return scoreDiff;
        // Prefer left-most search results.
        const startDiff = a.matches[0] - b.matches[0];
        if (startDiff)
          return startDiff;
        return a.item.filterText().length - b.item.filterText().length;
      });
    } else {
      for (const item of this._items)
        results.push({item, score: 0, matches: []});
    }
    this._searchResultsElements.innerHTML = '';
    this._searchResultsElements.scrollTop = 0;

    for (let i = 0; i < Math.min(results.length, SEARCH_RENDER_COUNT); ++i) {
      const item = this._renderResult(results[i]);
      this._searchResultsElements.appendChild(item);
    }

    this._remainingResults = results.slice(SEARCH_RENDER_COUNT);
    if (this._remainingResults.length > 0) {
      this._showOtherItem.textContent = `Show Remaining ${this._remainingResults.length} Results.`;
      this._searchResultsElements.appendChild(this._showOtherItem);
    }
    this._selectElement(this._searchResultsElements.firstChild, true /* omitScroll */);
  }

  _selectNext(event) {
    if (!this._selectedElement)
      return;
    event.preventDefault();
    let next = this._selectedElement.nextSibling;
    if (!next)
      next = this._searchResultsElements.firstChild;
    this._selectElement(next);
  }

  _selectPrevious(event) {
    if (!this._selectedElement)
      return;
    event.preventDefault();
    let previous = this._selectedElement.previousSibling;
    if (!previous)
      previous = this._searchResultsElements.lastChild;
    this._selectElement(previous);
  }

  _selectElement(item, omitScroll) {
    if (this._selectedElement)
      this._selectedElement.classList.remove('selected');
    this._selectedElement = item;
    if (this._selectedElement) {
      if (!omitScroll)
        this._selectedElement.scrollIntoViewIfNeeded(false);
      this._selectedElement.classList.add('selected');
    }
  }

  _renderResult(result) {
    const item = document.createElement('search-item');

    const render = result.item.render(result.matches);
    if (render.icon) {
      const itemIcon = document.createElement('search-item-icon');
      itemIcon.appendChild(render.icon);
      item.appendChild(itemIcon);
    }
    const itemTitle = document.createElement('search-item-title');
    itemTitle.appendChild(render.title);
    item[FilterDialogComponent._symbol] = result.item;
    item.appendChild(itemTitle);

    if (render.subtitle) {
      const itemSubtitle = document.createElement('search-item-subtitle');
      itemSubtitle.appendChild(render.subtitle);
      item.appendChild(itemSubtitle);
    } else {
      item.classList.add('no-subtitle');
    }
    return item;
  }
}

customElements.define('filter-dialog', FilterDialogComponent);

FilterDialogComponent._symbol = Symbol('FilterDialogComponent._symbol');

FilterDialogComponent.Item = class {
  filterText() {}

  select() {}

  render(matches) {}
}

export class FileFilterItem extends FilterDialogComponent.Item {
  constructor(rootPath, relPath, callback) {
    super();
    this._fullPath = rootPath + '/' + relPath;
    this._path = rootPath.split('/').pop() + '/' + relPath;
    this._callback = callback;
  }

  filterText() {
    return this._path;
  }

  select() {
    this._callback.call(null, this._fullPath);
  }

  /**
   * @param {!Array<number>} matches
   * @return {{icon: ?Element, title: ?Element, subtitle: ?Element}}
   */
  render(matches) {
    const icon = Icons.mimeTypeIcon(window.fs.mimeType(this._fullPath));
    const tokens = this._path.split('/');
    const name = tokens.pop();
    const path = tokens.length ? tokens.join('/') + '/' : '';
    const subtitle = renderTokensWithMatches(matches, [
      { text : path },
      { text: name, tagName: 'span' },
    ]);
    const title = subtitle.lastChild.cloneNode(true);
    return {icon, title, subtitle};
  }
}

/**
 * @param {string} text
 * @param {!Array<number>} matches
 * @param {number} fromIndex
 * @param {number} fromIndex
 * @return {!Element}
 */
function renderTokensWithMatches(matches, tokens) {
  if (!matches.length) {
    const fragment = document.createDocumentFragment();
    for (let token of tokens) {
      if (token.tagName) {
        const node = document.createElement(token.tagName);
        node.textContent = token.text;
        fragment.appendChild(node);
      } else {
        fragment.appendChild(document.createTextNode(token.text));
      }
    }
    return fragment;
  }

  const fragment = document.createDocumentFragment();
  let offset = 0;
  let matchesSet = new Set(matches);
  for (let token of tokens) {
    const result = token.tagName ? document.createElement(token.tagName) : document.createDocumentFragment();
    let from = 0;
    let lastInsideHighlight = false;
    for (let to = 0; to <= token.text.length; ++to) {
      const insideHighlight = matchesSet.has(to + offset);
      if (insideHighlight === lastInsideHighlight && to < token.text.length)
        continue;
      if (from < to) {
        if (lastInsideHighlight) {
          const node = document.createElement('search-highlight');
          node.textContent = token.text.substring(from, to);
          result.appendChild(node);
        } else {
          const node = document.createTextNode(token.text.substring(from, to));
          result.appendChild(node);
        }
        from = to;
      }
      lastInsideHighlight = insideHighlight;
    }
    offset += token.text.length;
    fragment.appendChild(result);
  }
  return fragment;
}

