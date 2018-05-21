#!/usr/bin/env node
const pptr = require('puppeteer');
const path = require('path');
const util = require('util');
const http = require('http');
const url = require('url');
const fs = require('fs');
const readFileAsync = util.promisify(fs.readFile);
const writeFileAsync = util.promisify(fs.writeFile);

const chokidar = require('chokidar');

const mimeTypes = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.json': 'application/json',
  '.css': 'text/css',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

(async() => {
  const port = 4321;
  const server = createServer(port, path.join(__dirname));
  const workingFolder = process.argv.length < 3 ? path.resolve('.') : path.resolve(process.argv[2]);
  const browserPromise = pptr.launch({
    appMode: true,
    userDataDir: path.join(__dirname, '.embedder_profile'),
    handleSIGINT: false,
    args: [
      '--allow-file-access-from-files',
      `--app=http://localhost:${port}/embedder/main.html`
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
  // On initial run, there's a race between app being loaded by chrome
  // and embedder bindings initialization.
  // Instead of serializing the race (and slowing down initial load),
  // we handle both race outcomes here.
  await page.evaluateOnNewDocument(dir => window._bindingInitialDirectory = dir, workingFolder);
  await page.evaluate(dir => {
    // Initialize filesystem right away if it is already defined.
    if (window.fs)
      window.fs.initialize(dir);
    else
      window._bindingInitialDirectory = dir;
  }, workingFolder);
  page.bringToFront();
})();

/**
 * @param {number} port
 * @param {string} folderPath
 */
function createServer(port, folderPath) {
  folderPath = path.resolve(folderPath);
  return http.createServer(function (req, res) {
    // parse URL
    const parsedUrl = url.parse(req.url);
    let pathname = path.resolve(folderPath, '.' + parsedUrl.pathname);
    if (!pathname.startsWith(folderPath)) {
      // if the file is not found, return 404
      res.statusCode = 404;
      res.end(`File ${pathname} not found!`);
      return;
    }
    const ext = path.parse(pathname).ext;

    fs.exists(path.join(pathname), function (exist) {
      if(!exist) {
        // if the file is not found, return 404
        res.statusCode = 404;
        res.end(`File ${pathname} not found!`);
        return;
      }

      // if is a directory search for index file matching the extention
      if (fs.statSync(pathname).isDirectory()) pathname += '/index' + ext;

      // read file from file system
      fs.readFile(pathname, function(err, data){
        if(err){
          res.statusCode = 500;
          res.end(`Error getting the file: ${err}.`);
        } else {
          // if the file is found, set Content-type and send data
          res.setHeader('Content-type', mimeTypes[ext] || 'text/plain' );
          res.end(data);
        }
      });
    });
  }).listen(port);
}
