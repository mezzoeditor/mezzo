#!/usr/bin/env node -r esm

import {TestRunner, Reporter, Matchers} from '../utils/testrunner/index.js';
import {StaticServer, url2path} from '../utils/StaticServer.js';
import puppeteer from 'puppeteer';
import path from 'path';

const runner = new TestRunner();
const {expect} = new Matchers();
const headless = (process.env.HEADLESS || 'true').trim().toLowerCase() === 'true';
const dumpio = !!process.env.DUMPIO;
const browserOptions = { dumpio, headless};

(async () => {
  const {describe, xdescribe, fdescribe} = runner;
  const {it, fit, xit} = runner;
  const {beforeAll, beforeEach, afterAll, afterEach} = runner;

  const browser = await puppeteer.launch(browserOptions);

  beforeAll(async (state) => {
    const dirpath = path.join(url2path(import.meta.url), '..', '..');
    const port = 7770;
    state.server = await StaticServer.create(dirpath, port);
    state.server.PREFIX = `http://localhost:${port}`;
  });

  afterAll(async (state) => {
    await state.server.stop();
    state.server = null;
  });

  beforeEach(async (state) => {
    state.page = await browser.newPage();
  });

  afterEach(async (state) => {
    await state.page.close();
    state.page = null;
  });

  (await import('../core/web/Renderer.spec.js')).addTests(runner, expect);
  (await import('../mezzo/index.spec.js')).addTests(runner, expect);

  new Reporter(runner);
  await runner.run();

  await browser.close();
})();

