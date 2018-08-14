export function addTests(runner, expect) {
  const {describe, xdescribe, fdescribe} = runner;
  const {it, fit, xit} = runner;
  const {beforeAll, beforeEach, afterAll, afterEach} = runner;

  describe('Renderer', () => {
    it('should work', async ({server, page}) => {
      await page.goto(server.PREFIX + '/src/web/test/renderer.html');
      await page.click('canvas');
      await page.keyboard.type('hello, world');
      expect(await editorText(page)).toBe('hello, world');
    });
  });
}

async function editorText(page) {
  return await page.evaluate(() => editor.document().text().content());
}
