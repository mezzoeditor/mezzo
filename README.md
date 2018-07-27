## Features

#### Core features
* [x] performance (`T` = text length, `C` = cursor count, `D` = decoration count)
    - [x] 60fps rendering
    - [x] no line or column limit
    - [x] `O(log T)` editing
    - [x] `O(log D)` decoration updates
    - [ ] `O(log T)` undo/redo
    - [x] `O(C * log T)` multiple cursors editing
    - [x] `O(C + log T)` memory overhead
* [x] full unicode support for monospace fonts
* [ ] flexibility
    - [x] decoupled document and viewport
    - [ ] widgets
        * [ ] inline
        * [ ] gutter
        * [ ] multi-line
    - [ ] displaying document ranges
* [ ] decorations
    - [x] text
    - [x] background
    - [x] scrollbar
    - [ ] gutter
    - [x] line
* [ ] plugins system
    - [ ] extensible history
    - [ ] interoperability by default
    - [ ] synchronous updates
    - [ ] async processing

#### Tier 1 features
* [ ] all kinds of editing commands
* [x] search/replace
* [x] keyboard bindings
* [x] auto-indent
* [ ] line wrapping
* [ ] interactive decorations
* [ ] instant indent block
* [ ] font settings
* [ ] custom themes

#### Content type features
* [x] syntax highlight
    - [x] JavaScript
* [ ] syntax-indent
* [ ] bracket matching
* [x] auto-closing brackets
* [ ] autocomplete

#### Tier 2 features
* [ ] syntax checking
* [ ] folding
* [ ] bidi
* [ ] non-monospace font
* [ ] spell checking
* [ ] indent guides
* [ ] minimap
* [ ] variable line height
* [ ] variable text metrics

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
  coordinate of the character's rectangle. First visible character has `{x: 0, y: 0}` point.
  This depends on what is visible in viewport, as opposite to just document itself. For example,
  folding a part of document changes points for many characters, and folded parts do not
  have any corresponding points at all.

* #### Location = {x, y, offset}
  Location is a combination of `offset` and either `line + column` or `x + y`. Viewport and document have
  different `x` and `y` meaning: position in document vs point in viewport.

Most of the code should work with `offsets`, and handle surrogate pairs if doing manual text processing. This way
it's similar to working with a string. User-manipulated code should instead resolve to `positions` or `points`, which
ensures that user never sees a broken code point.

### Coordinate systems of different containers

* #### Document
  - `offset`, `position`, `location`

  Document coordinates are relative to the document. This is default.

* #### Viewport
  - `offset`, `point`

  Coordinates relative to the viewport containing visible parts of the document. Note that `offsets`
  between document and viewport match and should be used for conersions between them.

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

---

### Class diagram for history

Text==string

Selection
* array
* change
* event: changed

Document
* Text
* replace
* event: replaced
  
Editor
* Document
* Selection
* Metadata (e.g. generation)
* history api: push, pop, amend, undo, redo, softUndo, softRedo
* Viewport
  
  
  

