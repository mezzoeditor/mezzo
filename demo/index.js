import { WebEditor } from "../src/api/WebEditor.mjs";
import { Selection } from "../src/plugins/Selection.mjs";
import { Random } from "../src/core/Random.mjs";
import { TextUtils } from "../src/utils/TextUtils.mjs";
let random = Random(17);

const examples = [
  'shakespeare.txt',
  'jquery.min.js',
  'megaline.txt',
];

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
  const highlights = ['the', 'e', '(', ''];
  for (const highlight of highlights) {
    const option = document.createElement('option');
    option.textContent = highlight;
    select.appendChild(option);
  }
  tokenHighlighter.setToken(highlights[0]);
  select.addEventListener('input', () => tokenHighlighter.setToken(select.value), false);
}

document.addEventListener('DOMContentLoaded', () => {
  const editor = new WebEditor(document);
  addExamples(editor);
  addHighlights(editor);

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
    this._editor.addPlugin('token-highlighter', this);
  }

  setToken(token) {
    if (this._token === token)
      return;
    this._token = token;
    this._editor.invalidate();
  }

  onViewport(viewport) {
    if (!this._token)
      return;
    let start = viewport.start();
    let end = viewport.end();
    let from = start.column - this._token.length;
    if (from < 0)
      from = 0;
    let to = end.column + this._token.length;
    const toLine = Math.min(this._editor.editor().lineCount(), end.line);
    for (let line = start.line; line < toLine; line++) {
      let text = TextUtils.lineChunk(this._editor.editor(), line, from, to);
      let index = text.indexOf(this._token);
      while (index !== -1) {
        viewport.addDecoration(
          {line, column: from + index},
          {line, column: from + index + this._token.length},
          ['red', 'green', 'blue'][line % 3]
        );
        index = text.indexOf(this._token, index + this._token.length);
      }
    }
  }
}

async function setupEditor(editor, exampleName) {
  const response = await fetch(exampleName);
  const text = await response.text();
  editor.editor().reset(text);
  //editor.editor().reset('abc\nde\nabc\nde\nabc\nde\nabc\nde\nabc\nde\nabc\nde\nabc\nde\nabc\nde\nabc\nde\nabc\nde\nabc\nde\nabc\nde\nabc\nde\nabc\nde\nabc\nde\nabc\nde\nabc\nde\nabc\nde\nabc\nde\nabc\nde\nabc\nde\nabc\nde\nabc\nde\nabc\nde\n');
  //editor.editor().reset('abc\n\ndef\n');
  //editor.editor().reset('abc\nxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx\nabc');
  editor.focus();

  let ranges = [];
  for (let i = 0; i < 20; i++) {
    let range = new Selection.Range();
    range.setCaret(editor.editor().positionToOffset({line: 4 * i, column: 3}, true /* clamp */));
    ranges.push(range);
  }
  editor.selection().setRanges(ranges);
}
