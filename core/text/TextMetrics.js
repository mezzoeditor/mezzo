/**
 * @implements OrderedMonoid<Mezzo.TextMetrics, Mezzo.TextLookupKey>
 */
export class TextMetricsMonoid {
  /**
   * @override
   * @return {Mezzo.TextMetrics}
   */
  identityValue() {
    return {length: 0, firstWidth: 0, lastWidth: 0, longestWidth: 0};
  }

  /**
   * @override
   * @param {Mezzo.TextMetrics} a
   * @param {Mezzo.TextMetrics} b
   * @return {Mezzo.TextMetrics}
   */
  combineValues(a, b) {
    const result = {
      longestWidth: Math.max(Math.max(a.longestWidth, a.lastWidth + b.firstWidth), b.longestWidth),
      firstWidth: a.firstWidth + (a.lineBreaks ? 0 : b.firstWidth),
      lastWidth: b.lastWidth + (b.lineBreaks ? 0 : a.lastWidth),
      length: a.length + b.length
    }
    if (a.lineBreaks || b.lineBreaks)
      result.lineBreaks = (a.lineBreaks || 0) + (b.lineBreaks || 0);
    return result;
  }

  /**
   * @override
   * @param {Mezzo.TextMetrics} metrics
   * @param {Mezzo.TextLookupKey} key
   * @return {boolean}
   */
  valueGreaterThanKey(metrics, key) {
    if (key.offset !== undefined)
      return metrics.length > key.offset;
    const line = metrics.lineBreaks || 0;
    return line > key.y || (line + 1 > key.y && metrics.lastWidth > key.x);
  }

  /**
   * @override
   * @param {Mezzo.TextMetrics} metrics
   * @param {Mezzo.TextLookupKey} key
   * @return {boolean}
   */
  valueGreaterOrEqualThanKey(metrics, key) {
    if (key.offset !== undefined)
      return metrics.length >= key.offset;
    const line = metrics.lineBreaks || 0;
    return line > key.y || (line + 1 > key.y && metrics.lastWidth >= key.x);
  }
};
