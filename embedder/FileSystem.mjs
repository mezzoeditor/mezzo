let id = 1;

export class FileSystem {
  constructor() {
    this._filesChangedCallbacks = [];
    this._rootsChangedCallbacks = [];
    /** @type {!Map<string, !Set<string>>} */
    this._relativeRootPaths = new Map();
  }

  initialize(path) {
    this._relativeRootPaths.set(path, new Set());
    const callbackName = '_bindingFilesChanged' + (id++);
    window[callbackName] = this._bindingFilesChanged.bind(this, path);
    window._bindingInitializeFS(path, callbackName);
    for (const callback of this._rootsChangedCallbacks)
      callback.call(null, [path], []);
  }

  _bindingFilesChanged(root, added, removed, changed) {
    const removedRelativePaths = [];
    const changedRelativePaths = [];
    const addedRelativePaths = [];
    const relativePaths = this._relativeRootPaths.get(root);
    for (const path of removed) {
      const relPath = relify(root, path);
      if (relativePaths.has(relPath)) {
        relativePaths.delete(relPath);
        removedRelativePaths.push(relPath);
      }
    }
    for (const path of changed) {
      const relPath = relify(root, path);
      if (relativePaths.has(relPath))
        changedRelativePaths.push(relPath);
    }
    for (const path of added) {
      const relPath = relify(root, path);
      relativePaths.add(relPath);
      addedRelativePaths.push(relPath);
    }
    for (const callback of this._filesChangedCallbacks)
      callback.call(null, root, addedRelativePaths, removedRelativePaths, changedRelativePaths);

    function relify(root, path) {
      path = path.substring(root.length);
      if (path.startsWith('/'))
        path = path.substring(1);
      return path;
    }
  }

  roots() {
    return Array.from(this._relativeRootPaths.keys());
  }

  relativeRootPaths(root) {
    return Array.from(this._relativeRootPaths.get(root));
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

