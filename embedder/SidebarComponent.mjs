const FilePathSymbol = Symbol('FilePathSymbol');

export class SidebarComponent extends HTMLElement {
  /**
   * @apram {!FileSystem} fs
   */
  constructor(fs) {
    super();
    this._fs = fs;
    this._fs.addFilesChangedCallback(this._onFilesChanged.bind(this));
    this._render();
    this._selectedCallback = null;
    this._selectedItem = null;
    this.addEventListener('click', this._onClick.bind(this), false);
  }

  _onClick(event) {
    if (event.target.classList.contains('file-entry') && this._selectedCallback)
      this._select(event.target);
  }

  _select(item) {
    if (this._selectedItem) {
      this._selectedItem.classList.remove('selected');
    }
    this._selectedItem = item;
    this._selectedItem.classList.add('selected');
    this._selectedCallback.call(null, item[FilePathSymbol]);
  }

  setSelectedCallback(callback) {
    this._selectedCallback = callback;
  }

  _render() {
    if (this._listElement)
      this._listElement.remove();
    this._listElement = document.createElement('div');

    const root = this._fs.roots()[0];
    if (!root)
      return;

    const paths = Array.from(this._fs.paths()).sort().slice(0, 300);
    for (const path of paths) {
      if (!this._fs.isFilePath(path))
        continue;
      const fileEntry = document.createElement('div');
      fileEntry.classList.add('file-entry');
      let filePath = path.substring(root.length);
      if (filePath.startsWith('/'))
        filePath = filePath.substring(1);
      fileEntry.textContent = filePath;
      fileEntry.title = path;
      fileEntry[FilePathSymbol] = path;
      this._listElement.appendChild(fileEntry);
    }

    this.appendChild(this._listElement);
  }

  _onFilesChanged() {
    this._render();
  }
}

customElements.define('sidebar-component', SidebarComponent);
