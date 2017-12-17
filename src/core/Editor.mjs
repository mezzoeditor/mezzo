import { History } from "./History.mjs";
import { Text } from "./Text.mjs";

export class Editor {
  /**
   * @param {function()} onInvalidate
   */
  constructor(onInvalidate) {
    this._onInvalidate = onInvalidate;
    this._plugins = new Map();
    this._history = new History({text: Text.withContent('')});
    this._text = this._history.current().text;
    this._operation = null;
    this._replacements = null;
  }

  invalidate() {
    this._onInvalidate.call(null);
  }

  /**
   * @param {number} from
   * @param {number} to
   * @param {string} insertion
   */
  replace(from, to, insertion) {
    if (this._operation === null)
      throw 'Editing outside of operation';
    this._replacements.push({from, to, inserted: insertion.length});
    let text = this._text.replace(from, to, insertion);
    this._text.resetCache();
    this._text = text;
    for (let plugin of this._plugins.values()) {
      if (plugin.onReplace)
        plugin.onReplace(from, to, insertion.length);
    }
  }

  /**
   * @param {string} name
   */
  begin(name) {
    if (this._operation !== null)
      throw 'Another operation in progress';
    this._operation = name;
    this._replacements = [];
  }

  /**
   * @param {string} name
   */
  end(name) {
    if (this._operation !== name)
      throw 'Trying to end wrong operation';
    let state = {
      text: this._text,
      data: new Map(),
      replacements: this._replacements,
      operation: this._operation
    };
    for (let name of this._plugins.keys()) {
      let plugin = this._plugins.get(name);
      let data;
      // TODO: investigate not saving state every time if we can collapse states.
      //       Or maybe presistent data structures will save us?
      if (plugin.onSave)
        data = plugin.onSave();
      if (data !== undefined)
        state.data.set(name, data);
    }
    this._history.push(state);
    this._operation = null;
    this._replacements = null;
    this.invalidate();
  }

  /**
   * @param {string} name
   * @return {boolean}
   */
  undo(name) {
    // TODO: implement |name|.
    let current = this._history.current();
    let state = this._history.undo();
    if (!state)
      return false;
    this._text = state.text;

    let replacements = [];
    for (let i = current.replacements.length - 1; i >= 0; i--) {
      let {from, to, inserted} = current.replacements[i];
      replacements.push({from, to: from + inserted, inserted: to - from});
    }

    for (let name of this._plugins.keys()) {
      let plugin = this._plugins.get(name);
      let data = state.data.get(name);
      if (plugin.onRestore)
        plugin.onRestore(replacements, data);
    }
    return true;
  }

  /**
   * @param {string} name
   * @return {boolean}
   */
  redo(name) {
    // TODO: implement |name|.
    let state = this._history.redo();
    if (!state)
      return false;
    this._text = state.text;
    for (let name of this._plugins.keys()) {
      let plugin = this._plugins.get(name);
      let data = state.data.get(name);
      if (plugin.onRestore)
        plugin.onRestore(state.replacements, data);
    }
    return true;
  }

  /**
   * @param {string} name
   * @param {!Plugin} plugin
   */
  addPlugin(name, plugin) {
    if (this._plugins.get(name))
      throw 'Duplicate plugin';
    this._plugins.set(name, plugin);
  }

  /**
   * @param {string} name
   * @param {!Plugin} plugin
   */
  removePlugin(name, plugin) {
    if (this._plugins.get(name) !== plugin)
      throw 'No such plugin';
    this._plugins.delete(name);
  }

  /**
   * @param {number=} from
   * @param {number=} to
   * @return {string}
   */
  content(from, to) {
    return this._text.iterator(from, to);
  }

  /**
   * @param {number=} from
   * @param {number=} to
   * @return {!Text.Iterator}
   */
  iterator(from, to) {
    return this._text.iterator(from, to);
  }

  /**
   * @return {number}
   */
  lineCount() {
    return this._text.lineCount();
  }

  /**
   * @return {number}
   */
  longestLineLength() {
    return this._text.longestLineLength();
  }

  /**
   * @return {number}
   */
  length() {
    return this._text.length();
  }

  /**
   * @param {number} offset
   * @return {?{line: number, column: number, offset: number}}
   */
  offsetToPosition(offset) {
    return this._text.offsetToPosition(offset);
  }

  /**
   * @param {!{line: number, column: number}} position
   * @param {boolean=} clamp
   * @return {number}
   */
  positionToOffset(position, clamp) {
    return this._text.positionToOffset(position, clamp);
  }
};
