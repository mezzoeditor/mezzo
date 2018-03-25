let id = 1;

export class FileSystem {
  constructor() {
    this._roots = [];
    this._callbacks = [];
    this._paths = new Set();
  }

  initialize(path) {
    this._roots.push(path);
    const callbackName = '_bindingFilesChanged' + (id++);
    window[callbackName] = this._bindingFilesChanged.bind(this);
    window._bindingInitializeFS(path, callbackName);
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
    for (const callback of this._callbacks)
      callback.call(null, added, removedPaths, changedPaths);
  }

  paths() {
    return this._paths;
  }

  roots() {
    return this._roots;
  }

  isFilePath(path) {
    // TODO: this is a very rough way to figure "fileness".
    // Stats for fileSystem entries has to be reported from embedder.
    return path.split('/').pop().indexOf('.') !== -1;
  }

  addFilesChangedCallback(callback) {
    this._callbacks.push(callback);
  }

  async readFile(filePath) {
    return await window._bindingReadFile(filePath);
  }

  async saveFile(filePath, content) {
    await window._bindingSaveFile(filePath, content)
  }
}

