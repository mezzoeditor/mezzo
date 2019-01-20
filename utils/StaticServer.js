import http from 'http';
import url from 'url';
import fs from 'fs';
import path from 'path';

export function url2path(url) {
  const {pathname} = new URL(url);
  return pathname.replace('/', path.sep);
}

export class StaticServer {
  /**
   * @param {string} dirPath
   * @param {number} port
   * @return {!StaticServer}
   */
  static async create(dirPath, port) {
    const server = new StaticServer(dirPath, port);
    await new Promise(x => server._server.once('listening', x));
    return server;
  }

  /**
   * @param {string} dirPath
   * @param {number} port
   */
  constructor(dirPath, port) {
    this._server = http.createServer(this._onRequest.bind(this));
    this._server.on('connection', socket => this._onSocket(socket));
    this._server.listen(port);
    this._dirPath = dirPath;

    /** @type {!Set<!net.Socket>} */
    this._sockets = new Set();
  }

  _onSocket(socket) {
    this._sockets.add(socket);
    // ECONNRESET is a legit error given
    // that tab closing simply kills process.
    socket.on('error', error => {
      if (error.code !== 'ECONNRESET')
        throw error;
    });
    socket.once('close', () => this._sockets.delete(socket));
  }

  async stop() {
    for (const socket of this._sockets)
      socket.destroy();
    this._sockets.clear();
    await new Promise(x => this._server.close(x));
  }

  _onRequest(request, response) {
    request.on('error', error => {
      if (error.code === 'ECONNRESET')
        response.end();
      else
        throw error;
    });
    let pathName = url.parse(request.url).path;
    if (pathName.endsWith('/'))
      pathName += 'index.html';

    const filePath = path.resolve(path.join(this._dirPath, pathName.substring(1)));
    if (!filePath.startsWith(this._dirPath)) {
      response.statusCode = 403;
      response.end(`Forbidden: requesting outside of served directory: ${this._dirPath}`);
      return;
    }
    response.setHeader('Cache-Control', 'no-cache, no-store');

    fs.readFile(filePath, function(err, data) {
      if (err) {
        response.statusCode = 404;
        response.end(`File not found: ${filePath}`);
        return;
      }
      const extname = String(path.extname(filePath)).toLowerCase();
      const mimeTypes = {
          '.html': 'text/html',
          '.js': 'text/javascript',
          '.mjs': 'text/javascript',
          '.css': 'text/css',
          '.json': 'application/json',
          '.png': 'image/png',
          '.jpg': 'image/jpg',
          '.gif': 'image/gif',
          '.wav': 'audio/wav',
          '.mp4': 'video/mp4',
          '.woff': 'application/font-woff',
          '.ttf': 'application/font-ttf',
          '.eot': 'application/vnd.ms-fontobject',
          '.otf': 'application/font-otf',
          '.svg': 'application/image/svg+xml'
      };
      response.setHeader('Content-Type', mimeTypes[extname] || 'application/octet-stream');
      response.end(data);
    });
  }
}
