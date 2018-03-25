export class StatusbarComponent extends HTMLElement {
  constructor() {
    super();
    this._left = document.createElement('left-zone');
    this._right = document.createElement('right-zone');
    this.appendChild(this._left);
    this.appendChild(this._right);
  }

  leftElement() {
    return this._left;
  }

  rightElement() {
    return this._right;
  }
}

customElements.define('statusbar-component', StatusbarComponent);
