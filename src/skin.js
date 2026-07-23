/**
 * skin.js — shapes, palettes, icons.
 *
 * A shape is a function (W,H) -> { path, ports(dir,i,n) }.
 * Handles are a property of the shape, not of the node — a hexagon puts them
 * on its faces, a diamond on its points, a circle radially.
 */

// ---------------------------------------------------------------------------
// SHAPES
// ---------------------------------------------------------------------------

export const SHAPES = {
  rect: {
    label: 'Rectangle',
    path: (W, H) => `M8,0 H${W - 8} Q${W},0 ${W},8 V${H - 8} Q${W},${H} ${W - 8},${H}
                     H8 Q0,${H} 0,${H - 8} V8 Q0,0 8,0 Z`,
    port: (W, H, dir, i, n) => {
      const top = 26, bot = H - 14;
      const y = n === 1 ? (top + bot) / 2 : top + (bot - top) * i / (n - 1);
      return { x: dir === 'in' ? 0 : W, y };
    },
    textX: 15,
  },

  pill: {
    label: 'Pill',
    path: (W, H) => {
      const r = H / 2;
      return `M${r},0 H${W - r} A${r},${r} 0 0 1 ${W - r},${H} H${r} A${r},${r} 0 0 1 ${r},0 Z`;
    },
    port: (W, H, dir, i, n) => {
      const inset = H * 0.14;
      const top = inset + 14, bot = H - inset - 8;
      const y = n === 1 ? H / 2 : top + (bot - top) * i / (n - 1);
      const dy = Math.abs(y - H / 2) / (H / 2);
      const bulge = (H / 2) * (1 - Math.sqrt(Math.max(0, 1 - dy * dy)));
      return { x: dir === 'in' ? bulge : W - bulge, y };
    },
    textX: 22,
  },

  hex: {
    label: 'Hexagon',
    path: (W, H) => {
      const c = Math.min(26, W * 0.14);
      return `M${c},0 H${W - c} L${W},${H / 2} L${W - c},${H} H${c} L0,${H / 2} Z`;
    },
    port: (W, H, dir, i, n) => {
      const top = 22, bot = H - 12;
      const y = n === 1 ? H / 2 : top + (bot - top) * i / (n - 1);
      const c = Math.min(26, W * 0.14);
      const t = Math.abs(y - H / 2) / (H / 2);
      const inset = c * t;
      return { x: dir === 'in' ? inset : W - inset, y };
    },
    textX: 22,
  },

  diamond: {
    label: 'Diamond',
    path: (W, H) => `M${W / 2},0 L${W},${H / 2} L${W / 2},${H} L0,${H / 2} Z`,
    port: (W, H, dir, i, n) => {
      if (n === 1) return { x: dir === 'in' ? 0 : W, y: H / 2 };
      const spread = H * 0.26;
      const y = H / 2 + (i - (n - 1) / 2) * (spread / Math.max(1, n - 1)) * 2;
      const t = Math.abs(y - H / 2) / (H / 2);
      const inset = (W / 2) * t;
      return { x: dir === 'in' ? inset : W - inset, y };
    },
    textX: 30,
  },

  circle: {
    label: 'Circle',
    path: (W, H) => {
      const r = Math.min(W, H) / 2, cx = W / 2, cy = H / 2;
      return `M${cx - r},${cy} a${r},${r} 0 1,0 ${r * 2},0 a${r},${r} 0 1,0 ${-r * 2},0 Z`;
    },
    port: (W, H, dir, i, n) => {
      const r = Math.min(W, H) / 2, cx = W / 2, cy = H / 2;
      const span = Math.PI * 0.55;
      const base = dir === 'in' ? Math.PI : 0;
      const a = n === 1 ? base : base - span / 2 + span * i / (n - 1);
      return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
    },
    textX: 18,
  },

  torn: {                       // dreams — a wobbling edge
    label: 'Torn',
    path: (W, H) => {
      const w = 5;
      let d = `M6,0 H${W - 6} Q${W},0 ${W},7 `;
      for (let y = 12; y < H - 10; y += 11)
        d += `Q${W + (y % 22 ? w : -w)},${y + 5} ${W},${y + 11} `;
      d += `V${H - 6} Q${W},${H} ${W - 6},${H} H6 Q0,${H} 0,${H - 7} `;
      for (let y = H - 12; y > 10; y -= 11)
        d += `Q${(y % 22 ? -w : w)},${y - 5} 0,${y - 11} `;
      return d + 'V6 Q0,0 6,0 Z';
    },
    port: (W, H, dir, i, n) => {
      const top = 26, bot = H - 14;
      const y = n === 1 ? (top + bot) / 2 : top + (bot - top) * i / (n - 1);
      return { x: dir === 'in' ? 0 : W, y };
    },
    textX: 15,
  },

  doc: {                        // lore — a page with a folded corner
    label: 'Document',
    path: (W, H) => {
      const f = 18;
      return `M0,4 Q0,0 4,0 H${W - f} L${W},${f} V${H - 4} Q${W},${H} ${W - 4},${H}
              H4 Q0,${H} 0,${H - 4} Z`;
    },
    port: (W, H, dir, i, n) => {
      const top = 28, bot = H - 14;
      const y = n === 1 ? (top + bot) / 2 : top + (bot - top) * i / (n - 1);
      return { x: dir === 'in' ? 0 : W, y };
    },
    textX: 15,
  },

  slab: {                       // notes — plain, no rounding
    label: 'Slab',
    path: (W, H) => `M0,0 H${W} V${H} H0 Z`,
    port: (W, H, dir, i, n) => {
      const top = 26, bot = H - 14;
      const y = n === 1 ? (top + bot) / 2 : top + (bot - top) * i / (n - 1);
      return { x: dir === 'in' ? 0 : W, y };
    },
    textX: 13,
  },
};

