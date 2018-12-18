import { KeymapHandler } from '../core/web/KeymapHandler.mjs';
import { Thread } from '../core/editor/Thread.mjs';
import { WebPlatformSupport } from '../core/web/WebPlatformSupport.mjs';

import { FileSystem } from './FileSystem.mjs';
import { SplitComponent } from './SplitComponent.mjs';
import { SidebarComponent } from './SidebarComponent.mjs';
import { EditorComponent } from './EditorComponent.mjs';
import { StatusbarComponent } from './StatusbarComponent.mjs';
import { TabStripComponent } from './TabStripComponent.mjs';
import { FileFilterItem, GoToLineItem, FilterDialogComponent } from './FilterDialogComponent.mjs';

window.fs = new FileSystem();

if (window._bindingInitialDirectory)
  window.fs.initialize(window._bindingInitialDirectory);

window.addEventListener('DOMContentLoaded', async () => {
  document.body.classList.add('vbox');

  const split = new SplitComponent();
  document.body.appendChild(split);

  const sidebar = new SidebarComponent(window.fs);
  split.leftElement().appendChild(sidebar);

  const tabstrip = new TabStripComponent();
  split.rightElement().appendChild(tabstrip);

  const renderer = new EditorComponent();
  const thread = await Thread.create(WebPlatformSupport.instance());
  split.rightElement().appendChild(renderer);

  const stubMessage = createStubMessage();
  split.rightElement().appendChild(stubMessage);

  const statusbar = new StatusbarComponent();
  statusbar.leftElement().appendChild(renderer.selectionDescriptionElement());
  statusbar.rightElement().textContent = '';
  document.body.appendChild(statusbar);

  const filterDialog = new FilterDialogComponent();

  /** @type {!Map<string, !Editor>} */
  let editors = new Map();
  sidebar.setSelectedCallback(async path => {
    if (!tabstrip.hasTab(path))
      tabstrip.addTab(path);
    tabstrip.selectTab(path);
  });
  tabstrip.setSelectedCallback(async path => {
    // No tab is selected (all tabs got closed).
    if (!path) {
      renderer.setEditor(null);
      split.rightElement().appendChild(stubMessage);
      statusbar.rightElement().textContent = '';
      return;
    }
    stubMessage.remove();
    let mimeType = window.fs.mimeType(path);
    let editor = editors.get(path);
    if (!editor) {
      editor = await renderer.createEditor(mimeType, thread);
      editors.set(path, editor);
      const content = await window.fs.readFile(path);
      editor.reset(content, [{focus: 0, anchor: 0}]);
      markClean(editor);
      editor.document().on('changed', () => tabstrip.setTabDirtyIcon(path, !isClean(editor)));
    }
    renderer.setEditor(editor);
    const lastCursor = editor.document().lastCursor();
    editor.revealOffset(lastCursor ? lastCursor.focus : 0);
    renderer.focus();
    statusbar.rightElement().textContent = mimeType;
    tabstrip.setTabDirtyIcon(path, !isClean(editor));
  });
  tabstrip.restoreTabs();

  const keymapHandler = new KeymapHandler();
  keymapHandler.addKeymap({
    'Cmd/Ctrl-s': 'save',
    'Cmd/Ctrl-p': 'open-file',
    'Cmd/Ctrl-w': 'close-tab',
    'Cmd/Ctrl-,': 'ignore',
    'Cmd/Ctrl-f': 'ignore',
    'Cmd/Ctrl-n': 'ignore',
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
            tabstrip.addTab(path);
          tabstrip.selectTab(path);
        };
        const items = [];
        for (const root of window.fs.roots()) {
          const relPaths = [];
          relPaths.push(...window.fs.relativeRootPaths(root));
          items.push(...relPaths.map(path => new FileFilterItem(root, path, callback)));
        }
        const itemProviders = [];
        let path = tabstrip.selectedTab();
        let editor = editors.get(path);
        if (editor) {
          const gotoLineCallback = line => {
            const offset = editor.document().text().positionToOffset({line, column: 0});
            editor.document().setSelection([{focus: offset, anchor: offset}]);
            editor.revealOffset(offset);
            renderer.focus();
          };
          itemProviders.push({
            fuzzySearch: false,
            regex: /^:\d+$/,
            items: query => [new GoToLineItem(query, gotoLineCallback)]
          });
        }
        // Adding default.
        itemProviders.push({
          fuzzySearch: true,
          items: query => items,
        });
        filterDialog.setItemProviders(itemProviders);
        filterDialog.setVisible(true);
        filterDialog.setQuery('');
      }
      return true;
    } else if (command === 'save') {
      let path = tabstrip.selectedTab();
      let editor = editors.get(path);
      if (!editor)
        return false;
      window.fs.saveFile(path, editor.document().text().content());
      markClean(editor);
      tabstrip.setTabDirtyIcon(path, false);
      return true;
    } else if (command === 'ignore') {
      return true;
    }
    return false;
  });

  document.addEventListener('keydown', event => keymapHandler.handleKeyDown(event), false);

  function createStubMessage() {
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') !== -1;
    const stubMessage = document.createElement('stub-message');
    stubMessage.textContent = `Hit ${isMac ? '⌘' : 'Ctrl'}-P to open files.`;
    return stubMessage;
  }

  const cleanSymbol = Symbol('editor.cleangeneration');
  function markClean(editor) {
    editor[cleanSymbol] = editor.document().generation();
  }

  function isClean(editor) {
    return editor[cleanSymbol] === editor.document().generation();
  }
});

