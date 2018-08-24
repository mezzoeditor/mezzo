import {GG} from '../../test/webutils.mjs';

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
