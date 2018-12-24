import { Theme } from './Theme.mjs';

export default new Theme(import.meta.url, {
  "gutter": {
    "background-color": "black",
    "border-color": "rgb(187, 187, 187)",
    "border-width": 1,
    "color": "rgb(128, 128, 128)",
  },
  "vertical-scrollbar": {
    "track": {
      "border-color": "rgba(100, 100, 100, 0.2)",
      "border-width": 1,
    },
    "thumb": {
      "background-color": 'rgba(100, 100, 100, 0.4)',
    },
    "thumb.hover": {
      "background-color": 'rgba(100, 100, 100, 0.6)',
    },
    "thumb.drag": {
      "background-color": 'rgba(100, 100, 100, 0.8)',
    },
  },
  "horizontal-scrollbar": {
    "thumb": {
      "background-color": 'rgba(100, 100, 100, 0.4)',
    },
    "thumb.hover": {
      "background-color": 'rgba(100, 100, 100, 0.6)',
    },
    "thumb.drag": {
      "background-color": 'rgba(100, 100, 100, 0.8)',
    },
  },
  "editor": {
    "background-color": "black",
  },
  "text": {
    "selection.focus": {
      "token": {
        "border-color": "rgb(223, 223, 223)",
        "border-width": 2
      }
    },
    "selection.range": {
      "token": {
        "background-color": "rgba(126, 188, 254, 0.5)"
      },
      "token-line": {
        "background-color": "rgba(126, 188, 254, 0.1)"
      },
      "scrollbar-marker": {
        "background-color": "rgba(126, 188, 254, 0.6)",
        "left": 40,
        "right": 60
      }
    },
    "search.match": {
      "token": {
        "background-color": "hsla(36, 96%, 56%, 0.4)"
      },
      "scrollbar-marker": {
        "background-color": "hsla(36, 96%, 56%, 0.4)",
        "left": 0,
        "right": 100
      },
      "gutter": {
        "border-color": "hsla(36, 96%, 56%, 0.7)",
        "border-width": 2,
      }
    },
    "whitespace.trailing": {
      "token": {
        "background-color": "rgba(255, 0, 0, 0.2)",
      }
    },
    "search.match.current": {
      "token": {
        "border-color": "hsl(39, 96%, 28%)",
        "border-width": 2
      }
    },
    "syntax.default": {
      "token": {
        "color": "rgb(223, 223, 223)"
      }
    },
    "syntax.keyword": {
      "token": {
        "color": "hsl(310, 86%, 36%)"
      }
    },
    "syntax.string": {
      "token": {
        "color": "hsl(1, 80%, 43%)"
      }
    },
    "syntax.number": {
      "token": {
        "color": "hsl(240, 73%, 72%)"
      }
    },
    "syntax.variable": {
      "token": {
        "color": "rgb(0, 0, 128)"
      }
    },
    "syntax.comment": {
      "token": {
        "color": "hsl(120, 100%, 23%)"
      }
    },
    "red": {
      "token": {
        "color": "red",
        "background-color": "rgba(255, 0, 0, 0.2)",
        "border-color": "black",
        "border-width": 1,
        "border-radius": 4
      }
    },
    "green": {
      "token": {
        "color": "green",
        "background-color": "rgba(0, 255, 0, 0.2)"
      }
    },
    "blue": {
      "token": {
        "color": "blue",
        "background-color": "rgba(0, 0, 255, 0.2)",
        "border-color": "rgb(0, 0, 50)",
        "border-width": 1,
        "border-radius": 2
      }
    },
    "the-range": {
      "token": {
        "background-color": "rgba(0, 0, 0, 0.4)"
      }
    },
    "hiddenrange": {
      "token": {
        "background-color": "rgba(0, 128, 0, 0.2)"
      }
    }
  }
});
