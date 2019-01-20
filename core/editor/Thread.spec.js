import {TestPlatformSupport} from '../../test/utils.js';
import {Thread} from './Thread.js';
import {Document} from '../text/Document.js';

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
      expect(await thread.evaluate(t => !!t.platformSupport())).toBe(true);
    });
    it('should expose objects from UI to worker', async({thread}) => {
      const obj = thread.expose({
        sum: (a, b) => a + b,
      });
      expect(await thread.evaluate((t, e) => e.rpc.sum(4, 5), obj)).toBe(9);
    });
    it('should expose objects from worker to UI', async({thread}) => {
      const remoteObject = await thread.evaluate(t => t.expose({
        mult: (a, b) => a * b,
      }));
      expect(await remoteObject.rpc.mult(7, 8)).toBe(56);
    });
    it('should be able to expose, dispose, expose and dispose', async({thread}) => {
      await thread.evaluate(t => t.Q = {});
      for (let i = 0; i < 3; ++i) {
        const remote = await thread.evaluate(t => t.expose(t.Q));
        await remote.dispose();
      }
    });
    it('should throw once using disposed obj', async({thread}) => {
      let remote = await thread.evaluate(t => t.expose({}));
      await remote.dispose();
      let error = null;
      await thread.evaluate((t, obj) => void obj, remote).catch(e => error = e);
      expect(error).not.toBe(null);
    });
    it('should return multiple exposed objects', async({thread}) => {
      const [r1, r2] = await thread.evaluate(t => {
        const sum = (a, b) => a + b;
        const mult = (a, b) => a * b;
        return [t.expose({sum}), t.expose({mult})];
      });
      expect(await r1.rpc.sum(4,3)).toBe(7);
      expect(await r2.rpc.mult(4,3)).toBe(12);
    });
    it('should properly pass deeply nested exposed objects', async({thread}) => {
      const struct = await thread.evaluate(t => {
        const baz = t.expose({yo: () => 42});
        return { foo: { bar: { baz } } };
      });
      expect(await struct.foo.bar.baz.rpc.yo()).toBe(42);
    });
    it('should transfer importable classes', async({thread}) => {
      const remoteDocument = await thread.evaluate((t, Document) => {
        return t.expose(new Document());
      }, Document);
      await remoteDocument.rpc.reset('hello, world!');
      expect(await thread.evaluate((t, d) => d.text().content(), remoteDocument)).toBe('hello, world!');
    });
    it('should have proper "this" when calling rpc', async({thread}) => {
      const remoteObj = await thread.evaluate(t => t.expose({
        e: 10,
        foo: function() { return this.e; },
      }));
      expect(await remoteObj.rpc.foo()).toBe(10);
    });
    it('evaluate should forward errors', async({thread}) => {
      let error = null;
      await thread.evaluate(() => {
        throw new Error('yo!');
      }).catch(e => error = e);
      expect(error.message).toBe('yo!');
    });
    it('rpc should forward errors', async({thread}) => {
      const remote = await thread.evaluate(t => t.expose({
        foo() {
          throw new Error('yo!');
        }
      }));
      let error = null;
      await remote.rpc.foo().catch(e => error = e);
      expect(error.message).toBe('yo!');
    });
  });
}

