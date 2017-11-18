export class FontMetrics {
  constructor() {
    this.charWidth = 0;
    this.charHeight = 0;
    this.lineHeight = 0;
  }

  static createSimple() {
    const metrics = new FontMetrics();
    metrics.charWidth = 9;
    metrics.charHeight = 16;
    metrics.lineHeight = 21;

    metrics.fontFamily = "Menlo, Monaco, 'Courier New', monospace";
    metrics.fontSize = "14px";
    metrics.fontWeight = "normal";
    return metrics;
  }

  css() {
    return `
      font-family: ${this.fontFamily};
      font-size: ${this.fontSize};
      font-weight: ${this.fontWeight};
      letter-spacing: normal;
      text-size-adjust: 100%;
      font-feature-settings: "liga" off, "calt" off;
    `;
  }
}

