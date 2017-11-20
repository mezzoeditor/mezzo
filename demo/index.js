import { Editor } from "../src/Editor.mjs";
import { Cursor } from "../src/Cursor.mjs";

const editor = new Editor(document);
document.body.appendChild(editor.element());
editor.element().style.width = '500px';
editor.element().style.height = '400px';
editor.resize();
editor.setText('short\nlonggggggggg\nshort\nlonggggggggg\nshort\nlonggggggg');
editor.focus();

// hack:
let cursor = new Cursor({lineNumber: 2, columnNumber: 2});
editor._renderer.invalidate(editor._text.addCursor(cursor));
cursor = new Cursor({lineNumber: 4, columnNumber: 4});
editor._renderer.invalidate(editor._text.addCursor(cursor));
