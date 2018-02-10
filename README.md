## Features

#### Core features
* [x] 60fps rendering
* [x] million lines editing
* [x] million columns editing
* [x] instant undo/redo
* [x] performant multiple cursors
* [x] unicode (same-width chars)
* [x] rich decorations
* [x] rich scrollbar markers
* [x] easy plugins system
* [ ] rich gutter markers

#### Tier 1 features
* [x] search/replace
* [x] keyboard bindings
* [ ] auto-indent
* [ ] instant indent block
* [ ] inline widgets (width = multiple of character)
* [ ] gutter widgets
* [ ] multi-line widgets
* [ ] font settings
* [ ] custom themes

#### Content type features
* [ ] syntax highlight:
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

## Coordinate systems

### Different aspects of the same character

* #### Offset = number
  Offset is a sequential number of a single character (including line breaks) in the document,
  if you think of a document as a string.

* #### Position = {line, column}
  Position is a 2-d coordinate system based on lines and columns. Not every position is a valid one.
  For example, line `abc` has 4 positions, with columns from 0 to 3.

* #### Point = {x, y}
  Point is measured in rendering units (e.g. pixels), and corresponds to the top-left
  coordinate of the character's rectangle.
  First character of the document has `{x: 0, y: 0}` point.
  Since characters may have different sizes, points are not trivially convertable to positions.

* #### Location = {x, y, line, column, offset}
  Location is a combination of all, completely describing character's location in the universe.
  Well, not completely - see below!

### Different containers of the same character

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
 