export const DEFAULT_SHAPES = {
  scene: 'rect', location: 'hex', character: 'pill',
  lore: 'doc', object: 'circle', dream: 'torn', note: 'slab',
};

// ---------------------------------------------------------------------------
// PALETTES
// ---------------------------------------------------------------------------

export const PALETTES = {
  neon: {
    label: '80s Neon',
    bg: '#0a0a0f', panel: '#12121a', panel2: '#171722', line: '#2a2a38',
    ink: '#e8e8f0', dim: '#7a7a90',
    types: { scene:'#ff2f92', location:'#00e0d0', character:'#ffb020',
             lore:'#9b6bff', object:'#66d96b', dream:'#ff7ac6', note:'#7a7a90' },
  },
  paper: {
    label: 'Paper',
    bg: '#f4f1ea', panel: '#fffdf8', panel2: '#efece3', line: '#d6d1c4',
    ink: '#2b2b2b', dim: '#8a8578',
    types: { scene:'#b5322f', location:'#2f6b6b', character:'#a5722a',
             lore:'#5a4a86', object:'#41703f', dream:'#a05080', note:'#8a8578' },
  },
  cold: {
    label: 'Cold Storage',
    bg: '#0d1117', panel: '#151b23', panel2: '#1c232c', line: '#2c3542',
    ink: '#e6edf3', dim: '#7d8590',
    types: { scene:'#79c0ff', location:'#7ee787', character:'#ffa657',
             lore:'#d2a8ff', object:'#a5d6ff', dream:'#ff9bce', note:'#7d8590' },
  },
  ember: {
    label: 'Ember',
    bg: '#140f0d', panel: '#1d1613', panel2: '#251c18', line: '#3a2b24',
    ink: '#f2e6dc', dim: '#8f7a6d',
    types: { scene:'#ff6b35', location:'#f7c59f', character:'#efa00b',
             lore:'#d65108', object:'#c9b458', dream:'#ff9f7a', note:'#8f7a6d' },
  },
  mono: {
    label: 'Monochrome + One',
    bg: '#0b0b0b', panel: '#141414', panel2: '#1c1c1c', line: '#2e2e2e',
    ink: '#eaeaea', dim: '#767676',
    types: { scene:'#ff2f92', location:'#c8c8c8', character:'#a8a8a8',
             lore:'#8e8e8e', object:'#d8d8d8', dream:'#b0b0b0', note:'#6a6a6a' },
  },
  contrast: {
    label: 'High Contrast',
    bg: '#000000', panel: '#0d0d0d', panel2: '#161616', line: '#3d3d3d',
    ink: '#ffffff', dim: '#9d9d9d',
    types: { scene:'#ff0055', location:'#00ffd5', character:'#ffd400',
             lore:'#b26bff', object:'#4dff4d', dream:'#ff6ec7', note:'#bbbbbb' },
  },
};

// ---------------------------------------------------------------------------
// ICONS — inline, no network. A CDN loader can add more at runtime.
// ---------------------------------------------------------------------------

export const ICONS = {
  scene:     'M3 4h18v14H3z M3 9h18 M8 4v14',
  location:  'M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z M12 10.5a2 2 0 1 0 0-.1',
  character: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7',
  lore:      'M4 3h11l5 5v13H4z M15 3v5h5 M8 13h8 M8 17h8',
  object:    'M12 2 3 7v10l9 5 9-5V7z M3 7l9 5 9-5 M12 12v10',
  dream:     'M7 18a4 4 0 0 1 0-8 5 5 0 0 1 9.6-1.6A3.5 3.5 0 1 1 18 18z',
  note:      'M5 3h14v18l-7-4-7 4z',
  fold:      'M6 9l6 6 6-6',
  link:      'M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1',
};

/** Load an icon set from a CDN at runtime. Optional; everything works without it. */
export async function loadIconSet(url, map) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(res.status);
    const txt = await res.text();
    const doc = new DOMParser().parseFromString(txt, 'image/svg+xml');
    let n = 0;
    Object.entries(map || {}).forEach(([key, id]) => {
      const el = doc.getElementById(id) || doc.querySelector(`[id="${id}"]`);
      const p = el?.querySelector('path')?.getAttribute('d');
      if (p) { ICONS[key] = p; n++; }
    });
    return { ok: true, loaded: n };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
