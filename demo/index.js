import { Start } from "../src/core/Anchor.mjs";
import { TextDecorator } from "../src/core/Decorator.mjs";
import { Renderer } from "../src/web/Renderer.mjs";
import { Editor } from "../src/editor/Editor.mjs";
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
let rangeHandle;

function addExamples(renderer) {
  const select = document.querySelector('.examples');
  for (const example of examples) {
    const option = document.createElement('option');
    option.textContent = example;
    select.appendChild(option);
  }
  select.addEventListener('input', () => setupEditor(renderer, select.value), false);
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

function addSearch(renderer) {
  const editor = renderer.editor();
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
        editor.search().previousMatch();
      else
        editor.search().nextMatch();
      event.preventDefault();
      event.stopPropagation();
    } else if (event.key === 'Escape') {
      editor.findCancel();
      renderer.focus();
      input.value = '';
      event.preventDefault();
      event.stopPropagation();
    }
  }, false);
  document.querySelector('.next').addEventListener('click', event => {
    editor.search().nextMatch();
  }, false);
  document.querySelector('.prev').addEventListener('click', event => {
    editor.search().previousMatch();
  }, false);
  const info = document.querySelector('.search-info');
  editor.search().on('updated', ({currentIndex, totalCount}) => {
    if (currentIndex === -1)
      info.textContent = `${totalCount} matches`;
    else
      info.textContent = `${currentIndex + 1} of ${totalCount} matches`;
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

function addRangeHandle(editor) {
  const rangeText = document.querySelector('.range');
  rangeText.addEventListener('click', updateRangeHandle.bind(null, editor));
  editor.viewport().addDecorationCallback(() => {
    if (!rangeHandle || rangeHandle.removed())
      return {};
    let decorator = new TextDecorator();
    let {from, to} = rangeHandle.resolve();
    decorator.add(Start(from.offset), Start(to.offset), 'the-range');
    return {background: [decorator]};
  });
}

function updateRangeHandle(editor) {
  if (!rangeHandle)
    return;
  const rangeText = document.querySelector('.range');
  if (rangeHandle.removed()) {
    rangeText.textContent = 'Range removed';
  } else {
    const {from, to} = rangeHandle.resolve();
    let fromPosition = editor.document().offsetToPosition(from.offset);
    let toPosition = editor.document().offsetToPosition(to.offset);
    rangeText.textContent = `Range {${from.offset}/${fromPosition.line},${fromPosition.column}} : {${to.offset}/${toPosition.line},${toPosition.column}}`;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const renderer = new Renderer(document);
  const editor = new Editor(renderer.measurer());
  renderer.setEditor(editor);
  addExamples(renderer);
  addHighlights(editor);
  addSearch(renderer);
  document.querySelector('.ismonospace').addEventListener('change', event => {
    renderer.setUseMonospaceFont(event.target.checked);
  }, false);
  addRangeHandle(editor);

  renderer.element().classList.add('editor');
  document.body.appendChild(renderer.element());
  renderer.resize();
  window.onresize = () => renderer.resize();
  window.editor = renderer;

  setupEditor(renderer, examples[0]);
});

class TokenHighlighter {
  constructor(editor) {
    this._editor = editor;
    this._token = '';
    this._editor.addDecorationCallback(this._onDecorate.bind(this));
  }

  setToken(token) {
    if (this._token === token)
      return;
    this._token = token;
    this._editor.invalidate();
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
          Start(offset + index),
          Start(offset + index + this._token.length),
          ['red', 'green', 'blue'][(offset + index) % 3]
        );
        index = text.indexOf(this._token, index + this._token.length);
      }
    }
    return {background: [decorator]};
  }
}

async function setupEditor(renderer, exampleName) {
  const editor = renderer.editor();
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
  renderer.focus();

  let ranges = [];
  for (let i = 0; i < 20; i++) {
    let offset = editor.document().positionToOffset({line: 4 * i, column: 3});
    ranges.push({from: offset, to: offset});
  }
  //let ranges = [{from: 0, to: 0}, {from: 9, to: 9}];
  editor.selection().setRanges(ranges);

  rangeHandle = editor.addHandle(Start(20), Start(40), updateRangeHandle);
  updateRangeHandle(editor);
}
