## Features

#### Core features
* [x] 60fps rendering
* [x] million lines editing
* [x] million columns editing
* [x] performant undo/redo
* [x] performant multiple cursors
* [x] full unicode support for monospace fonts
* [x] rich decorations
* [x] rich scrollbar markers
* [x] easy plugins system
* [ ] rich gutter markers

#### Tier 1 features
* [x] search/replace
* [x] keyboard bindings
* [x] auto-indent
* [ ] instant indent block
* [ ] inline widgets (width = multiple of character when using monospace)
* [ ] gutter widgets
* [ ] multi-line widgets
* [ ] font settings
* [ ] custom themes

#### Content type features
* [x] syntax highlight:
    - JavaScript
* [ ] syntax-indent
* [ ] bracket matching
* [ ] auto-closing brackets
* [ ] autocomplete

#### Tier 2 features
* [ ] syntax checking
* [ ] folding
* [ ] bidi
* [ ] non-monospace font
* [ ] spell checking
* [ ] indent guides
* [ ] minimap

---

### Characters and coordinates

Character corresponds to a single Unicode code point. It may consist of one or two code units. In the latter case
code units are called high and low surrogate, forming a surrogate pair.

Multiple characters may be rendered as a single glyph (a case with accented symbols).
Single character may be rendered as multiple glyphs in a particular font, but we consider them
as a single opaque entity.

A character may measure to the width of zero, even if it has some visual representation.
This is often a case with accents.

* #### Offset = integer
  - `from`, `to` for an offset range; `length`, `delta`, `codeUnits` for an offset delta.

  Offset is a sequential number of a single Unicode code unit (including line breaks) in the document,
  if you think of a document as an array of code units.

  Note that offset inbetween of a surrogate pair cannot be converted to a `position` or a `point`. Similary,
  document cannot be split at such offset.

* #### Position = {line: integer, column: integer}
  - `columnDelta`, `codePoints` for a column delta.

  Position is a 2-d coordinate system based on lines and columns. Not every position is a valid one.
  For example, line `abc` has 4 positions, with columns from 0 to 3.

  Single Unicode code point takes a single column, meaning a column may corresponds to two consecutive offsets.

* #### Point = {x: float, y: float}
  Point is measured in rendering units (e.g. pixels), and corresponds to the top-left
  coordinate of the character's rectangle. First character of the document has `{x: 0, y: 0}` point.

* #### Location = {x, y, line, column, offset}
  Location is a combination of all, completely describing character's location in the universe.
  Well, not in the universe, but in a container - see below for more details.

Most of the code should work with `offsets`, and handle surrogate pairs if doing manual text processing. This way
it's similar to working with a string. User-manipulated code should instead resolve to `positions` or `locations`, which
ensures that user never sees a broken code point.

### Coordinate systems of different containers

* #### Document
  - `offset`, `position`, `point`, `location`, `documentPoint`

  Document coordinates are relative to the document. This is default. When you see `point`,
  it usually means point relative to the document start.

* #### Viewport
  - `viewportPoint`

  Coordinates relative to the viewport - a visible part of the document.

* #### View
  - `viewPoint`

  Coordinates relative to the view - something rendered as a part of editor.
  This includes not only the viewport, but also (possibly) gutters, paddings, headers, footers, etc.
  These may be different for different views, and what's included is context-dependent.

---

### Extensibility

Typical plugin can be integrated at multiple points:
* Edit document with `Document.replace`.
* Reveal text ranges with `Viewport.reveal`.
* Listen to document changes with `replaceCallback`.
* Decorate viewport with `decorationCallback`.
* Do asynchronous work with `idleCallback`.
* Provide content-dependent data with `setHighlighter` or `setTokenizer`.
* Use public APIs of other plugins, e.g. `selection.setRanges`.
