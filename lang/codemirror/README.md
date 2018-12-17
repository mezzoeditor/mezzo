# CodeMirror Modes

This folder contains an adapter for [CodeMirror 5](https://github.com/codemirror/CodeMirror) modes.

While this might be enough for some languages, there are
a few disadvantages of using this adapter comparing to native
modes:
- CodeMirror modes use lines as a minimal chunk of work; it's
  impossible to run them efficiently across long lines
- CodeMirror modes rely on javascript Regular Expressions, forcing
  editor to convert text from internal representation into string for
  every line
- Mode's state cannot be compared, thus highlighting cannot "converge".
  As a result, editing one symbol in the very beginning of the document
  results in the whole document been rehilighted.
- Mode's state cannot be serialized and deserialized, making it impossible
  to do highlight in a worker.

