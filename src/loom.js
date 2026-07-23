/**
 * loom.js — the graph engine.
 *
 * Source of truth is a plain text file. The canvas is a view over it.
 * Nodes hold a reference to content (file, url, key, whatever) — never the
 * content itself. Rendering is somebody else's problem, which is what lets
 * the same graph emit HTML, a BBS door, a Twine import, or a printed book.
 */

// ---------------------------------------------------------------------------
// TEXT FORMAT
// ---------------------------------------------------------------------------
//
//   # comments start with hash
//
//   node door "The Door"          content:scenes/door.md
//   node table "The Bright Room"  content:scenes/table.md  frag:"the hum" frag:"pale folder"
//
//   door  -> table : walk in
//   table -> door  : leave
//   table => hall  : step through        # => is one-way, locks behind you
//   door  <> table : the door swings     # <> is explicitly two-way
//
// Edge arrows:
//   ->   directed, can be retraversed
//   =>   directed, locks behind you (one-way, permanent)
//   <>   bidirectional
//
// Anything after ':' is the edge label — the action. Edges are actions.
// ---------------------------------------------------------------------------

const EDGE_KINDS = {
  '->': { directed: true, locks: false },
  '=>': { directed: true, locks: true },
  '<>': { directed: false, locks: false },
};

export function parse(text) {
  const nodes = new Map();
  const edges = [];
  const errors = [];

  text.split('\n').forEach((raw, i) => {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) return;

    // node <id> "<title>" [content:<ref>] [frag:"..."]*
    if (line.startsWith('node ')) {
      const rest = line.slice(5).trim();
      const m = rest.match(/^(\S+)\s*(?:"([^"]*)")?\s*(.*)$/);
      if (!m) { errors.push({ line: i + 1, msg: 'bad node', raw }); return; }
      const [, id, title, tail] = m;

      const content = (tail.match(/content:(\S+)/) || [])[1] || null;
      const frags = [...tail.matchAll(/frag:"([^"]*)"/g)].map((f) => f[1]);
      const tags = [...tail.matchAll(/tag:(\S+)/g)].map((t) => t[1]);

      nodes.set(id, {
        id,
        title: title || id,
        content,      // a reference. never the prose itself.
        frags,        // dream vocabulary: short image-like fragments
        tags,
        x: null, y: null, // filled by the canvas, persisted back
      });
      return;
    }

    // <from> <arrow> <to> : <label>
    const em = line.match(/^(\S+)\s*(->|=>|<>)\s*(\S+)\s*(?::\s*(.*))?$/);
    if (em) {
      const [, from, arrow, to, label] = em;
      edges.push({
        from,
        to,
        label: (label || '').trim(),
        ...EDGE_KINDS[arrow],
        arrow,
        trigger: null, // left empty on purpose. fill in when you know.
      });
      return;
    }

    errors.push({ line: i + 1, msg: 'unparsed', raw });
  });

  // edges referencing nodes that don't exist yet are fine to flag, not fatal
  edges.forEach((e) => {
    if (!nodes.has(e.from)) errors.push({ msg: `edge from unknown node: ${e.from}` });
    if (!nodes.has(e.to)) errors.push({ msg: `edge to unknown node: ${e.to}` });
  });

  return { nodes: [...nodes.values()], edges, errors };
}

export function serialise({ nodes, edges }) {
  const out = [];
  nodes.forEach((n) => {
    let l = `node ${n.id} "${n.title}"`;
    if (n.content) l += ` content:${n.content}`;
    n.frags?.forEach((f) => { l += ` frag:"${f}"`; });
    n.tags?.forEach((t) => { l += ` tag:${t}`; });
    out.push(l);
  });
  out.push('');
  edges.forEach((e) => {
    out.push(`${e.from} ${e.arrow} ${e.to}${e.label ? ` : ${e.label}` : ''}`);
  });
  return out.join('\n');
}

// ---------------------------------------------------------------------------
// TRAVERSAL
// ---------------------------------------------------------------------------

export function neighbours(graph, id, { burned = new Set() } = {}) {
  return graph.edges
    .filter((e) => {
      const key = `${e.from}|${e.to}|${e.arrow}`;
      if (burned.has(key)) return false;
      if (e.from === id) return true;
      if (!e.directed && e.to === id) return true;
      return false;
    })
    .map((e) => ({
      edge: e,
      to: e.from === id ? e.to : e.from,
    }));
}

/** A walk in progress. Records path, burns one-way doors behind you. */
export class Walk {
  constructor(graph, start) {
    this.graph = graph;
    this.path = [start];
    this.visited = new Set([start]);
    this.burned = new Set(); // edges that locked behind
  }

  get current() { return this.path[this.path.length - 1]; }

  options() {
    return neighbours(this.graph, this.current, { burned: this.burned });
  }

  step(toId) {
    const opt = this.options().find((o) => o.to === toId);
    if (!opt) return false;
    if (opt.edge.locks) {
      this.burned.add(`${opt.edge.from}|${opt.edge.to}|${opt.edge.arrow}`);
    }
    this.path.push(toId);
    this.visited.add(toId);
    return true;
  }
}

