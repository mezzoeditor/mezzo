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
    this._treeElement = document.createElement('file-navigator');
    this._footer = document.createElement('footer');
    this._treeElement.appendChild(this._footer);
    this.appendChild(this._treeElement);
    this._root = new NavigatorTreeNode('', null);
    this.addEventListener('click', this._onClick.bind(this), false);

    this._onRootsChanged(this._fs.roots(), []);
    this._onFilesChanged(this._fs.paths(), []);
    this._render();
  }

  _onClick(event) {
    const fileEntry = event.path.find(node => node.tagName && node.tagName.toLowerCase() === 'file-entry');
    if (fileEntry && this._selectedCallback)
      this._select(fileEntry);
  }

  _select(item) {
    if (this._selectedItem) {
      this._selectedItem.classList.remove('selected');
    }
    const node = item[NavigatorTreeNodeSymbol];
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
    const elements = this._flatNodes(0, Infinity).map(node => node.render()).concat(this._footer);
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

  _onFilesChanged(added, removed) {
    this._addNodes(added, false /* createExpanded */);
    this._removeNodes(removed);
    this._render();
  }

  _onRootsChanged(added, removed) {
    this._addNodes(added, true /* createExpanded */);
    this._removeNodes(removed);
  }

  _flatNodes(from, to) {
    const result = [];
    dfs(this._root, -1, from, to);
    return result;

    function dfs(u, current, from, to) {
      if (current >= to)
        return current;
      if (current + u.subtreeSize < from)
        return current + u.subtreeSize;
      if (from <= current && current < to)
        result.push(u);
      current += 1;
      if (!u.collapsed || !u.parent) {
        u.ensureSortedChildren();
        for (const child of u.sortedChildren)
          current = dfs(child, current, from, to);
      }
      return current;
    }
  }

  _addNodes(paths, createExpanded) {
    for (const path of paths) {
      const tokens = path.split('/').filter(token => !!token);
      let wp = this._root;
      for (const token of tokens) {
        if (wp.children.has(token)) {
          wp.subtreeSize += 1;
          wp = wp.children.get(token);
          continue;
        }
        const node = new NavigatorTreeNode(token, wp);
        node.collapsed = !createExpanded;
        node.subtreeSize += 1;
        wp.children.set(node.name, node);
        wp.sortedChildren.length = 0;
        wp = node;
      }
      wp.isFile = this._fs.isFilePath(path);
    }
  }

  _removeNodes(paths) {
    for (const path of paths) {
      const tokens = path.split('/').filter(token => !!token);
      let wp = this._root;
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

  _flatNodes(from, to) {
    const result = [];
    dfs(this._root, -1, from, to);
    return result;

    function dfs(u, current, from, to) {
      if (current >= to)
        return current;
      if (current + u.subtreeSize < from)
        return current + u.subtreeSize;
      if (from <= current && current < to)
        result.push(u);
      current += 1;
      if (!u.collapsed || !u.parent) {
        u.ensureSortedChildren();
        for (const child of u.sortedChildren)
          current = dfs(child, current, from, to);
      }
      return current;
    }
  }
}

customElements.define('sidebar-component', SidebarComponent);

class NavigatorTreeNode {
  constructor(name, parent) {
    this.name = name;
    this.fullName = parent ? parent.fullName + '/' + name : '';
    this.parent = parent;
    this.depth = parent ? parent.depth + 1 : 0;
    this.subtreeSize = 0;
    this.collapsed = false;
    this.children = new Map();
    this.isFile = false;

    this._expandIcon = null;
    this._element = null;

    this.sortedChildren = [];
  }

  render() {
    if (!this._element) {
      const nodeEntry = document.createElement('file-entry');
      nodeEntry.title = this.fullName;
      nodeEntry[NavigatorTreeNodeSymbol] = this;
      nodeEntry.style.paddingLeft = 10 * this.depth + 'px';

      const content = document.createElement('file-entry-content');

      this._expandIcon = document.createElement('expand-icon');
      this._expandIcon.style.visibility = this.isFile ? 'hidden' : 'visible';
      content.appendChild(this._expandIcon);
      content.appendChild(document.createTextNode(this.name));
      nodeEntry.appendChild(content);
      this._element = nodeEntry;
    }
    this._expandIcon.classList.toggle('expanded', !this.collapsed);
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
