import { KeymapHandler } from '../src/web/KeymapHandler.mjs';

import { FileSystem } from './FileSystem.mjs';
import { SplitComponent } from './SplitComponent.mjs';
import { SidebarComponent } from './SidebarComponent.mjs';
import { EditorComponent } from './EditorComponent.mjs';
import { StatusbarComponent } from './StatusbarComponent.mjs';
import { TabStripComponent } from './TabStripComponent.mjs';
import { FileFilterItem, FilterDialogComponent } from './FilterDialogComponent.mjs';

window.fs = new FileSystem();

if (window._bindingInitialDirectory)
  window.fs.initialize(window._bindingInitialDirectory);

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

  const filterDialog = new FilterDialogComponent();

  /** @type {!Map<string, !Editor>} */
  let editors = new Map();
  sidebar.setSelectedCallback(async path => {
    if (!tabstrip.hasTab(path))
      tabstrip.addTab(path, window.fs.fileName(path));
    tabstrip.selectTab(path);
  });
  tabstrip.setSelectedCallback(async path => {
    // No tab is selected (all tabs got closed).
    if (!path) {
      renderer.setEditor(null);
      statusbar.rightElement().textContent = '';
      return;
    }
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

  const keymapHandler = new KeymapHandler();
  keymapHandler.addKeymap({
    'Cmd/Ctrl-s': 'save',
    'Cmd/Ctrl-p': 'open-file',
    'Cmd/Ctrl-w': 'close-tab',
    'Cmd/Ctrl-,': 'ignore',
  }, command => {
    if (command === 'close-tab') {
      let path = tabstrip.selectedTab();
      tabstrip.closeTab(path);
      return true;
    } else if (command === 'open-file') {
      if (filterDialog.isVisible()) {
        filterDialog.setVisible(false);
      } else {
        const callback = path => {
          if (!tabstrip.hasTab(path))
            tabstrip.addTab(path, window.fs.fileName(path));
          tabstrip.selectTab(path);
        };
        const items = [];
        for (const root of window.fs.roots()) {
          const relPaths = [];
          relPaths.push(...window.fs.relativeRootPaths(root));
          items.push(...relPaths.map(path => new FileFilterItem(root, path, callback)));
        }
        filterDialog.setItems(items);
        filterDialog.setVisible(true);
        filterDialog.setQuery('');
      }
      return true;
    } else if (command === 'save') {
      let path = tabstrip.selectedTab();
      let editor = editors.get(path);
      if (!editor)
        return false;
      window.fs.saveFile(path, editor.document().content());
      return true;
    } else if (command === 'ignore') {
      return true;
    }
    return false;
  });

  document.addEventListener('keydown', (event) => {
    if (keymapHandler.handleKeyDown(event)) {
      event.stopPropagation();
      event.preventDefault();
    }
  }, false);
});

