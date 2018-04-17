import { FileSystem } from './FileSystem.mjs';
import { SplitComponent } from './SplitComponent.mjs';
import { SidebarComponent } from './SidebarComponent.mjs';
import { EditorComponent } from './EditorComponent.mjs';
import { StatusbarComponent } from './StatusbarComponent.mjs';
import { TabStripComponent } from './TabStripComponent.mjs';

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
  document.body.classList.add('vbox');

  const split = new SplitComponent();
  document.body.appendChild(split);

  const sidebar = new SidebarComponent(window.fs);
  split.leftElement().appendChild(sidebar);

  const tabstrip = new TabStripComponent();
  split.rightElement().appendChild(tabstrip);

  const editor = new EditorComponent();
  split.rightElement().appendChild(editor);

  const statusbar = new StatusbarComponent();
  statusbar.leftElement().appendChild(editor.selectionDescriptionElement());
  statusbar.rightElement().textContent = editor.mimeType();
  document.body.appendChild(statusbar);

  let selectedFile = '';
  sidebar.setSelectedCallback(async path => {
    if (selectedFile === path)
      return;
    if (!tabstrip.hasTab(path))
      tabstrip.addTab(path, window.fs.fileName(path));
    tabstrip.selectTab(path);
  });
  tabstrip.setSelectedCallback(async path => {
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
