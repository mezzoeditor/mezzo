export class SplitComponent extends HTMLElement {
  constructor() {
    super();
    this._left = document.createElement('split-left');
    this._left.classList.add('vbox');
    this._divider = document.createElement('split-divider');
    this._right = document.createElement('split-right');
    this._right.classList.add('vbox');
    this.appendChild(this._left);
    this.appendChild(this._divider);
    this.addEventListener('mousedown', this._onMouseDown.bind(this), false);
    this.addEventListener('mousemove', this._onMouseMove.bind(this), false);
    this.addEventListener('mouseup', this._onMouseUp.bind(this), false);
    this.appendChild(this._right);

    this._leftWidth = 0;
    this.setLeftWidth(300);

    this._mouseDownPosition = null;
    this._mouseDownWidth = 0;
  }

  setLeftWidth(width) {
    this._left.style.setProperty('width', width + 'px');
    this._divider.style.setProperty('left', width - 4 + 'px');
    this._leftWidth = width;
  }

  _onMouseDown(event) {
    if (event.target !== this._divider)
      return;
    this._mouseDownPosition = this._mouseCoordinates(event);
    this._mouseDownWidth = this._leftWidth;
    this._divider.classList.add('dragging');
  }

  _onMouseMove(event) {
    if (!this._mouseDownPosition)
      return;
    let coordinates = this._mouseCoordinates(event);
    let delta = coordinates.x - this._mouseDownPosition.x;
    this.setLeftWidth(this._mouseDownWidth + delta);
  }

  _onMouseUp(event) {
    this._mouseDownPosition = null;
    this._divider.classList.remove('dragging');
  }

  _mouseCoordinates(event) {
    const bounds = this.getBoundingClientRect();
    return {
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top
    };
  }

  leftElement() {
    return this._left;
  }

  rightElement() {
    return this._right;
  }
}

customElements.define('split-component', SplitComponent);
