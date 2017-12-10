import { WebEditor } from "../src/WebEditor.mjs";
import { Selection } from "../src/Selection.mjs";
import { Random } from "../src/Types.mjs";
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
  const highlights = ['the', 'e', '('];
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
    this._viewportBuilder = this._viewportBuilder.bind(this);
  }

  setToken(token) {
    if (this._token === token)
      return;
    this._token = token;
    if (token)
      this._editor.addViewportBuilder(this._viewportBuilder);
    else
      this._editor.removeViewportBuilder(this._viewportBuilder);
  }

  _viewportBuilder(viewport, viewportStart, viewportEnd) {
    if (!this._token)
      return;
    let from = viewportStart.columnNumber - this._token.length;
    if (from < 0)
      from = 0;
    let to = viewportEnd.columnNumber + this._token.length;
    const toLine = Math.min(viewport.lineCount(), viewportEnd.lineNumber);
    for (let line = viewportStart.lineNumber; line < toLine; line++) {
      let text = viewport.lineChunk(line, from, to);
      let index = text.indexOf(this._token);
      while (index !== -1) {
        let value = ['rgba(0, 0, 255, 0.2)', 'rgba(0, 255, 0, 0.2)', 'rgba(255, 0, 0, 0.2)'][line % 3];
        viewport.addDecorations([
            {lineNumber: line, from: from + index, to: from + index + this._token.length, name: 'background', value: value},
            {lineNumber: line, from: from + index, to: from + index + this._token.length, name: 'underline', value: 'rgb(50, 50, 50)'},
          ]);
        index = text.indexOf(this._token, index + this._token.length);
      }
    }
  }
}

async function setupEditor(editor, exampleName) {
  const response = await fetch(exampleName);
  const text = await response.text();
  editor.setText(text);
  editor.focus();

  let selections = [];
  for (let i = 0; i < 20; i++) {
    let selection = new Selection();
    selection.setCaret(editor.positionToOffset({lineNumber: 4 * i, columnNumber: 3}, true /* clamp */));
    selections.push(selection);
  }
  editor.setSelections(selections);
}
