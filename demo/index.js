import { WebEditor } from "../src/WebEditor.mjs";
import { Selection } from "../src/Selection.mjs";

const editor = new WebEditor(document);
document.body.appendChild(editor.element());
editor.element().style.width = '100%';
editor.element().style.height = '100%';
editor.resize();
window.onresize = () => editor.resize();

setupEditor();

async function setupEditor() {
  const response = await fetch('shakespeare.txt');
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

  editor.addLineWidget(5, 7, null);
}
