const NavigatorTreeNodeSymbol = Symbol('NavigatorTreeNodeSymbol');

export class SidebarComponent extends HTMLElement {
  /**
   * @apram {!FileSystem} fs
   */
  constructor(fs) {
    super();
    this._fs = fs;
    this._fs.addFilesChangedCallback(this._onFilesChanged.bind(this));
    this._fs.addRootsChangedCallback(this._onRootsChanged.bind(this));
    this._selectedCallback = null;
    this._selectedItem = null;
    this._header = document.createElement('header');
    this.appendChild(this._header);
    this._header.textContent = `FOLDERS`;
    this._treeElement = document.createElement('file-navigator');
    this._footer = document.createElement('footer');

    this._treeElement.appendChild(this._footer);
    this.appendChild(this._treeElement);
    /* @type {!Map<string, !NavigatorTreeNode>} */
    this._roots = new Map();
    this.addEventListener('click', this._onClick.bind(this), false);

    this._onRootsChanged(this._fs.roots(), []);
    for (const root of this._fs.roots())
      this._onFilesChanged(root, this._fs.relativeRootPaths(root), []);
    this._render();
  }

  _onClick(event) {
    const fileEntry = event.path.find(node => node.tagName && node.tagName.toLowerCase() === 'file-entry');
    if (fileEntry && this._selectedCallback) {
      this._select(fileEntry);
      event.preventDefault();
      event.stopPropagation();
    }
  }

  _select(item) {
    const node = item[NavigatorTreeNodeSymbol];
    if (this._selectedItem && node.isFile)
      this._selectedItem.classList.remove('selected');
    if (!node.isFile) {
      node.collapsed = !node.collapsed;
      this._render();
    } else {
      this._selectedItem = item;
      this._selectedItem.classList.add('selected');
      this._selectedCallback.call(null, item[NavigatorTreeNodeSymbol].fullName);
    }
  }

  setSelectedCallback(callback) {
    this._selectedCallback = callback;
  }

  _render() {
    const elements = [];
    for (const root of this._roots.values())
      elements.push(...this._flatNodes(root, 0, Infinity).map(node => node.render()));
    elements.push(this._footer);

    let last = this._treeElement.firstChild;
    for (const element of elements) {
      if (element.parentElement === this._treeElement) {
        while (last && last !== element) {
          const e = last.nextSibling;
          last.remove();
          last = e;
        }
      } else {
        this._treeElement.insertBefore(element, last);
      }
      last = element.nextSibling;
    }
  }

  _onFilesChanged(rootPath, added, removed) {
    const root = this._roots.get(rootPath);
    this._addNodes(root, added, false /* createExpanded */);
    this._removeNodes(root, removed);
    this._render();
  }

  _onRootsChanged(added, removed) {
    for (const path of removed) {
      this._roots.delete(path);
    }
    for (const path of added) {
      const root = new NavigatorTreeNode(path.split('/').pop());
      root.fullName = path;
      root.collapsed = false;
      this._roots.set(path, root);
    }
  }

  _flatNodes(root, from, to) {
    const result = [];
    dfs(root, 0, from, to);
    return result;

    function dfs(u, current, from, to) {
      if (current >= to)
        return current;
      if (current + u.subtreeSize < from)
        return current + u.subtreeSize;
      if (from <= current && current < to)
        result.push(u);
      current += 1;
      if (!u.collapsed) {
        u.ensureSortedChildren();
        for (const child of u.sortedChildren)
          current = dfs(child, current, from, to);
      }
      return current;
    }
  }

  _addNodes(root, paths, createExpanded) {
    for (const path of paths) {
      const tokens = path.split('/').filter(token => !!token);
      let wp = root;
      const mimeType = this._fs.mimeType(path);
      for (const token of tokens) {
        if (wp.children.has(token)) {
          wp.subtreeSize += 1;
          wp = wp.children.get(token);
          continue;
        }
        const node = new NavigatorTreeNode(token, wp);
        node.collapsed = !createExpanded;
        node.mimeType = mimeType;
        wp.children.set(node.name, node);
        wp.sortedChildren.length = 0;
        wp = node;
      }
      wp.isFile = this._fs.isFilePath(path);
    }
  }

  _removeNodes(root, paths) {
    for (const path of paths) {
      const tokens = path.split('/').filter(token => !!token);
      let wp = root;
      for (const token of tokens) {
        wp.subtreeSize -= 1;
        const child = wp.children.get(token);
        if (child.subtreeSize === 1) {
          wp.children.delete(token);
          wp.sortedChildren.length = 0;
          break;
        }
        wp = child;
      }
    }
  }
}

customElements.define('sidebar-component', SidebarComponent);

const filetypeClasses = {
  'text/javascript': 'mime-js',
  'text/css': 'mime-css',
  'text/html': 'mime-html',
  'text/plain': 'mime-plain',
};

class NavigatorTreeNode {
  constructor(name, parent) {
    this.name = name;
    this.fullName = parent ? parent.fullName + '/' + name : '';
    this.parent = parent;
    this.depth = parent ? parent.depth + 1 : 0;
    this.subtreeSize = 1;
    this.collapsed = false;
    this.children = new Map();
    this.isFile = false;

    this._icon = null;
    this._element = null;
    this.mimeType = 'text/plain';

    this.sortedChildren = [];
  }

  render() {
    if (!this._element) {
      const nodeEntry = document.createElement('file-entry');
      nodeEntry.title = this.fullName;
      nodeEntry[NavigatorTreeNodeSymbol] = this;
      nodeEntry.style.setProperty('--depth', this.depth);

      const content = document.createElement('file-entry-content');

      if (this.isFile) {
        this._icon = document.createElement('filetype-icon');
        this._icon.classList.add(filetypeClasses[this.mimeType]);
      } else {
        this._icon = document.createElement('expand-icon');
      }
      content.appendChild(this._icon);
      content.appendChild(document.createTextNode(this.name));
      nodeEntry.appendChild(content);
      this._element = nodeEntry;
    }
    if (!this.isFile)
      this._icon.classList.toggle('expanded', !this.collapsed);
    return this._element;
  }

  ensureSortedChildren() {
    if (this.sortedChildren.length == this.children.size)
      return;
    this.sortedChildren = Array.from(this.children.values()).sort((a, b) => {
      if (a.isFile !== b.isFile)
        return a.isFile ? 1 : -1;
      return a.name.localeCompare(b.name);
    });
  }
}
