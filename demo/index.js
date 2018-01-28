import { Decorator } from "../src/core/Decorator.mjs";
import { WebEditor } from "../src/web/WebEditor.mjs";
import { Random } from "../src/core/Random.mjs";
import { TextUtils } from "../src/utils/TextUtils.mjs";
import JSHighlighter from "../src/syntax/javascript.mjs";
import PlainHighlighter from "../src/syntax/plain.mjs";

let random = Random(17);

const examples = [
  'index.js',
  'jquery.min.js',
  'shakespeare.txt',
  'megaline.txt',
];

const jsHighlighter = new JSHighlighter();
const plainHighlighter = new PlainHighlighter();

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
  editor.onSearchUpdate((total, current) => {
    info.textContent = `${current + 1} of ${total}`;
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const editor = new WebEditor(document);
  addExamples(editor);
  addHighlights(editor);
  addSearch(editor);

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
    this._decorator = new Decorator();
    this._editor.document().addPlugin('token-highlighter', this);
  }

  onAdded(document) {
    document.addDecorator(this._decorator);
  }

  onRemoved(document) {
    document.removeDecorator(this._decorator);
  }

  setToken(token) {
    if (this._token === token)
      return;
    this._token = token;
    this._editor.invalidate();
  }

  onViewport(viewport) {
    this._decorator.clearAll();
    if (!this._token)
      return;
    for (let line of viewport.lines()) {
      let text = viewport.lineContent(line, this._token.length, this._token.length);
      let offset = Math.max(0, line.from - this._token.length);
      let index = text.indexOf(this._token);
      while (index !== -1) {
        this._decorator.add(
          offset + index,
          offset + index + this._token.length,
          ['red', 'green', 'blue'][line.line % 3]
        );
        index = text.indexOf(this._token, index + this._token.length);
      }
    }
  }
}

async function setupEditor(editor, exampleName) {
  const response = await fetch(exampleName);
  const text = await response.text();
  if (exampleName.endsWith('.js'))
    editor.setHighlighter(jsHighlighter);
  else
    editor.setHighlighter(plainHighlighter);
  if (exampleName.indexOf('jquery') !== -1)
    editor.document().reset(new Array(1000).fill(text).join(''));
  else
    editor.document().reset(text);
  //editor.document().reset('abc\nde\nabc\nde\nabc\nde\nabc\nde\nabc\nde\nabc\nde\nabc\nde\nabc\nde\nabc\nde\nabc\nde\nabc\nde\nabc\nde\nabc\nde\nabc\nde\nabc\nde\nabc\nde\nabc\nde\nabc\nde\nabc\nde\nabc\nde\nabc\nde\nabc\nde\nabc\nde\nabc\nde\n');
  //editor.document().reset('abc\nabc\nabc\nabc\n');
  //editor.document().reset('abc\nxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx\nabc');
  editor.focus();

  let ranges = [];
  for (let i = 0; i < 20; i++) {
    let offset = editor.document().positionToOffset({line: 4 * i, column: 3}, true /* clamp */);
    ranges.push({from: offset, to: offset});
  }
  //let ranges = [{from: 0, to: 0}, {from: 9, to: 9}];
  editor.selection().setRanges(ranges);
}
