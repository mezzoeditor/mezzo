import { FileSystem } from './FileSystem.mjs';
import { SplitComponent } from './SplitComponent.mjs';
import { SidebarComponent } from './SidebarComponent.mjs';
import { EditorComponent } from './EditorComponent.mjs';
import { StatusbarComponent } from './StatusbarComponent.mjs';

window.fs = new FileSystem();

(() => {
  const params = new URLSearchParams(location.search);
  for (const entry of params) {
    if (entry[0] === 'folder') {
      window.fs.initialize(entry[1]);
      return;
    }
  }
})();

window.addEventListener('DOMContentLoaded', () => {
  const split = new SplitComponent();
  const sidebar = new SidebarComponent(window.fs);
  const editor = new EditorComponent();
  split.leftElement().appendChild(sidebar);
  split.rightElement().appendChild(editor);
  document.body.appendChild(split);

  const statusbar = new StatusbarComponent();
  statusbar.leftElement().appendChild(editor.selectionDescriptionElement());
  statusbar.rightElement().textContent = editor.mimeType();
  document.body.appendChild(statusbar);

  let selectedFile = '';
  sidebar.setSelectedCallback(async path => {
    if (selectedFile === path)
      return;
    selectedFile = path;
    const content = await window.fs.readFile(path);
    editor.setText(content);
    editor.setMimeType(window.fs.mimeType(path));
    statusbar.rightElement().textContent = editor.mimeType();
  });

  document.addEventListener('keydown', (event) => {
    if (!selectedFile)
      return;
    if (event.key === 's' && event.metaKey) {
      window.fs.saveFile(selectedFile, editor.text());
      event.stopPropagation();
      event.preventDefault();
    }
  });
});
