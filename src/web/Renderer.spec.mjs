import os from 'os';

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
    this._modifier = os.platform() === 'darwin' ? 'Meta' : 'Control';
  }

  async type(text) {
    await this._page.keyboard.type(text);
  }

  async undo() {
    await this._page.keyboard.down(this._modifier);
    await this._page.keyboard.press('KeyZ');
    await this._page.keyboard.up(this._modifier);
  }

  async redo() {
    await this._page.keyboard.down(this._modifier);
    await this._page.keyboard.down('Shift');
    await this._page.keyboard.press('KeyZ');
    await this._page.keyboard.up('Shift');
    await this._page.keyboard.up(this._modifier);
  }

  async softUndo() {
    await this._page.keyboard.down(this._modifier);
    await this._page.keyboard.press('KeyU');
    await this._page.keyboard.up(this._modifier);
  }

  async softRedo() {
    await this._page.keyboard.down(this._modifier);
    await this._page.keyboard.down('Shift');
    await this._page.keyboard.press('KeyU');
    await this._page.keyboard.up('Shift');
    await this._page.keyboard.up(this._modifier);
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

