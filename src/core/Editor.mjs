import { History } from "./History.mjs";
import { Text } from "./Text.mjs";
import { Viewport } from "./Viewport.mjs";

// TODO: rename this to Document or something alike?
export class Editor {
  /**
   * @param {function()} onInvalidate
   */
  constructor(onInvalidate) {
    this._onInvalidate = onInvalidate;
    this._plugins = new Map();
    this._history = new History({
      text: Text.withContent(''),
      replacements: [],
      data: new Map(),
      operation: '__initial__'
    });
    this._text = this._history.current().text;
    this._operation = null;
    this._replacements = null;
    this._frozen = false;
  }

  /**
   * @param {string} text
   */
  reset(text) {
    if (this._operation !== null)
      throw 'Cannot reset during operation';
    if (this._frozen)
      throw 'Cannot mutate while building viewport';
    let to = this._text.length();
    this._history.reset({
      text: Text.withContent(text),
      replacements: [],
      data: new Map(),
      operation: '__initial__'
    });
    this._text = this._history.current().text;
    for (let plugin of this._plugins.values()) {
      if (plugin.onReplace)
        plugin.onReplace(0, to, text.length);
    }
    this.invalidate();
  }

  invalidate() {
    this._onInvalidate.call(null);
  }

  /**
   * @param {{line: number, column: number}} start
   * @param {{line: number, column: number}} end
   * @return {!Viewport}
   */
  buildViewport(start, end) {
    this._frozen = true;
    let viewport = new Viewport(this, start, end);
    for (let plugin of this._plugins.values()) {
      if (plugin.onViewport)
        plugin.onViewport(viewport);
    }
    this._frozen = false;
    return viewport;
  }

  /**
   * @param {number} from
   * @param {number} to
   * @param {string} insertion
   */
  replace(from, to, insertion) {
    if (this._operation === null)
      throw 'Cannot edit outside of operation';
    if (this._frozen)
      throw 'Cannot mutate while building viewport';
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
    if (this._frozen)
      throw 'Cannot mutate while building viewport';
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
    if (this._operation !== null)
      throw 'Cannot undo during operation';
    if (this._frozen)
      throw 'Cannot mutate while building viewport';
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
    this.invalidate();
    return true;
  }

  /**
   * @param {string} name
   * @return {boolean}
   */
  redo(name) {
    if (this._operation !== null)
      throw 'Cannot redo during operation';
    if (this._frozen)
      throw 'Cannot mutate while building viewport';
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
    this.invalidate();
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
   * @param {string} command
   * @param {*} data
   * @return {*}
   */
  perform(command, data) {
    if (this._frozen)
      throw 'Cannot mutate while building viewport';
    if (command === 'history.undo')
      return this.undo();
    if (command === 'history.redo')
      return this.redo();
    for (let plugin of this._plugins.values()) {
      if (!plugin.onCommand)
        continue;
      let result = plugin.onCommand(command, data);
      if (result !== undefined)
        return result;
    }
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

Editor.Commands = new Set(['history.undo', 'history.redo']);
