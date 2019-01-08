import { EventEmitter } from '../core/utils/EventEmitter.mjs';

let id = 1;

export class FileSystem extends EventEmitter {
  constructor() {
    super();
    /** @type {!Map<string, !Set<string>>} */
    this._relativeRootPaths = new Map();
  }

  addRoot(path) {
    this._relativeRootPaths.set(path, new Set());
    const callbackName = '_bindingFilesChanged' + (id++);
    window[callbackName] = this._bindingFilesChanged.bind(this, path);
    window._bindingInitializeFS(path, callbackName);
    this.emit(FileSystem.Events.RootsChanged, [path], []);
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
    this.emit(FileSystem.Events.FilesChanged, root, addedRelativePaths, removedRelativePaths, changedRelativePaths);

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
    if (!this.isFilePath(path))
      return '';
    if (path.endsWith('.mjs') || path.endsWith('.js') || path.endsWith('json'))
      return 'text/javascript';
    if (path.endsWith('.css'))
      return 'text/css';
    if (path.endsWith('.md'))
      return 'text/markdown';
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

  async readFile(filePath) {
    return await window._bindingReadFile(filePath);
  }

  async saveFile(filePath, content) {
    await window._bindingSaveFile(filePath, content)
  }
}

FileSystem.Events = {
  FilesChanged: Symbol('FilesChanged'),
  RootsChanged: Symbol('RootsChanged'),
};

