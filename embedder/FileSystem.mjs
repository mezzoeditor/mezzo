let id = 1;

export class FileSystem {
  constructor() {
    this._roots = new Set();
    this._filesChangedCallbacks = [];
    this._rootsChangedCallbacks = [];
    this._paths = new Set();
  }

  initialize(path) {
    this._roots.add(path);
    const callbackName = '_bindingFilesChanged' + (id++);
    window[callbackName] = this._bindingFilesChanged.bind(this);
    window._bindingInitializeFS(path, callbackName);
    for (const callback of this._rootsChangedCallbacks)
      callback.call(null, [path], []);
  }

  _bindingFilesChanged(added, removed, changed) {
    const removedPaths = [];
    const changedPaths = [];
    for (const path of removed) {
      if (this._paths.has(path)) {
        this._paths.delete(path);
        removedPaths.push(path);
      }
    }
    for (const path of changed) {
      if (this._paths.has(path))
        changedPaths.push(path);
    }
    for (const path of added)
      this._paths.add(path);
    for (const callback of this._filesChangedCallbacks)
      callback.call(null, added, removedPaths, changedPaths);
  }

  paths() {
    return this._paths;
  }

  roots() {
    return Array.from(this._roots);
  }

  mimeType(path) {
    if (path.endsWith('.mjs') || path.endsWith('.js'))
      return 'text/javascript';
    if (path.endsWith('.css'))
      return 'text/css';
    if (path.endsWith('.html') || path.endsWith('.htm'))
      return 'text/html';
    return 'text/plain';
  }

  isFilePath(path) {
    // TODO: this is a very rough way to figure "fileness".
    // Stats for fileSystem entries has to be reported from embedder.
    return path.split('/').pop().indexOf('.') !== -1;
  }

  fileName(path) {
    return path.split('/').pop();
  }

  addFilesChangedCallback(callback) {
    this._filesChangedCallbacks.push(callback);
  }

  addRootsChangedCallback(callback) {
    this._rootsChangedCallbacks.push(callback);
  }

  async readFile(filePath) {
    return await window._bindingReadFile(filePath);
  }

  async saveFile(filePath, content) {
    await window._bindingSaveFile(filePath, content)
  }
}

