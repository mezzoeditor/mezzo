/**
 * @param {number} seed
 * @return {function():number}
 */
export let Random = seed => {
  return function() {
    return seed = seed * 48271 % 2147483647;
  };
};
