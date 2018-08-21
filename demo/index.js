import { TextDecorator } from "../src/core/Decorator.mjs";

import { WebEmbedder } from "../webembedder/index.mjs";


import { trace } from "../src/core/Trace.mjs";
trace.setup();

const examples = [
  'index.js',
  'jquery.min.js',
  'shakespeare.txt',
  'megaline.txt',
  'megacolumn.txt',
  'unicode.txt',
  'unicode.js',
  'unicodeperf.txt',
];

document.addEventListener('DOMContentLoaded', () => {
  const embedder = new WebEmbedder(document);
  window.editor = embedder;

  document.querySelector('.ismonospace').addEventListener('change', event => {
    embedder.setUseMonospaceFont(event.target.checked);
  }, false);

  document.body.appendChild(embedder.element());
  embedder.element().classList.add('editor');

  window.onresize = () => embedder.resize();
  embedder.resize();

  addExamples(embedder);
  addHighlights(embedder);
});


function addExamples(embedder) {
  const select = document.querySelector('.examples');
  for (const example of examples) {
    const option = document.createElement('option');
    option.textContent = example;
    select.appendChild(option);
  }
  select.addEventListener('input', () => setupExample(embedder, select.value), false);
  setupExample(embedder, examples[0]);

  async function setupExample(embedder, exampleName) {
    const text = await fetch(exampleName).then(response => response.text());

    embedder.setMimeType(exampleName.endsWith('.js') ? 'text/javascript' : 'text/plain');

    if (exampleName.indexOf('jquery') !== -1)
      embedder.setText(new Array(1000).fill(text).join(''));
    else if (exampleName.indexOf('megacolumn') !== -1)
      embedder.setText(new Array(10000).fill(text).join(''));
    else if (exampleName.indexOf('unicodeperf') !== -1)
      embedder.setText(new Array(100).fill(text).join(''));
    else
      embedder.setText(text);
    embedder.focus();

    const selection = [];
    for (let i = 0; i < 20; i++) {
      const offset = embedder.document().text().positionToOffset({line: 4 * i, column: 3});
      selection.push({anchor: offset, focus: offset});
    }
    //let ranges = [{from: 0, to: 0}, {from: 9, to: 9}];
    embedder.document().setSelection(selection);
  }
}

function addHighlights(embedder) {
  const tokenHighlighter = new TokenHighlighter(embedder);

  const select = document.querySelector('.highlights');
  const highlights = ['', 'e', 'the', 'The', '('];
  for (const highlight of highlights) {
    const option = document.createElement('option');
    option.textContent = highlight;
    select.appendChild(option);
  }
  tokenHighlighter.setToken(highlights[0]);
  select.addEventListener('input', () => tokenHighlighter.setToken(select.value), false);
}

//TODO(lushnikov): make this a proper plugin
class TokenHighlighter {
  constructor(embedder) {
    this._editor = embedder.editor();
    this._token = '';
    this._editor.addDecorationCallback(this._onDecorate.bind(this));
  }

  setToken(token) {
    if (this._token === token)
      return;
    this._token = token;
    this._editor.raf();
  }

  _onDecorate(visibleContent) {
    if (!this._token)
      return [];
    let decorator = new TextDecorator();
    for (let range of visibleContent.ranges) {
      let text = range.content(this._token.length, this._token.length);
      let offset = Math.max(0, range.from - this._token.length);
      let index = text.indexOf(this._token);
      while (index !== -1) {
        decorator.add(
          offset + index,
          offset + index + this._token.length,
          ['red', 'green', 'blue'][(offset + index) % 3]
        );
        index = text.indexOf(this._token, index + this._token.length);
      }
    }
    return {background: [decorator]};
  }
}

