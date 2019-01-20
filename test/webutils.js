import os from 'os';
import {parseTextWithCursors} from './utils.js';

// GG is a user. GG starts with opening editor in a given tab,
// and then silently obeys orders.
// NOTE: loaded page should expose |window.editor| and |window.renderer|
// so that GG knows what to drive.
export class GG {
  static async create(server, page, url) {
    await page.goto(url);
    await page.click('canvas');
    return new GG(page);
  }

  constructor(page) {
    this._page = page;
    this._isMac = os.platform() === 'darwin';
    this._modifier = this._isMac ? 'Meta' : 'Control';
  }

  async evaluate(...args) {
    return await this._page.evaluate(...args);
  }

  async waitUntilIdle() {
    await this._page.evaluate(async () => {
      await new Promise(f => editor.platformSupport().requestIdleCallback(f));
    });
  }

  async setTextWithCursors(textWithCursors) {
    const {text, selection} = parseTextWithCursors(textWithCursors);
    await this._page.evaluate((text, selection) => {
      editor.reset(text, selection);
    }, text, selection);
    await this.waitUntilIdle();
  }

  async type(text) {
    await this._page.keyboard.type(text);
    await this.waitUntilIdle();
  }

  /**
   * @param {string} name shortcut name in the same format we use for renderer's keymaps.
   */
  async shortcut(descriptor) {
    let tokens = descriptor.split('-');
    let ctrlOrCmd = !!tokens.find(token => token.toUpperCase() === 'CMD/CTRL');
    let ctrl = !!tokens.find(token => token.toUpperCase() === 'CTRL') || (ctrlOrCmd && !this._isMac);
    let cmd = !!tokens.find(token => token.toUpperCase() === 'CMD') || (ctrlOrCmd && this._isMac);

    let keys = [];
    if (ctrl)
      keys.push('Control');
    if (cmd)
      keys.push('Meta');
    if (tokens.find(token => token.toUpperCase() === 'ALT'))
      keys.push('Alt');
    if (tokens.find(token => token.toUpperCase() === 'SHIFT'))
      keys.push('Shift');
    keys.push(...tokens.filter(token => token.toUpperCase() !== 'ALT' && token.toUpperCase() !== 'CTRL' && token.toUpperCase() !== 'SHIFT' && token.toUpperCase() !== 'CMD' && token.toUpperCase() !== 'CMD/CTRL'));
    for (const key of keys)
      await this._page.keyboard.down(key);
    for (const key of keys)
      await this._page.keyboard.up(key);
    await this.waitUntilIdle();
  }

  async undo() {
    await this.shortcut('Cmd/Ctrl-z');
  }

  async redo() {
    await this.shortcut('Cmd/Ctrl-Shift-z');
  }

  async softUndo() {
    await this.shortcut('Cmd/Ctrl-u');
  }

  async softRedo() {
    await this.shortcut('Cmd/Ctrl-Shift-u');
  }

  async clickText(position) {
    const point = await this._page.evaluate(position => renderer.positionToViewportPoint(position), position);
    await this._page.mouse.click(point.x, point.y);
    await this.waitUntilIdle();
  }

  async text() {
    return await this._page.evaluate(() => editor.document().text().content());
  }

  async textWithCursors() {
    return await this._page.evaluate(() => {
      let text = editor.document().text().content();
      const selection = editor.document().sortedSelection();
      for (let i = selection.length - 1; i >= 0; i--) {
        const focus = selection[i].focus;
        text = text.substring(0, focus) + '|' + text.substring(focus);
      }
      return text;
    });
  }
}

