import { Editor } from "../src/Editor.mjs";

const editor = new Editor(document);
document.body.appendChild(editor.element());
editor.element().style.width = '500px';
editor.element().style.height = '400px';
editor.resize();
editor.setText(`
  line1
  line2
    line 3
  line 4
`);
