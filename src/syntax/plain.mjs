export default class {
  /**
   * Called on every render of viewport. See Viewport for api.
   * @param {!Viewport} viewport
   */
  onViewport(viewport) {
    viewport.addDecoration(viewport.from(), viewport.to(), 'syntax.default');
  }
};
