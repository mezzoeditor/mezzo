import {TestPlatformSupport} from '../../test/utils.mjs';
import {Thread} from './Thread.mjs';

export function addTests(runner, expect, options) {
  const {describe, xdescribe, fdescribe} = runner;
  const {it, fit, xit} = runner;
  const {beforeAll, beforeEach, afterAll, afterEach} = runner;

  describe('Thread', () => {
    beforeEach(async (state) => {
      state.platform = new TestPlatformSupport();
      state.thread = await Thread.create(state.platform);
    });
    afterEach(async state => {
      state.thread.dispose();
      state.platform = null;
      state.thread = null;
    });
    it('should work', async ({thread}) => {
      expect(await thread.evaluate(() => 1 + 3)).toBe(4);
    });
    it('should have top-level platformSupport', async({thread}) => {
      expect(await thread.evaluate(() => !!self.platformSupport)).toBe(true);
    });
    it('should return complex objects as handles', async({thread}) => {
      const selfHandle = await thread.evaluate(() => self);
      expect(selfHandle.constructor.name).toBe('Handle');
    });
    it('should dispose handles', async({thread}) => {
      const selfHandle = await thread.evaluate(() => self);
      await selfHandle.dispose();
      let error = null;
      await thread.evaluate(ee => void ee, selfHandle).catch(e => error = e);
      expect(error).not.toBe(null);
    });
    it('RPC should work ui -> worker', async({thread}) => {
      const rpc = await thread.createRPC();
      await thread.evaluate(rpc => {
        rpc.expose.sum = (a, b) => a + b;
      }, rpc);
      expect(await rpc.remote.sum(12, 17)).toBe(29);
    });
    it('RPC should work worker -> ui', async({thread}) => {
      const rpc = await thread.createRPC();
      rpc.expose.sum = (a, b) => a + b;
      expect(await thread.evaluate(rpc => rpc.remote.sum(12, 17), rpc)).toBe(29);
    });
  });
}

