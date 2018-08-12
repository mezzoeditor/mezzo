export function addTests(runner, expect) {
  const {describe, xdescribe, fdescribe} = runner;
  const {it, fit, xit} = runner;
  const {beforeAll, beforeEach, afterAll, afterEach} = runner;

  describe('Renderer', () => {
    it('should work', async ({server, page}) => {
      console.log('nav..');
      await page.goto(server.PREFIX + '/src/web/test/renderer.html');
      console.log('click..');
      await page.click('canvas');
      console.log('type..');
      await page.keyboard.type('hello, world');
      expect(await editorText(page)).toBe('hello, world');
    });
  });
}

async function editorText(page) {
  return await page.evaluate(() => editor.document().text().content());
}
