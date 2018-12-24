export class Theme {
  constructor(theme) {
    this._config = theme;
    this._cache = new Map();
  }

  get(...path) {
    let node = this._config;
    for (const selector of path) {
      let selectorCache = this._cache.get(node);
      if (!selectorCache) {
        selectorCache = new Map();
        this._cache.set(node, selectorCache);
      }
      let result = selectorCache.get(selector);
      if (!result) {
        result = this._computeSelector(node, selector);
        selectorCache.set(selector, result);
      }
      if (!result)
        return null;
      node = result;
    }
    return node;
  }

  _computeSelector(node, selector) {
    while (selector) {
      let result = node[selector];
      if (result)
        return result;
      selector = selector.substring(0, selector.lastIndexOf('.'));
    }
    return null;
  }
}
