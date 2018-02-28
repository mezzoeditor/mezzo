import { TextDecorator } from "../src/core/Decorator.mjs";
import { WebEditor } from "../src/web/WebEditor.mjs";
import { Random } from "../src/core/Random.mjs";
import { JSHighlighter } from "../src/javascript/JSHighlighter.mjs";
import { DefaultHighlighter } from "../src/default/DefaultHighlighter.mjs";

import { trace } from "../src/core/Trace.mjs";
trace.setup();

let random = Random(17);

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

const jsHighlighter = new JSHighlighter();
const defaultHighlighter = new DefaultHighlighter();

function addExamples(editor) {
  const select = document.querySelector('.examples');
  for (const example of examples) {
    const option = document.createElement('option');
    option.textContent = example;
    select.appendChild(option);
  }
  select.addEventListener('input', () => setupEditor(editor, select.value), false);
}

function addHighlights(editor) {
  const tokenHighlighter = new TokenHighlighter(editor);

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

function addSearch(editor) {
  const input = document.querySelector('.search');
  input.addEventListener('input', event => {
    if (!input.value)
      editor.findCancel();
    else
      editor.find(input.value);
  }, false);
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      if (event.shiftKey)
        editor.findPrevious();
      else
        editor.findNext();
      event.preventDefault();
      event.stopPropagation();
    } else if (event.key === 'Escape') {
      editor.findCancel();
      editor.focus();
      input.value = '';
      event.preventDefault();
      event.stopPropagation();
    }
  }, false);
  document.querySelector('.next').addEventListener('click', event => {
    editor.findNext();
  }, false);
  document.querySelector('.prev').addEventListener('click', event => {
    editor.findPrevious();
  }, false);
  const info = document.querySelector('.search-info');
  editor.onSearchUpdate((current, total) => {
    if (current === -1)
      info.textContent = `${total} matches`;
    else
      info.textContent = `${current + 1} of ${total} matches`;
  });

  const isMac = navigator.platform.toUpperCase().indexOf('MAC') !== -1;

  document.addEventListener('keydown', event => {
    let isSearchTriggered = (isMac ? event.metaKey : event.ctrlKey) && event.key === 'f';
    if (isSearchTriggered) {
      input.focus();
      event.preventDefault();
      event.stopPropagation();
    }
  }, true);
}

document.addEventListener('DOMContentLoaded', () => {
  const editor = new WebEditor(document);
  addExamples(editor);
  addHighlights(editor);
  addSearch(editor);
  document.querySelector('.ismonospace').addEventListener('change', event => {
    editor.setUseMonospaceFont(event.target.checked);
  }, false);

  editor.element().classList.add('editor');
  document.body.appendChild(editor.element());
  editor.resize();
  window.onresize = () => editor.resize();
  window.editor = editor;

  setupEditor(editor, examples[0]);
});

class TokenHighlighter {
  constructor(editor) {
    this._editor = editor;
    this._token = '';
    this._editor.addFrameDecorationCallback(this._onFrame.bind(this));
  }

  setToken(token) {
    if (this._token === token)
      return;
    this._token = token;
    this._editor.invalidate();
  }

  _onFrame(frame) {
    if (!this._token)
      return [];
    let decorator = new TextDecorator();
    for (let range of frame.ranges()) {
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

async function setupEditor(editor, exampleName) {
  const response = await fetch(exampleName);
  const text = await response.text();

  const highlighter = exampleName.endsWith('.js') ? jsHighlighter : defaultHighlighter;
  editor.setHighlighter(highlighter);

  if (exampleName.indexOf('jquery') !== -1)
    editor.reset(new Array(1000).fill(text).join(''));
  else if (exampleName.indexOf('megacolumn') !== -1)
    editor.reset(new Array(10000).fill(text).join(''));
  else if (exampleName.indexOf('unicodeperf') !== -1)
    editor.reset(new Array(100).fill(text).join(''));
  else
    editor.reset(text);
  //editor.reset('abc\nde\nabc\nde\nabc\nde\nabc\nde\nabc\nde\nabc\nde\nabc\nde\nabc\nde\nabc\nde\nabc\nde\nabc\nde\nabc\nde\nabc\nde\nabc\nde\nabc\nde\nabc\nde\nabc\nde\nabc\nde\nabc\nde\nabc\nde\nabc\nde\nabc\nde\nabc\nde\nabc\nde\n');
  //editor.reset('abc\nabc\nabc\nabc\n');
  //editor.reset('abc\nxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx\nabc');
  editor.focus();

  let ranges = [];
  for (let i = 0; i < 20; i++) {
    let offset = editor.document().positionToOffset({line: 4 * i, column: 3});
    ranges.push({from: offset, to: offset});
  }
  //let ranges = [{from: 0, to: 0}, {from: 9, to: 9}];
  editor.selection().setRanges(ranges);
}