// ---------------------------------------------------------------------------
// DREAMS
// ---------------------------------------------------------------------------
//
// A dream is not authored. It is a function of the walk: it takes fragments
// from the *unvisited frontier* and shows them out of context. The reader
// thinks they are dreaming. They are being navigated.
//
// dreamRadius: 1  → only nodes one edge off the path (a guide)
//              null → anywhere unvisited (a haunting)
//              n    → within n edges
// ---------------------------------------------------------------------------

export function frontier(graph, walk, radius = 1) {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  if (radius === null) {
    return graph.nodes.filter((n) => !walk.visited.has(n.id));
  }

  const found = new Set();
  let layer = [...walk.visited];
  for (let d = 0; d < radius; d++) {
    const next = [];
    layer.forEach((id) => {
      neighbours(graph, id).forEach(({ to }) => {
        if (!walk.visited.has(to) && !found.has(to)) { found.add(to); next.push(to); }
      });
    });
    layer = next;
    if (!layer.length) break;
  }
  return [...found].map((id) => byId.get(id)).filter(Boolean);
}

/**
 * Assemble a dream. Deterministic given a seed, so a walk can be replayed.
 * Returns fragments only — how they're rendered (prose, ANSI, image) is
 * the renderer's business.
 */
export function dream(graph, walk, { radius = 1, count = 5, seed = Date.now() } = {}) {
  const pool = [];
  frontier(graph, walk, radius).forEach((n) => {
    n.frags.forEach((f) => pool.push({ frag: f, from: n.id }));
  });

  // a little of the walked material too — dreams recombine the known
  // with the not-yet-known. that mixture is what makes it feel wrong.
  walk.visited.forEach((id) => {
    const n = graph.nodes.find((x) => x.id === id);
    n?.frags.forEach((f) => pool.push({ frag: f, from: id, seen: true }));
  });

  if (!pool.length) return [];

  let s = seed;
  const rand = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;

  const out = [];
  const used = new Set();
  while (out.length < Math.min(count, pool.length)) {
    const i = Math.floor(rand() * pool.length);
    if (used.has(i)) continue;
    used.add(i);
    out.push(pool[i]);
  }
  return out;
}

// ---------------------------------------------------------------------------
// VALIDATION — the only rule that matters: no end. always a loop.
// ---------------------------------------------------------------------------

export function findDeadEnds(graph) {
  return graph.nodes
    .filter((n) => neighbours(graph, n.id).length === 0)
    .map((n) => n.id);
}

/** Nodes from which you cannot get back to `home`. Loop violations. */
export function findNonReturning(graph, home) {
  const canReach = new Set();
  const reverse = new Map();
  graph.nodes.forEach((n) => reverse.set(n.id, []));
  graph.edges.forEach((e) => {
    reverse.get(e.to)?.push(e.from);
    if (!e.directed) reverse.get(e.from)?.push(e.to);
  });

  const stack = [home];
  while (stack.length) {
    const id = stack.pop();
    if (canReach.has(id)) continue;
    canReach.add(id);
    (reverse.get(id) || []).forEach((p) => stack.push(p));
  }

  return graph.nodes.filter((n) => !canReach.has(n.id)).map((n) => n.id);
}

// ---------------------------------------------------------------------------
// EXPORTS — the graph is content-agnostic, so renderers are cheap.
// ---------------------------------------------------------------------------

export function toJSON(graph) {
  return JSON.stringify(graph, null, 2);
}

/** Twee / Twine. Paste into Twine, or feed a twee compiler. */
export function toTwee(graph, { start } = {}) {
  const out = [];
  if (start) out.push(`:: StoryData\n{\n  "start": "${start}"\n}\n`);
  graph.nodes.forEach((n) => {
    const links = graph.edges
      .filter((e) => e.from === n.id || (!e.directed && e.to === n.id))
      .map((e) => {
        const to = e.from === n.id ? e.to : e.from;
        return `[[${e.label || to}->${to}]]`;
      });
    out.push(`:: ${n.id}`);
    out.push(n.content ? `<!-- content: ${n.content} -->` : '');
    out.push(links.join('\n'));
    out.push('');
  });
  return out.join('\n');
}

/** Neo4j, if you ever want to ask the graph questions. */
export function toCypher(graph) {
  const out = graph.nodes.map(
    (n) => `CREATE (:Node {id:'${n.id}', title:${JSON.stringify(n.title)}, content:${JSON.stringify(n.content)}});`
  );
  graph.edges.forEach((e) => {
    out.push(
      `MATCH (a:Node {id:'${e.from}'}),(b:Node {id:'${e.to}'}) ` +
      `CREATE (a)-[:LEADS_TO {label:${JSON.stringify(e.label)}, locks:${e.locks}, directed:${e.directed}}]->(b);`
    );
  });
  return out.join('\n');
}
