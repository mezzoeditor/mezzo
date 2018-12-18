import { EventEmitter } from '../../src/utils/EventEmitter.mjs';
import { Document } from '../../src/text/Document.mjs';
import { DOMUtils } from '../../src/web/DOMUtils.mjs';

export class CursorBlinker {
  constructor(renderer, blinkingInterval = 500) {
    this._renderer = renderer;
    this._blinkingTimeout = null;
    this._decorator = null;
    this._eventListeners = [];
    this._visibility = false;
    this._interval = blinkingInterval;
  }

  _stopBlinking() {
    if (this._blinkingTimeout) {
      window.clearTimeout(this._blinkingTimeout);
      this._blinkingTimeout = null;
    }
  }

  _restartBlinking() {
    this._stopBlinking();
    this._visibility = true;
    this._decorator.setRenderSelectionFocus(this._visibility);
    this._blinkingTimeout = setTimeout(this._blink.bind(this), this._interval);
    this._renderer.raf();
  }

  _blink() {
    this._visibility = !this._visibility;
    this._decorator.setRenderSelectionFocus(this._visibility);
    this._blinkingTimeout = setTimeout(this._blink.bind(this), this._interval);
    this._renderer.raf();
  }

  setSelectionDecorator(selectionDecorator) {
    if (this._decorator) {
      this._stopBlinking();
      EventEmitter.removeEventListeners(this._eventListeners);
      this._decorator = null;
    }
    this._decorator = selectionDecorator;
    if (this._decorator) {
      this._restartBlinking();
      this._eventListeners = [
        this._decorator.editor().document().on(Document.Events.Changed, () => this._restartBlinking()),
      ];
    }
  }
}
