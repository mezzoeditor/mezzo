import {GG} from '../test/webutils.js';

export function addTests(runner, expect) {
  const {describe, xdescribe, fdescribe} = runner;
  const {it, fit, xit} = runner;
  const {beforeAll, beforeEach, afterAll, afterEach} = runner;

  describe('Standalone', () => {
    beforeEach(async state => {
      const url = state.server.PREFIX + '/mezzo/test/index.html';
      state.gg = await GG.create(state.server, state.page, url);
    });
    afterEach(async state => {
      state.gg = null;
    });

    it('should scroll when revealing with addNext', async ({gg}) => {
      await gg.setTextWithCursors('|FOO' + '\n'.repeat(1000) + 'FOO');
      expect(await gg.evaluate(() => renderer.scrollTop())).toBe(0);
      await gg.shortcut('Cmd/Ctrl-d');
      await gg.shortcut('Cmd/Ctrl-d');
      expect(await gg.evaluate(() => renderer.scrollTop())).not.toBe(0);
    });
  });
}
