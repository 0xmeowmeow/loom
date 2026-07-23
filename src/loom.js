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

// ---------------------------------------------------------------------------
// NODE TYPES
// ---------------------------------------------------------------------------
//
// Types are ADVISORY, not enforcing. A mismatched connection is drawn as a
// warning, never refused — in a narrative graph the "wrong" edge is often the
// interesting one. Colour is a visual grammar, not a lock.
//
//   accepts: which types this slot likes receiving. '*' = anything.
//   multi:   can this slot hold more than one connection?
// ---------------------------------------------------------------------------

export const TYPES = {
  scene: {
    label: 'Scene', colour: '#ff2f92', glyph: 'S',
    desc: 'A place the reader arrives. Holds prose.',
    inputs:  [{ name: 'from', accepts: ['*'], multi: true }],
    outputs: [{ name: 'to',   accepts: ['*'], multi: true }],
  },
  location: {
    label: 'Location', colour: '#00e0d0', glyph: 'L',
    desc: 'Where something is. Scenes and objects can sit inside it.',
    inputs:  [{ name: 'from',     accepts: ['*'], multi: true }],
    outputs: [{ name: 'to',       accepts: ['location', 'scene', 'dream'], multi: true },
              { name: 'contains', accepts: ['scene', 'object', 'character'], multi: true }],
  },
  character: {
    label: 'Character', colour: '#ffb020', glyph: 'C',
    desc: 'Someone. Attaches to scenes they appear in.',
    inputs:  [{ name: 'knows',    accepts: ['*'], multi: true }],
    outputs: [{ name: 'appears',  accepts: ['scene', 'dream', 'object'], multi: true }],
  },
  lore: {
    label: 'Lore', colour: '#9b6bff', glyph: 'K',
    desc: 'A fact about the world. Feeds anything.',
    inputs:  [{ name: 'from',   accepts: ['lore'], multi: true }],
    outputs: [{ name: 'informs', accepts: ['*'],   multi: true }],
  },
  object: {
    label: 'Object', colour: '#66d96b', glyph: 'O',
    desc: 'A thing. Carries meaning that later acts define.',
    inputs:  [{ name: 'from',   accepts: ['*'], multi: true }],
    outputs: [{ name: 'used_in', accepts: ['scene', 'dream', 'location', 'object'], multi: true }],
  },
  dream: {
    label: 'Dream', colour: '#ff7ac6', glyph: 'D',
    desc: 'Interstitial. Assembled from fragments elsewhere.',
    inputs:  [{ name: 'wakes_from', accepts: ['scene', 'location'], multi: true },
              { name: 'draws',      accepts: ['*'],                 multi: true }],
    outputs: [{ name: 'wakes_to',   accepts: ['scene', 'location'], multi: true }],
  },
  note: {
    label: 'Note', colour: '#7a7a90', glyph: 'N',
    desc: 'For you. Never rendered.',
    inputs:  [{ name: 'from', accepts: ['*'], multi: true }],
    outputs: [{ name: 'to',   accepts: ['*'], multi: true }],
  },
};

export const DEFAULT_TYPE = 'scene';

/** Advisory check: does this connection respect the declared types? */
export function edgeFits(graph, edge) {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const a = byId.get(edge.from), b = byId.get(edge.to);
  if (!a || !b) return true;                    // unknown = don't complain
  const t = TYPES[a.type] || TYPES[DEFAULT_TYPE];
  const outs = t.outputs || [];
  if (!outs.length) return true;
  return outs.some((s) => s.accepts.includes('*') || s.accepts.includes(b.type));
}

