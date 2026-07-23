# The `.loom` format

A plain-text description of a narrative graph. Line-oriented, order-independent,
forgiving. Written to be typed fast by a human and parsed trivially by a machine.

**Version 0.1.** The parser is the reference; this document describes it.

---

## Principles

**Speed of creation over correctness.** Unparsed lines are reported, never fatal.
Missing things are created, not rejected. Get it out of your head first.

**Nodes hold a reference to content, never the content.** `content:scenes/door.md`
is a pointer. This is what lets one graph render as a web page, a printed book, a
BBS door game, or a Twine story without the graph knowing or caring.

**Undecided is not an error.** An unbound variable, an undescribed node, an empty
trigger — these are things you haven't got to yet, and the format holds them
comfortably.

---

## Lines

Every line is one of six things. Blank lines are ignored. `#` starts a comment and
runs to end of line.

```
# a comment

palette paper                       # graph-level setting
let hero = Borlu                    # lexicon binding
node door "The Door" type:location  # a node
door -> table : walk in             # an edge
```

Order doesn't matter. A node may be declared after the edges that reference it, or
never declared at all.

---

## `node`

```
node <id> "<title>" [attributes...]
```

- **`<id>`** — required. No spaces. Used by edges and by `{{variables}}`.
- **`"<title>"`** — optional. Defaults to the id. May contain `{{variables}}`.

### Attributes

| attribute | meaning |
|---|---|
| `type:<name>` | one of the seven node types (below). Defaults to `scene`. |
| `shape:<name>` | overrides the type's default shape. |
| `content:<ref>` | a **pointer** to the prose. A path, URL, database key — anything. Never the prose itself. |
| `frag:"<text>"` | a dream fragment. Short, image-like. Repeatable. |
| `tag:<name>` | free tagging. Repeatable. |

```
node table "The Bright Room" type:scene shape:rect content:scenes/table.md
     frag:"the hum of the lights" frag:"a pale folder" tag:act1
```

*(Attributes must be on the same line as the `node` keyword.)*

### Types

| type | default shape | what it is |
|---|---|---|
| `scene` | rectangle | a place the reader arrives; holds prose |
| `location` | hexagon | where something is; scenes sit inside it |
| `character` | pill | someone; attaches to scenes they appear in |
| `lore` | document | a fact about the world; feeds anything |
| `object` | circle | a thing; carries meaning later acts define |
| `dream` | torn | interstitial; assembled from fragments elsewhere |
| `note` | slab | for you; never rendered |

Each type declares named **input and output slots** with a list of types they
accept. **Types are advisory.** A connection that doesn't fit is drawn dashed and
counted in the status bar — never refused. In a narrative graph the wrong edge is
often the interesting one.

### Shapes

`rect` · `pill` · `hex` · `diamond` · `circle` · `torn` · `doc` · `slab`

A shape owns its own handle positions. Hexagons put them on the faces, diamonds on
the points, circles radially.

---

## Edges

```
<from> <arrow> <to> : <action> ! <requirement> ! <requirement>
```

### Arrows

| arrow | meaning |
|---|---|
| `->` | directed. Can be traversed repeatedly. |
| `=>` | directed, and **locks behind you**. One way, permanently. |
| `<>` | bidirectional. |

### The action

Everything after `:` up to the first `!` is the **action** — what happens when you
traverse this edge. Edges are actions. This is the connective tissue in a rendered
story, and the choice text in a playable one.

### Requirements

Everything after each `!` is a **requirement** on the far end: what that node must
be or do. Requirements are how you specify a node you haven't written yet.

```
table -> the_twin : look up ! must have {{brother}}'s face ! must not speak
```

Unmet requirements — those pointing at undescribed nodes — collect into a to-do
list the structure computes for you.

---

## Empty nodes

**An edge pointing at an undeclared node creates it, empty.**

```
table -> the_twin : look up
```

`the_twin` now exists. It is topologically real — it has edges, it walks, it
counts in the analysis, it can be an articulation point. It is semantically
undescribed. **Its position in the graph is fully specified; its identity is not.**

This is the point. You commit to the relationships first and the description
arrives later. A template is a graph that is complete topologically and empty
semantically.

Empty nodes render hollow: dashed border, italic grey title, marked *undescribed*.

---

## The lexicon

```
let hero      = Borlu
let the_thing = the red pen
let witness   =
```

`{{name}}` expands anywhere — node titles, fragments, content refs, edge actions,
requirements.

**Bind late.** `let witness =` declares a variable with no value. `{{witness}}`
renders visibly as `{{witness}}` rather than blanking, because undecided is not an
error. Change a binding once and it changes everywhere.

A variable may hold a node id, which is how templates work: a template is a graph
with unbound variables, and stamping an instance is binding them.

---

## Graph settings

```
palette neon
```

`neon` · `paper` · `cold` · `ember` · `mono` · `contrast`

---

## Validation

The format has one structural rule: **no end, always a loop.** Two checks report
against it, live, without blocking anything.

- **dead end** — a node you cannot leave.
- **cannot return** — a node from which you cannot get back to the start.

Plus advisory counts: type mismatches, undescribed nodes, unbound variables,
unparsed lines.

---

## Round-tripping

`parse()` and `serialise()` are inverses. Anything the editor does to a graph can
be written back out as `.loom` and re-read identically. Node positions and fold
states are **not** in the format — they're view state, stored separately.

An empty node created by an edge is not serialised as its own `node` line; the
edge recreates it on the next parse.

---

## Grammar

```
file        := line*
line        := comment | blank | palette | let | node | edge
comment     := '#' .*
palette     := 'palette' name
let         := 'let' name '=' value?
node        := 'node' id ('"' title '"')? attribute*
attribute   := 'type:' name | 'shape:' name | 'content:' ref
             | 'frag:"' text '"' | 'tag:' name
edge        := id arrow id (':' action ('!' requirement)*)?
arrow       := '->' | '=>' | '<>'
```

---

## Example

```
# the brother and the brother
palette neon

let brother   = Borlu
let the_thing = the red pen
let witness   =

node door  "The Door"         type:location frag:"a door closing"
node table "The Bright Room"  type:scene    content:scenes/table.md
     frag:"the hum of the lights" frag:"very bright"
node red   "{{the_thing}}"    type:object   frag:"corrections in red"
node hall  "The Hallway"      type:location frag:"dimly lit"

door  <> table    : walk in
table -> red      : pick up {{the_thing}}
red   -> table    : keep working
table => hall     : leave                    # locks behind
hall  -> door     : the loop closes

# never declared. the edge creates it, empty, with requirements.
table -> the_twin : look up ! must have {{brother}}'s face ! must not speak
the_twin -> door  : leave
```
