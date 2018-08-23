import os from 'os';
import {parseTextWithCursors} from '../editor/utils.spec.mjs';

export function addTests(runner, expect) {
  const {describe, xdescribe, fdescribe} = runner;
  const {it, fit, xit} = runner;
  const {beforeAll, beforeEach, afterAll, afterEach} = runner;

  describe('Renderer', () => {
    beforeEach(async state => {
      state.gg = await GG.create(state.server, state.page);
    });
    afterEach(async state => {
      state.gg = null;
    });

    describe('History', () => {
      it('undo/redo should work', async ({gg}) => {
        await gg.type('hello, world');
        expect(await gg.textWithCursors()).toBe('hello, world|');
        await gg.undo();
        expect(await gg.textWithCursors()).toBe('hello,|');
        await gg.redo();
        expect(await gg.textWithCursors()).toBe('hello, world|');
      });
      it('softUndo/softRedo should work', async ({gg}) => {
        await gg.type('hello, world');
        await gg.clickText({line: 0, column: 4});
        await gg.clickText({line: 0, column: 10});
        expect(await gg.textWithCursors()).toBe('hello, wor|ld');
        await gg.softUndo();
        expect(await gg.textWithCursors()).toBe('hell|o, world');
        await gg.softRedo();
        expect(await gg.textWithCursors()).toBe('hello, wor|ld');
      });
      it('should be able to type after initial undo', async ({gg}) => {
        for (let i = 0; i < 10; ++i)
          await gg.undo();
        await gg.type('can type');
        expect(await gg.textWithCursors()).toBe('can type|');
      });
      it('should move up and down', async({gg}) => {
        await gg.setTextWithCursors('hel|lo\nworld');
        await gg.shortcut('ArrowDown');
        expect(await gg.textWithCursors()).toBe('hello\nwor|ld');
        await gg.shortcut('ArrowUp');
        expect(await gg.textWithCursors()).toBe('hel|lo\nworld');
      });
    });
  });
}

// GG is a user. GG starts with opening editor in a given tab,
// and then silently obeys orders.
class GG {
  static async create(server, page) {
    await page.goto(server.PREFIX + '/src/web/test/renderer.html');
    await page.click('canvas');
    return new GG(page);
  }

  constructor(page) {
    this._page = page;
    this._isMac = os.platform() === 'darwin';
    this._modifier = this._isMac ? 'Meta' : 'Control';
  }

  async setTextWithCursors(textWithCursors) {
    const {text, selection} = parseTextWithCursors(textWithCursors);
    await this._page.evaluate((text, selection) => {
      editor.reset(text, selection);
    }, text, selection);
  }

  async type(text) {
    await this._page.keyboard.type(text);
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