export function parse(text) {
  const nodes = new Map();
  const edges = [];
  const errors = [];
  const lexicon = {};
  const meta = {};

  // A line indented with whitespace continues the previous line. Lets a node
  // with many attributes wrap without ceremony.
  const joined = [];
  text.split('\n').forEach((raw) => {
    if (/^\s+\S/.test(raw) && joined.length &&
        !/^\s*#/.test(raw) && joined[joined.length - 1].raw.trim()) {
      joined[joined.length - 1].raw += ' ' + raw.trim();
    } else {
      joined.push({ raw, n: joined.length });
    }
  });

  joined.map((x) => x.raw).forEach((raw, i) => {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) return;

    // palette <name>
    if (line.startsWith('palette ')) { meta.palette = line.slice(8).trim(); return; }

    // let <name> = <value>          -- lexicon binding, may be empty
    if (line.startsWith('let ')) {
      const m = line.slice(4).match(/^([A-Za-z0-9_]+)\s*=\s*(.*)$/);
      if (m) { lexicon[m[1]] = m[2].trim(); return; }
      errors.push({ line: i + 1, msg: 'bad let', raw }); return;
    }

    // node <id> "<title>" [content:<ref>] [frag:"..."]*
    if (line.startsWith('node ')) {
      const rest = line.slice(5).trim();
      const m = rest.match(/^(\S+)\s*(?:"([^"]*)")?\s*(.*)$/);
      if (!m) { errors.push({ line: i + 1, msg: 'bad node', raw }); return; }
      const [, id, title, tail] = m;

      const content = (tail.match(/content:(\S+)/) || [])[1] || null;
      const frags = [...tail.matchAll(/frag:"([^"]*)"/g)].map((f) => f[1]);
      const tags = [...tail.matchAll(/tag:(\S+)/g)].map((t) => t[1]);
      let type = (tail.match(/type:(\S+)/) || [])[1] || DEFAULT_TYPE;
      if (!TYPES[type]) type = DEFAULT_TYPE;
      const shape = (tail.match(/shape:(\S+)/) || [])[1] || null;

      nodes.set(id, {
        id,
        type,
        shape,
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
      // an edge label may carry requirements after '!' :
      //     a -> b : action ! must give the object ! must be a place
      const parts = (label || '').split('!').map((x) => x.trim());
      edges.push({
        from,
        to,
        label: parts[0] || '',
        requires: parts.slice(1).filter(Boolean),
        ...EDGE_KINDS[arrow],
        arrow,
        trigger: null, // left empty on purpose. fill in when you know.
      });
      return;
    }

    errors.push({ line: i + 1, msg: 'unparsed', raw });
  });

  // An edge pointing at an undeclared node CREATES it, empty. The node is
  // topologically real and semantically undescribed. Its position in the graph
  // is fully specified; its identity is not. That is the whole point.
  edges.forEach((e) => {
    [e.from, e.to].forEach((id) => {
      if (!nodes.has(id)) {
        nodes.set(id, {
          id, type: DEFAULT_TYPE, title: id, content: null,
          frags: [], tags: [], empty: true, x: null, y: null,
        });
      }
    });
  });

  return { nodes: [...nodes.values()], edges, errors, lexicon, meta };
}

export function serialise({ nodes, edges, lexicon, meta }) {
  const out = [];
  if (meta && meta.palette) out.push(`palette ${meta.palette}`, '');
  if (lexicon && Object.keys(lexicon).length) {
    Object.entries(lexicon).forEach(([k, v]) => out.push(`let ${k} = ${v}`));
    out.push('');
  }
  nodes.forEach((n) => {
    // a node that was auto-created by an edge and never described doesn't need
    // its own line — the edge will recreate it on the next parse.
    if (n.empty && !n.content && !n.frags.length && n.title === n.id
        && n.type === DEFAULT_TYPE) return;
    let l = `node ${n.id} "${n.title}"`;
    if (n.type && n.type !== DEFAULT_TYPE) l += ` type:${n.type}`;
    if (n.shape) l += ` shape:${n.shape}`;
    if (n.content) l += ` content:${n.content}`;
    n.frags?.forEach((f) => { l += ` frag:"${f}"`; });
    n.tags?.forEach((t) => { l += ` tag:${t}`; });
    out.push(l);
  });
  out.push('');
  edges.forEach((e) => {
    const req = (e.requires || []).map((r) => ` ! ${r}`).join('');
    const lab = e.label || req ? ` : ${e.label || ''}${req}` : '';
    out.push(`${e.from} ${e.arrow} ${e.to}${lab}`);
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


// ---------------------------------------------------------------------------
// LEXICON
// ---------------------------------------------------------------------------
//
//   let hero =            <- declared, unbound. Renders as a placeholder.
//   let hero = Borlu      <- bound. Every {{hero}} becomes Borlu.
//
// Bind late. Change once, changes everywhere. An unbound name is not an error;
// it is a thing you haven't decided yet.
// ---------------------------------------------------------------------------

const VAR = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;

/** Substitute {{vars}}. Unbound names are left visible, not blanked. */
export function expand(str, lexicon = {}) {
  if (!str) return str;
  return String(str).replace(VAR, (m, k) => {
    const v = lexicon[k];
    return (v === undefined || v === '') ? m : v;
  });
}

/** Every variable used anywhere, with where it appears and whether it's bound. */
export function lexiconReport(graph) {
  const used = new Map();
  const note = (name, where) => {
    if (!used.has(name)) used.set(name, { name, bound: false, value: '', uses: [] });
    used.get(name).uses.push(where);
  };
  const scan = (str, where) => {
    if (!str) return;
    let m; VAR.lastIndex = 0;
    while ((m = VAR.exec(str))) note(m[1], where);
  };

  graph.nodes.forEach((n) => {
    scan(n.title, `${n.id}.title`);
    scan(n.content, `${n.id}.content`);
    n.frags.forEach((f, i) => scan(f, `${n.id}.frag[${i}]`));
  });
  graph.edges.forEach((e, i) => {
    scan(e.label, `edge[${i}].action`);
    (e.requires || []).forEach((r) => scan(r, `edge[${i}].requires`));
  });

  // declared-but-never-used still counts
  Object.keys(graph.lexicon || {}).forEach((k) => {
    if (!used.has(k)) used.set(k, { name: k, bound: false, value: '', uses: [] });
  });

  used.forEach((v, k) => {
    const val = (graph.lexicon || {})[k];
    v.value = val ?? '';
    v.bound = val !== undefined && val !== '';
  });
  return [...used.values()].sort((a, b) => a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// EMPTY NODES + REQUIREMENTS
// ---------------------------------------------------------------------------

/** Undescribed nodes: real in the graph, not yet decided. */
export function emptyNodes(graph) {
  return graph.nodes.filter((n) =>
    n.empty || (!n.content && !n.frags.length && n.title === n.id));
}

/** Everything demanded of a node by the edges arriving at it. */
export function requirementsOn(graph, id) {
  const out = [];
  graph.edges.forEach((e) => {
    if (e.to === id || (!e.directed && e.from === id)) {
      (e.requires || []).forEach((r) => out.push({ from: e.from, req: r }));
    }
  });
  return out;
}

/** Every unmet demand in the graph — a to-do list the structure computed. */
export function openRequirements(graph) {
  const empties = new Set(emptyNodes(graph).map((n) => n.id));
  const out = [];
  graph.edges.forEach((e) => {
    (e.requires || []).forEach((r) => {
      if (empties.has(e.to)) out.push({ node: e.to, req: r, from: e.from });
    });
  });
  return out;
}


// ---------------------------------------------------------------------------
// STORY RENDER
// ---------------------------------------------------------------------------
//
// The same object, read the other way. A walk through the graph becomes prose:
// node content in path order, edge actions as the connective tissue between.
// What you read depends on how you travelled — locked doors, visited state and
// dreams all change the text.
// ---------------------------------------------------------------------------

export function renderStory(graph, walk, opts = {}) {
  const { lexicon = graph.lexicon || {}, showActions = true, showDreams = true } = opts;
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const out = [];
  const path = walk ? walk.path : graph.nodes.map((n) => n.id);

  path.forEach((id, i) => {
    const n = byId.get(id);
    if (!n) return;

    out.push({
      kind: 'node',
      id,
      type: n.type,
      title: expand(n.title, lexicon),
      body: n.content ? `[${expand(n.content, lexicon)}]` : '',
      frags: n.frags.map((f) => expand(f, lexicon)),
      empty: !n.content && !n.frags.length && n.title === n.id,
    });

    const next = path[i + 1];
    if (next && showActions) {
      const e = graph.edges.find((x) =>
        (x.from === id && x.to === next) || (!x.directed && x.to === id && x.from === next));
      if (e) out.push({
        kind: 'action',
        id: `${id}->${next}`,
        text: expand(e.label, lexicon) || '\u2014',
        locks: !!e.locks,
        requires: (e.requires || []).map((r) => expand(r, lexicon)),
      });
    }
  });

  if (walk && showDreams) {
    const d = dream(graph, walk, { radius: opts.radius ?? 1, count: 4, seed: path.length * 7919 });
    if (d.length) out.push({
      kind: 'dream',
      id: 'dream',
      frags: d.filter((f) => !f.seen).map((f) => expand(f.frag, lexicon)),
    });
  }
  return out;
}

/** Flat text, for export or print. */
export function storyToText(blocks) {
  return blocks.map((b) => {
    if (b.kind === 'node') {
      const bits = [b.title.toUpperCase()];
      if (b.body) bits.push(b.body);
      b.frags.forEach((f) => bits.push('    ' + f));
      if (b.empty) bits.push('    [undescribed]');
      return bits.join('\n');
    }
    if (b.kind === 'action') return `        \u2192 ${b.text}${b.locks ? ' (locks behind)' : ''}`;
    if (b.kind === 'dream') return `\n~ ${b.frags.join(' / ')} ~`;
    return '';
  }).join('\n\n');
}
