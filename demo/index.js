import { WebEditor } from "../src/WebEditor.mjs";
import { Selection } from "../src/Selection.mjs";

const editor = new WebEditor(document);
document.body.appendChild(editor.element());
editor.element().style.width = '100%';
editor.element().style.height = '100%';
editor.resize();
window.onresize = () => editor.resize();
let text = [];
for (let i = 0; i < 100; i++)
  text.push('short\nlonggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggg\n');
editor.setText(text.join(''));
editor.focus();

let selections = [];
for (let i = 0; i < 20; i++) {
  let selection = new Selection();
  selection.setCaret({lineNumber: 4 * i, columnNumber: 3});
  selections.push(selection);
}
editor.setSelections(selections);
