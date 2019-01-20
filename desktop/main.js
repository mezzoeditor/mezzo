import { KeymapHandler } from '../core/web/KeymapHandler.js';
import { Thread } from '../core/editor/Thread.js';
import { WebPlatformSupport } from '../core/web/WebPlatformSupport.js';

import { FileSystem } from './FileSystem.js';
import { SplitComponent } from './SplitComponent.js';
import { SidebarComponent } from './SidebarComponent.js';
import { EditorComponent } from './EditorComponent.js';
import { StatusbarComponent } from './StatusbarComponent.js';
import { TabStripComponent } from './TabStripComponent.js';
import { FileFilterItem, GoToLineItem, FilterDialogComponent } from './FilterDialogComponent.js';
import { Preferences } from './Preferences.js';

window.fs = new FileSystem();

if (window._bindingInitialDirectory)
  window.fs.addRoot(window._bindingInitialDirectory);

window.addEventListener('DOMContentLoaded', async () => {
  /** @type {!Map<string, !Editor>} */
  let editors = new Map();
  const prefs = new Preferences('application', {
    'app.tabs.opened': {
      version: 1,
      defaultValue: [],
    },
    'app.navigator.visible': {
      version: 1,
      defaultValue: true,
    },
  });

  document.body.classList.add('vbox');

  const split = new SplitComponent();
  document.body.appendChild(split);

  const tabstrip = new TabStripComponent({
    async requestTabClose(path) {
      let editor = editors.get(path);
      if (isClean(editor))
        return true;
      return confirm('File has unsaved changes. Close anyway?');
    },

    async onTabSelected(path) {
      // No tab is selected (all tabs got closed).
      if (!path) {
        renderer.setEditor(null);
        renderer.remove();
        split.rightElement().appendChild(stubMessage);
        statusbar.rightElement().textContent = '';
        return;
      }
      if (stubMessage.isConnected) {
        stubMessage.remove();
        split.rightElement().appendChild(renderer);
      }
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
      persistTabs();
    },

    didCloseTab(path) {
      persistTabs();
    },

    didAddTab(path) {
      persistTabs();
    },
  });

  split.toggleLeftVisibility(await prefs.get('app.navigator.visible'));
  tabstrip.addEventListener('dblclick', () => {
    const visible = !split.isLeftVisible();
    split.toggleLeftVisibility(visible);
    prefs.set('app.navigator.visible', visible);
  }, false);

  function persistTabs() {
    const selectedTab = tabstrip.selectedTab();
    const entries = tabstrip.tabs().map(id => ({id, selected: id === selectedTab}));
    prefs.set('app.tabs.opened', entries);
  }

  const sidebar = new SidebarComponent(window.fs, {
    onFileSelected(path) {
      if (!tabstrip.hasTab(path))
        tabstrip.addTab(path, fs.fileName(path), path);
      tabstrip.selectTab(path);
    }
  });
  split.leftElement().appendChild(sidebar);

  split.rightElement().appendChild(tabstrip);

  const renderer = new EditorComponent();
  const thread = await Thread.create(WebPlatformSupport.instance());

  const stubMessage = createStubMessage();
  split.rightElement().appendChild(stubMessage);

  const statusbar = new StatusbarComponent();
  statusbar.leftElement().appendChild(renderer.selectionDescriptionElement());
  statusbar.rightElement().textContent = '';
  document.body.appendChild(statusbar);

  const filterDialog = new FilterDialogComponent();
  // Restore tabs
  try {
    const entries = await prefs.get('app.tabs.opened');
    if (entries) {
      for (const entry of entries) {
        tabstrip.addTab(entry.id, fs.fileName(entry.id), entry.id);
        if (entry.selected)
          tabstrip.selectTab(entry.id);
      }
    }
  } catch (e) {
  }


  window.addEventListener('beforeunload', event => {
    let hasDirtyEditors = false;
    for (const [path, editor] of editors) {
      if (!isClean(editor)) {
        hasDirtyEditors = true;
        if (!tabstrip.hasTab(path))
          tabstrip.addTab(path, fs.fileName(path), path);
        tabstrip.selectTab(path);
      }
    }
    if (hasDirtyEditors) {
      event.preventDefault();
      event.returnValue = 'There are dirty editors; close anyway?';
    }
  });

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
            tabstrip.addTab(path, fs.fileName(path), path);
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

