#!/usr/bin/env node -r esm

import {StaticServer, url2path} from '../utils/StaticServer.js';
import path from 'path';

const dirpath = path.join(url2path(import.meta.url), '..', '..');
const port = process.argv[2];;
if (process.argv.length < 3) {
  console.error('ERROR: port must be specified.');
  process.exit(1);
}
console.log('Serving: ' + dirpath + ' on port ' + port);
StaticServer.create(dirpath, port);
