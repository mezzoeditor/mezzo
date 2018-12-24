export class Theme {
  constructor(url, theme) {
    this._url = url;
    this._config = theme;
    this._cache = new Map();
  }

  url() {
    return this._url;
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

  compose(theme) {
    return new Theme('#composed', merge(this._config, theme));

    function merge(obj1, obj2) {
      const result = {};
      const keys = new Set([...Object.keys(obj1), ...Object.keys(obj2)]);
      for (const key of keys) {
        const has1 = key in obj1;
        const has2 = key in obj2;
        const value1 = obj1[key];
        const value2 = obj2[key];
        if (typeof value1 === 'object' && typeof value2 === 'object')
          result[key] = merge(obj1[key], obj2[key]);
        else if (has2)
          result[key] = value2;
        else if (has1)
          result[key] = value1;
      }
      return result;
    }
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
