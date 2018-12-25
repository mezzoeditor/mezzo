const TabIdSymbol = Symbol('TabIdSymbol');
export class TabStripComponent extends HTMLElement {
  constructor(delegate) {
    super();
    this.classList.add('hbox');
    this._tabs = new Map();
    this._selectedTabId = null;
    this._delegate = delegate;
    this.addEventListener('click', this._onClick.bind(this), false);
  }

  _onClick(event) {
    const tabElement = event.path.find(node => node.tagName && node.tagName.toLowerCase() === 'tabstrip-tab');
    if (!tabElement)
      return;
    this.selectTab(tabElement[TabIdSymbol]);
  }

  setTabDirtyIcon(id, enabled) {
    const tab = this._tabs.get(id);
    if (!tab)
      return;
    tab.element.classList.toggle('dirty-icon', enabled);
  }

  addTab(id, tabName, tabTooltip = '') {
    const element = document.createElement('tabstrip-tab');
    const closeIcon = document.createElement('div');
    closeIcon.classList.add('close-icon');
    closeIcon.addEventListener('click', event => {
      this.closeTab(id);
      event.stopPropagation();
    });
    element[TabIdSymbol] = id;
    const titleElement = document.createElement('span');
    titleElement.textContent = tabName;
    element.title = tabTooltip;
    element.appendChild(titleElement);
    element.appendChild(closeIcon);
    this.appendChild(element);

    const tab = {tabName, element};
    this._tabs.set(id, tab);
    if (this._delegate.didAddTab)
      this._delegate.didAddTab.call(null, id);
  }

  async closeTab(id) {
    const tab = this._tabs.get(id);
    if (!tab)
      return;
    // Delegate canceled close
    if (!(await this._delegate.requestTabClose(id)))
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
    if (this._delegate.didCloseTab)
      this._delegate.didCloseTab.call(null, id);
  }

  tabs() {
    return Array.from(this._tabs.keys());
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
    if (this._delegate.onTabSelected)
      this._delegate.onTabSelected.call(null, id);
  }
}

customElements.define('tabstrip-component', TabStripComponent);
