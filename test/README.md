# Testing Overview

All tests are driven in Node.js using a [tiny testrunner](https://github.com/dgozman/editor/tree/master/utils/testrunner).

Ultimately, there are 2 test environments:
- [`test/unit.mjs`](https://github.com/dgozman/editor/blob/master/test/unit.mjs) - headless environment; these tests execute editor logic in node.js context.
  These are suitable for testing all core editor functionality up to `editor/` layer.
- [`test/webtest.mjs`](https://github.com/dgozman/editor/blob/master/test/webtest.mjs) - browser environment; these tests execute editor logic in browser
  context. These are suitable for end-to-end editor tests on the WebPlatform and use [Puppeteer](https://github.com/GoogleChrome/puppeteer/) underneath.

The rule of thumb is to always use headless environment unless web is involved.
