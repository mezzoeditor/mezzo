export default {
  decorations: {
    // Decorations are classes returns by viewport decorators.
    // Every decoration has 4 associated areas; every decoration
    // might define custom styling for every of this areas.
    // - "self": the token of text marked with the decoratiosn.
    // - "line": the line that contains decoration
    // - "gutter": the gutter that matches the line that contains decoration
    // - "scrollbar": the scrollbar mark associated with decoration
    //
    'selection.focus': {
      self: {
        borderColor: 'rgb(33, 33, 33)',
        borderWidth: 2,
      }
    },
    'selection.range': {
      self: {
        backgroundColor: 'rgba(126, 188, 254, 0.5)',
      },
      line: {
        backgroundColor: 'rgba(126, 188, 254, 0.1)',
      },
      scrollbar: {
        backgroundColor: 'rgba(126, 188, 254, 0.6)',
        left: 40,
        right: 60,
      }
    },
    'search.match': {
      self: {
        backgroundColor: 'hsla(36, 96%, 56%, 0.4)',
      },
      scrollbar: {
        backgroundColor: 'hsla(36, 96%, 56%, 0.4)',
        left: 0,
        right: 100,
      },
      gutter: {
        borderColor: 'hsla(36, 96%, 56%, 0.7)',
        borderWidth: 1,
      }
    },
    'search.match.current': {
      self: {
        borderWidth: 1,
        borderColor: 'hsl(39, 96%, 28%)',
      }
    },
    'syntax.default': {
      self: {
        color: 'rgb(33, 33, 33)',
      }
    },
    'syntax.keyword': {
      self: {
        color: 'hsl(310, 86%, 36%)',
      }
    },
    'syntax.string': {
      self: {
        color: 'hsl(1, 80%, 43%)',
      }
    },
    'syntax.number': {
      self: {
        color: 'hsl(240, 73%, 38%)',
      }
    },
    'syntax.variable': {
      self: {
        color: 'rgb(0, 0, 128)',
      }
    },
    'syntax.comment': {
      self: {
        color: 'hsl(120, 100%, 23%)',
      }
    },
    'red': {
      self: {
        color: 'red',
        backgroundColor: 'rgba(255, 0, 0, 0.2)',
        borderColor: 'black',
        borderWidth: 1,
        borderRadius: 4,
      }
    },
    'green': {
      self: {
        color: 'green',
        backgroundColor: 'rgba(0, 255, 0, 0.2)',
      }
    },
    'blue': {
      self: {
        color: 'blue',
        backgroundColor: 'rgba(0, 0, 255, 0.2)',
        borderColor: 'rgb(0, 0, 50)',
        borderWidth: 2,
      }
    },
    'the-range': {
      self: {
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
      }
    }
  }
};

