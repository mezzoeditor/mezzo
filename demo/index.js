import { WebEditor } from "../src/WebEditor.mjs";
import { Selection } from "../src/Selection.mjs";
import { Random } from "../src/Types.mjs";
let random = Random(17);

const examples = [
  'shakespeare.txt',
  'jquery.min.js',
];

function addExamples() {
  const select = document.querySelector('.examples');
  for (const example of examples) {
    const option = document.createElement('option');
    option.textContent = example;
    select.appendChild(option);
  }
  select.addEventListener('input', () => setupEditor(window.editor, select.value), false);
}

function addHighlights() {
  const select = document.querySelector('.highlights');
  for (const highlight of ['the', 'e', '(']) {
    if (!window.highlight)
      window.highlight = highlight;
    const option = document.createElement('option');
    option.textContent = highlight;
    select.appendChild(option);
  }
  select.addEventListener('input', () => {
    window.highlight = select.value;
    window.editor.invalidate();
  }, false);
}

document.addEventListener('DOMContentLoaded', () => {
  addExamples();
  addHighlights();

  const editor = new WebEditor(document);
  editor.element().classList.add('editor');
  document.body.appendChild(editor.element());
  editor.resize();
  window.onresize = () => editor.resize();
  window.editor = editor;

  editor.addViewportBuilder(viewport => {
    for (let line = viewport.range().from.lineNumber; line < viewport.range().to.lineNumber; line++) {
      let text = viewport.lineChunk(line, viewport.range().from.columnNumber, viewport.range().to.columnNumber);
      let index = text.indexOf(window.highlight);
      while (index !== -1) {
        let from = index;
        let to = index + window.highlight.length;
        let name = 'background';
        let value = ['rgba(0, 0, 255, 0.2)', 'rgba(0, 255, 0, 0.2)', 'rgba(255, 0, 0, 0.2)'][line % 3];
        viewport.addDecorations([
            {lineNumber: line, from, to, name: 'background', value: value},
            {lineNumber: line, from, to, name: 'underline', value: 'rgb(50, 50, 50)'},
          ]);
        index = text.indexOf(window.highlight, index + window.highlight.length);
      }
    }
  });

  setupEditor(editor, examples[0]);
});

async function setupEditor(editor, exampleName) {
  const response = await fetch(exampleName);
  const text = await response.text();
  editor.setText(text);
  editor.focus();

  let selections = [];
  for (let i = 0; i < 20; i++) {
    let selection = new Selection();
    selection.setCaret({lineNumber: 4 * i, columnNumber: 3});
    selections.push(selection);
  }
  editor.setSelections(selections);
}
