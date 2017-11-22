import { Editor } from "../src/Editor.mjs";
import { Cursor } from "../src/Cursor.mjs";

const editor = new Editor(document);
document.body.appendChild(editor.element());
editor.element().style.width = '500px';
editor.element().style.height = '400px';
editor.resize();
let text = [];
for (let i = 0; i < 100; i++)
  text.push('short\nlonggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggg\n');
editor.setText(text.join(''));
editor.focus();

// hack:
for (let i = 0; i < 20; i++) {
  let cursor = new Cursor({lineNumber: 2 * i, columnNumber: 3});
  editor._renderer.invalidate(editor._text.addCursor(cursor));
}
