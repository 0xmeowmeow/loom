# loom

A graph editor for narratives that loop.

Nodes are prose. **Edges are actions.** Some doors open both ways, some lock behind
you. There is no ending — every path returns. Dreams are generated from where you
*haven't* been, and hint at the paths you didn't take.

Built for planning a novella whose shape is a Klein bottle: no start, no end, the
whole narrative is the twist. It turned out to be general.

![status: early](https://img.shields.io/badge/status-early-orange)

## Why

Most branching-narrative tools assume a story is a tree with endings. This one
assumes the opposite: that the interesting shape is a loop you re-enter, where
meaning accretes across traversals rather than resolving at a terminus.

It also assumes the author thinks in possibility-space — *what streams end where,
which earlier parts lead to which outcomes, what happens if I move this* — and needs
to weave quickly without the tool arguing.

## Design decisions

**The text file is the source of truth. The canvas is a view.**
Type when you want speed, drag when you want to see the shape. Both edit the same
thing. Typing fifty edges takes two minutes; dragging fifty edges does not.

**Nodes hold a *reference* to content, never the content.**
`content:scenes/door.md` — a pointer. Could be markdown, an image, a database key,
ANSI art. This is what lets the same graph render as an HTML page, a BBS door game,
a Twine import, or a printed book, at any time, without touching the graph.

**Undecided things stay empty.**
Edge `trigger` is a free-text field. Leave it blank until you know. The structure
supports it whenever you work it out. Deciding early is how builds stall.

**Speed of creation over correctness.**
Unparsed lines are reported, not fatal. Missing nodes are flagged, not rejected.
Get it out of your head first.

## The format

```
# comments start with hash

node door  "The Door"        content:scenes/door.md  frag:"a door closing"
node table "The Bright Room" content:scenes/table.md frag:"the hum" frag:"very bright"

door  <> table : walk in          # both ways
table -> door  : leave            # directed, can be retraversed
table => hall  : step through     # locks behind you, permanently
```

Text after `:` is the edge label — the action. That's the whole syntax.

## Dreams

A dream is not authored. It's a function of the walk: fragments pulled from the
**unvisited frontier** and shown out of context. The reader thinks they're dreaming.
They're being navigated.

- `radius: 1` — only what's one edge off your path. A guide.
- `radius: n` — within n edges.
- `radius: null` — anywhere unvisited. A haunting.

Fragments mix seen and unseen material, which is what makes it feel wrong in the
right way. Deterministic given a seed, so a walk can be replayed.

## Validation

The only rule that matters: **no end, always a loop.**

- `findDeadEnds()` — nodes you can't leave.
- `findNonReturning(home)` — nodes from which you can't get back.

Both are reported live in the status bar.

## Use

```bash
git clone <this repo>
cd loom
python3 -m http.server 8000    # or any static server; ES modules need http://
```

Open `http://localhost:8000/loom.html`.

Source autosaves to localStorage. Export gives you JSON, Twee (paste into Twine),
Cypher (neo4j, if you want to *ask the graph questions* — all paths through X,
what's unreachable, cycle detection), or the `.loom` source itself.

## Roadmap — help others work this way

The real goal is not the editor. It's making this way of working available to people
who think in graphs and possibility-space rather than in outlines, and who find
conventional writing tools actively obstructive.

Planned, roughly in order:

- [ ] **A front end that doesn't require the text format.** The format is fast once
      you know it; it is a wall if you don't. Same graph, gentler door.
- [ ] **Termination conditions as first-class.** Not "write until it feels done" but
      *this node is complete when X*. For people who struggle to close rather than
      to start.
- [ ] **Renderers as plugins.** HTML, BBS door, single-page print, Twine. The graph
      already doesn't care; the renderers should be swappable and community-written.
- [ ] **Fragment tooling.** Extracting dream-vocabulary from prose semi-automatically.
- [ ] **A guide to the method, not just the tool.** How to build a looping narrative:
      anchoring arbitrary choices and developing them, letting objects hold meaning
      that later acts define, designing for the re-read. The tool is downstream of
      the method.
- [ ] **Accessibility for non-linear thinkers.** No grammar jargon. No enforced
      outlines. No "you must decide this now." Empty fields everywhere, filled when
      the shape reveals itself.

If you work this way and something here obstructs you, that's a bug. Open an issue.

## License

MIT.
