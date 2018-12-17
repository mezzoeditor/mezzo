export class StatusbarComponent extends HTMLElement {
  constructor() {
    super();
    this._left = document.createElement('left-zone');
    this._left.classList.add('hbox');
    this._right = document.createElement('right-zone');
    this._right.classList.add('hbox');
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
