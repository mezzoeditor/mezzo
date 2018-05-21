const TabIdSymbol = Symbol('TabIdSymbol');
export class TabStripComponent extends HTMLElement {
  constructor() {
    super();
    this.classList.add('hbox');
    this._tabs = new Map();
    this._selectedTabId = null;
    this.addEventListener('click', this._onClick.bind(this), false);
  }

  _onClick(event) {
    const tabElement = event.path.find(node => node.tagName && node.tagName.toLowerCase() === 'tabstrip-tab');
    if (!tabElement)
      return;
    this.selectTab(tabElement[TabIdSymbol]);
  }

  setSelectedCallback(callback) {
    this._selectedCallback = callback;
  }

  addTab(id, title) {
    const element = document.createElement('tabstrip-tab');
    element[TabIdSymbol] = id;
    element.textContent = title;
    this.appendChild(element);

    const tab = {title, element};
    this._tabs.set(id, tab);
  }

  closeTab(id) {
    const tab = this._tabs.get(id);
    if (!tab)
      return;
    let nextId = null;
    if (this._tabs.size !== 1) {
      // Find next tab id to select.
      const ids = Array.from(this._tabs.keys());
      const index = ids.indexOf(id);
      nextId = index === ids.length - 1 ? ids[index - 1] : ids[index + 1];
    }
    this.selectTab(nextId);
    this._tabs.delete(id);
    tab.element.remove();
  }

  hasTab(id) {
    return this._tabs.has(id);
  }

  /**
   * @return {?string}
   */
  selectedTab() {
    return this._selectedTabId;
  }

  selectTab(id) {
    if (this._selectedTabId === id)
      return;
    if (this._selectedTabId)
      this._tabs.get(this._selectedTabId).element.classList.remove('selected');
    this._selectedTabId = id;
    if (this._selectedTabId)
      this._tabs.get(this._selectedTabId).element.classList.add('selected');
    if (this._selectedCallback)
      this._selectedCallback.call(null, id);
  }
}

customElements.define('tabstrip-component', TabStripComponent);
