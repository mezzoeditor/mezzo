#!/usr/bin/env node
const pptr = require('puppeteer-core');
const findChrome = require('./find_chrome.js');
const {createServer} = require('./server.js');
const path = require('path');
const util = require('util');
const fs = require('fs');
const readFileAsync = util.promisify(fs.readFile);
const writeFileAsync = util.promisify(fs.writeFile);

const chokidar = require('chokidar');

const ROOT_PATH = path.join(__dirname, '..', '..');

(async() => {
  let foundChrome = await findChrome({channel: ['canary', 'stable']});
  if (!foundChrome) {
    console.log('ERROR: please install chrome!');
    return;
  }
  const port = 4321;
  const server = createServer(port, ROOT_PATH);
  const workingFolder = process.argv.length < 3 ? path.resolve('.') : path.resolve(process.argv[2]);
  const browserPromise = pptr.launch({
    executablePath: foundChrome.executablePath,
    pipe: true,
    headless: false,
    defaultViewport: null,
    userDataDir: path.join(ROOT_PATH, '.embedder_profile'),
    handleSIGINT: false,
    args: [
      '--enable-experimental-web-platform-features',
      '--allow-file-access-from-files',
      `--app=http://localhost:${port}/desktop/splash.html`
    ]
  });
  let browser = null;
  const watchers = new Map();
  const stopApp = async () => {
    process.removeListener('SIGINT', stopApp);
    server.close();
    for (const watcher of watchers.values())
      watcher.close();
    watchers.clear();
    // Handle SIGINT while browser's launching.
    if (browser) {
      browser.removeListener('targetdestroyed', stopApp);
      await browser.close();
    }
    process.exit(0);
  };
  process.on('SIGINT', stopApp);
  browser = await browserPromise;
  // Close app when the page is closed.
  browser.on('targetdestroyed', target => {
    // Do not close editor when DevTools window is closed.
    if (!target.url().startsWith('http://localhost'))
      return;
    stopApp();
  });

  const page = (await browser.pages())[0];
  await page.exposeFunction('_bindingReadFile', async (filePath) => {
    return await readFileAsync(filePath, 'utf8');
  });
  await page.exposeFunction('_bindingSaveFile', async (filePath, content) => {
    return await writeFileAsync(filePath, content, 'utf8');
  });
  await page.exposeFunction('_bindingInitializeFS', (watchPath, callbackName) => {
    watchPath = path.resolve(watchPath);
    console.log('Adding folder: ' + watchPath);
    let fsWatcher = watchers.get(watchPath);
    // Replace old watcher to support reload.
    if (fsWatcher)
      fsWatcher.close();
    fsWatcher = chokidar.watch(watchPath, {
      ignored: [
        /node_modules/,
        /(^|[\/\\])\../,
      ],
      persistent: true
    });
    watchers.set(watchPath, fsWatcher);
    let added = [];
    let removed = [];
    let changed = [];
    fsWatcher
      .on('add', path => { added.push(path); scheduleNotify(); })
      .on('unlink', path => { removed.push(path); scheduleNotify(); })
      .on('change', path => { changed.push(path); scheduleNotify(); })

    let notifyTimeout = 0;
    function scheduleNotify() {
      if (notifyTimeout)
        return;
      notifyTimeout = setTimeout(() => {
        notifyTimeout = 0;
        page.evaluate((callbackName, added, removed, changed) => {
          window[callbackName].call(null, added, removed, changed);
        }, callbackName, added, removed, changed);
        added = [];
        removed = [];
        changed = [];
      }, 100);
    }
  });
  await page.evaluateOnNewDocument(dir => window._bindingInitialDirectory = dir, workingFolder);
  await page.goto(`http://localhost:${port}/desktop/main.html`);
  await page.bringToFront();
})();

