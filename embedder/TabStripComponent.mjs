export class TabStripComponent extends HTMLElement {
  constructor() {
    super();
    this.classList.add('hbox');
    this._tabs = new Map();
    this._selectedTabId = null;
  }

  addTab(id, title) {
    const element = document.createElement('tabstrip-tab');
    element.textContent = title;
    this.appendChild(element);

    const tab = {title, element};
    this._tabs.set(id, tab);
  }

  hasTab(id) {
    return this._tabs.has(id);
  }

  selectTab(id) {
    if (this._selectedTabId)
      this._tabs.get(this._selectedTabId).element.classList.remove('selected');
    this._selectedTabId = id;
    if (this._selectedTabId)
      this._tabs.get(this._selectedTabId).element.classList.add('selected');
  }
}

customElements.define('tabstrip-component', TabStripComponent);
