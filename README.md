## Features

#### Core features
* [x] performance (`T` = text length, `C` = cursor count, `D` = decoration count)
    - [x] 60fps rendering
    - [x] no line or column limit
    - [x] `O(log T)` editing
    - [x] `O(log D)` decoration updates
    - [x] `O(log T)` undo/redo
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
* [x] decorations
    - [x] text
    - [x] background
    - [x] scrollbar
    - [x] gutter
    - [x] line
* [ ] plugins system
    - [ ] extensible history
    - [ ] extensible editing
    - [ ] extensible decorations
    - [x] synchronous updates in one frame
    - [ ] async processing primitives

#### Tier 1 features
* [x] all kinds of editing commands
* [x] search
* [ ] replace
* [x] keyboard bindings
* [x] auto-indent
* [ ] line wrapping
* [ ] interactive decorations
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
* [ ] instant indent block

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

---

### Offsets and anchors

Anchor represents a position between two code units which is aligned
either to the left (stored as integer |offset|) or to the right (stored
as a number |offset + 0.5|).

Left-aligned anchor at |x| stays immediately before offset |x|
and immediately after code unit at index |x - 1|.
When inserting text at offset |x|, the anchor does not move.

Right-aligned anchor at |x + 0.5| stays immediately after offset |x|
and immediately before character at index |x|.
When inserting text at offset |x|, the anchor moves to the right.

Below is an example of how anchors behave.

```
Code unit index        0       1       2       3       4
                   |   H   |   E   |   L   |   I   |   O   |
Anchor "before"  0 |     1 |     2 |     3 |     4 |     5 |
Offset             0       1       2       3       4       5
Anchor "after"     |0.5    |1.5    |2.5    |3.5    |4.5    |5.5
Decoration                       [xxxxxxxxxxxx]
  [2 - 3.5]
```

After removal: HEIO

```
Code unit index        0       1       2       3
                   |   H   |   E   |   I   |   O   |
Anchor "before"  0 |     1 |     2 |    3  |     4 |
Offset             0       1       2       3       4
Anchor "after"     |0.5    |1.5    |2.5    |3.5    |4.5
Decoration                       [xxxx]
  [2 - 2.5]
```

After insertion: HNEIO

```
Code unit index        0       1       2       3       4
                   |   H   |   N   |   E   |   I   |   O   |
Anchor "before"  0 |     1 |     2 |     3 |     4 |     5 |
Offset             0       1       2       3       4       5
Anchor "after"     |0.5    |1.5    |2.5    |3.5    |4.5    |5.5
Decoration                               [xxxx]
  [3 - 3.5]
```

After replacment: HNEBO

```
Code unit index        0       1       2       3       4
                   |   H   |   N   |   E   |   B   |   O   |
Anchor "before"  0 |     1 |     2 |     3 |     4 |     5 |
Offset             0       1       2       3       4       5
Anchor "after"     |0.5    |1.5    |2.5    |3.5    |4.5    |5.5
Decoration                               [xxxx]
  [3 - 3.5]
```

After insertion: HNEIBO

```
Code unit index        0       1       2       3       4       5
                   |   H   |   N   |   E   |   I   |   B   |   O   |
Anchor "before"  0 |     1 |     2 |     3 |     4 |     5 |     6 |
Offset             0       1       2       3       4       5       6
Anchor "after"     |0.5    |1.5    |2.5    |3.5    |4.5    |5.5    |6.5
Decoration                               [xxxxxxxxxxxx]
  [3 - 4.5]
```

---

### Extensibility

Typical plugin can be integrated at multiple points:
* Edit the document (text and selection).
* Reveal text ranges.
* Listen to document changes (text and selection).
* Synchronously decorate viewport.
* Do asynchronous work using platform support.
* Provide content-dependent data (TODO).
* Inject into default editing (TODO).
