import { FileSystem } from './FileSystem.mjs';
import { SplitComponent } from './SplitComponent.mjs';
import { SidebarComponent } from './SidebarComponent.mjs';
import { EditorComponent } from './EditorComponent.mjs';
import { StatusbarComponent } from './StatusbarComponent.mjs';
import { TabStripComponent } from './TabStripComponent.mjs';

window.fs = new FileSystem();

/*
(() => {
  const params = new URLSearchParams(location.search);
  for (const entry of params) {
    if (entry[0] === 'folder') {
      window.fs.initialize(entry[1]);
      return;
    }
  }
})();
*/

window.addEventListener('DOMContentLoaded', () => {
  document.body.classList.add('vbox');

  const split = new SplitComponent();
  document.body.appendChild(split);

  const sidebar = new SidebarComponent(window.fs);
  split.leftElement().appendChild(sidebar);

  const tabstrip = new TabStripComponent();
  split.rightElement().appendChild(tabstrip);

  const renderer = new EditorComponent();
  split.rightElement().appendChild(renderer);

  const statusbar = new StatusbarComponent();
  statusbar.leftElement().appendChild(renderer.selectionDescriptionElement());
  statusbar.rightElement().textContent = '';
  document.body.appendChild(statusbar);

  /** @type {!Map<string, !Editor>} */
  let editors = new Map();
  sidebar.setSelectedCallback(async path => {
    if (!tabstrip.hasTab(path))
      tabstrip.addTab(path, window.fs.fileName(path));
    tabstrip.selectTab(path);
  });
  tabstrip.setSelectedCallback(async path => {
    let mimeType = window.fs.mimeType(path);
    let editor = editors.get(path);
    if (!editor) {
      editor = renderer.createEditor(mimeType);
      editors.set(path, editor);
      const content = await window.fs.readFile(path);
      editor.reset(content);
    }
    renderer.setEditor(editor);
    statusbar.rightElement().textContent = mimeType;
  });

  document.addEventListener('keydown', (event) => {
    let path = tabstrip.selectedTab();
    let editor = editors.get(path);
    if (editor && event.key === 's' && event.metaKey) {
      window.fs.saveFile(path, editor.document().content());
      event.stopPropagation();
      event.preventDefault();
    }
  });
});

