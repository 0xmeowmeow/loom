import { parse, serialise, Walk, dream, findDeadEnds, findNonReturning, toTwee } from '../src/loom.js';
let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok  ' : ' FAIL ') + m); if (!c) fails++; };

const g = parse(`
node a "A" frag:"alpha"
node b "B" frag:"beta"
node c "C" frag:"gamma"
a <> b : cross
b => c : one way
c -> a : loop back
`);
ok(g.nodes.length === 3, 'parses 3 nodes');
ok(g.edges.length === 3, 'parses 3 edges');
ok(g.errors.length === 0, 'no parse errors');
ok(findDeadEnds(g).length === 0, 'no dead ends');
ok(findNonReturning(g, 'a').length === 0, 'everything returns to a');

const w = new Walk(g, 'a');
ok(w.options().length === 1, 'a has one exit');
w.step('b'); w.step('c');
ok(!w.options().some(o => o.to === 'b'), 'one-way door burned behind');
ok(w.path.join('') === 'abc', 'path recorded');

const d = dream(g, w, { radius: null, count: 3, seed: 1 });
ok(d.length > 0, 'dream produces fragments');
ok(parse(serialise(g)).edges.length === 3, 'serialise round-trips');
ok(toTwee(g).includes(':: a'), 'twee export');

console.log(fails ? `\n${fails} failed` : '\nall passed');
process.exit(fails ? 1 : 0);
