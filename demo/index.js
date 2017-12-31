import { WebEditor } from "../src/web/WebEditor.mjs";
import { Random } from "../src/core/Random.mjs";
import { TextUtils } from "../src/utils/TextUtils.mjs";
import JSHighlighter from "../src/syntax/javascript.mjs";
import PlainHighlighter from "../src/syntax/plain.mjs";

let random = Random(17);

const examples = [
  'shakespeare.txt',
  'jquery.min.js',
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
  const highlights = ['the', 'e', 'The', '(', ''];
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
    const fromColumn = viewport.startColumn() - Math.min(viewport.startColumn(), this._token.length);
    const toColumn = viewport.startColumn() + viewport.width() + this._token.length;
    for (let i = viewport.startLine(); i < viewport.endLine(); ++i) {
      const text = TextUtils.lineChunk(viewport.document(), i, fromColumn, toColumn);
      let index = text.indexOf(this._token);
      while (index !== -1) {
        const from = viewport.document().positionToOffset({
          line: i,
          column: fromColumn + index
        });
        const to = viewport.document().positionToOffset({
          line: i,
          column: fromColumn + index + this._token.length
        });
        viewport.addDecoration(
          from,
          to,
          ['red', 'green', 'blue'][i % 3]
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
