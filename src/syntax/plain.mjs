export default class {
  /**
   * Called on every render of viewport. See Viewport for api.
   * @param {!Viewport} viewport
   */
  onViewport(viewport) {
    let {from, to} = viewport.range();
    viewport.addDecoration(from, to, 'syntax.default');
  }
};
