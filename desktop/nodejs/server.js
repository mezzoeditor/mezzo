const path = require('path');
const util = require('util');
const http = require('http');
const url = require('url');
const fs = require('fs');

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

module.exports = {createServer};
