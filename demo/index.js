import { WebEditor } from "../src/WebEditor.mjs";
import { Selection } from "../src/Selection.mjs";

const examples = [
  'shakespeare.txt',
  'jquery.min.js',
];

function addExamples() {
  const select = document.querySelector('.examples select');
  for (const example of examples) {
    const option = document.createElement('option');
    option.textContent = example;
    select.appendChild(option);
  }
  select.addEventListener('input', () => setupEditor(window.editor, select.value), false);
}

document.addEventListener('DOMContentLoaded', () => {
  addExamples();

  const editor = new WebEditor(document);
  editor.element().classList.add('editor');
  document.body.appendChild(editor.element());
  editor.resize();
  window.onresize = () => editor.resize();
  window.editor = editor;
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
