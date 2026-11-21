// Core puzzle logic (carried over from the original edition).
function validOrder(value, ids) {
    return Array.isArray(value) && value.length === ids.length && new Set(value).size === ids.length && value.every(id => typeof id === 'string' && ids.includes(id));
}
function moveCard(order, id, target) {
    if (!order.includes(id) || !Number.isInteger(target) || target < 0 || target >= order.length)
        throw new Error('Invalid card position');
    const next = order.filter(x => x !== id);
    next.splice(target, 0, id);
    return next;
}
function scoreOrder(order, correct) {
    if (!validOrder(order, correct))
        throw new Error('Invalid puzzle order');
    let pairs = 0;
    for (let i = 0; i < order.length; i++)
        for (let j = i + 1; j < order.length; j++)
            if (correct.indexOf(order[i]) < correct.indexOf(order[j]))
                pairs++;
    return { pairs, total: correct.length * (correct.length - 1) / 2, exact: order.filter((id, i) => id === correct[i]).length };
}

function freshGame(initialOrder) {
    return {
        order: [...initialOrder],
        submitted: false,
        heard: [],
        notesByExcerptId: {},
    };
}
function restoreGame(raw, initialOrder) {
    const empty = freshGame(initialOrder);
    if (!raw || typeof raw !== 'object')
        return empty;
    const s = raw;
    if (!validOrder(s.order, initialOrder) || typeof s.submitted !== 'boolean')
        return empty;
    const notes = s.notesByExcerptId && typeof s.notesByExcerptId === 'object'
        ? s.notesByExcerptId
        : {};
    return {
        order: s.order,
        submitted: s.submitted,
        heard: Array.isArray(s.heard)
            ? s.heard.filter((id) => initialOrder.includes(id))
            : [],
        notesByExcerptId: Object.fromEntries(initialOrder
            .filter((id) => typeof notes[id] === 'string')
            .map((id) => [id, notes[id].slice(0, 500)])),
    };
}
function setNote(game, id, note) {
    if (game.submitted || !game.order.includes(id))
        return game;
    return {
        ...game,
        notesByExcerptId: { ...game.notesByExcerptId, [id]: note.slice(0, 500) },
    };
}
const composerFromSearch = (search) => new URLSearchParams(search).get('composer') === 'beethoven'
    ? 'beethoven'
    : 'brahms';
const resultLink = (origin, composer) => `${origin}/?composer=${composer}`;

const modeKey = (m) => m.kind === 'composer' ? m.composerId : m.kind;
const periods = ['early', 'middle', 'late'];
const families = ['solo-keyboard', 'chamber', 'orchestral'];
const familyLabel = (f) => ({
    'solo-keyboard': 'Solo piano',
    chamber: 'Chamber ensemble',
    orchestral: 'Orchestra',
})[f];
function resolveExcerpts(c, d) {
    if (c.version !== d.catalogVersion)
        throw Error('This catalog version is unavailable.');
    return d.excerpts.map((ref) => {
        const e = c.excerpts.find((e) => e.id === ref.id && e.version === ref.version);
        if (!e)
            throw Error('An excerpt version in this set is unavailable.');
        return e;
    });
}
function strictSet(c, es, mode) {
    if (es.length !== 6)
        return false;
    const ws = es.map((e) => c.works.find((w) => w.id === e.workId));
    if (ws.some((w) => !w))
        return false;
    const works = ws;
    if (new Set(works.map((w) => w.id)).size !== 6 ||
        new Set(works.map((w) => w.year)).size !== 6)
        return false;
    if (mode.kind === 'composer')
        return (works.every((w) => w.composerId === mode.composerId) &&
            periods.every((p) => works.filter((w) => w.period === p).length === 2));
    const ids = [...new Set(works.map((w) => w.composerId))];
    return (ids.length === 2 &&
        ids.every((id) => periods.every((p) => works.filter((w) => w.composerId === id && w.period === p).length ===
            1)));
}
function varied(es) {
    return (new Set(es.map((e) => e.family)).size >= 2 &&
        families.every((f) => es.filter((e) => e.family === f).length <= 4));
}
const pools = new WeakMap();
function validSelections(c, mode) {
    let cache = pools.get(c);
    if (!cache) {
        cache = new Map();
        pools.set(c, cache);
    }
    const key = modeKey(mode), cached = cache.get(key);
    if (cached)
        return cached;
    // One editorial default per work; alternate recordings never multiply odds.
    const defaults = c.works
        .map((w) => c.excerpts.find((e) => e.workId === w.id))
        .filter((e) => !!e);
    const byId = new Map(c.works.map((w) => [w.id, w]));
    const eligible = c.composers.filter((composer) => periods.every((p) => defaults.some((e) => {
        const w = byId.get(e.workId);
        return w.composerId === composer.id && w.period === p;
    })));
    const composerGroups = mode.kind === 'composer'
        ? [[mode.composerId]]
        : eligible.flatMap((a, i) => eligible.slice(i + 1).map((b) => [a.id, b.id]));
    const result = [];
    for (const ids of composerGroups) {
        const groups = ids.flatMap((id) => periods.map((p) => defaults.filter((e) => {
            const w = byId.get(e.workId);
            return w.composerId === id && w.period === p;
        })));
        const choices = groups.map((g) => mode.kind === 'mixed'
            ? g.map((e) => [e])
            : g.flatMap((e, i) => g.slice(i + 1).map((f) => [e, f])));
        const strict = [], balanced = [];
        function visit(i, selected, years) {
            if (i === choices.length) {
                strict.push(selected);
                if (varied(selected))
                    balanced.push(selected);
                return;
            }
            for (const choice of choices[i]) {
                const next = new Set(years);
                for (const e of choice)
                    next.add(byId.get(e.workId).year);
                if (next.size === selected.length + choice.length)
                    visit(i + 1, [...selected, ...choice], next);
            }
        }
        visit(0, [], new Set());
        // Feasibility is assessed per composer or composer pair, before novelty.
        // A sparse repertoire must never force a different composer or an arrangement.
        result.push(...(balanced.length ? balanced : strict));
    }
    cache.set(key, result);
    return result;
}
function validSet(c, es, mode) {
    if (!strictSet(c, es, mode))
        return false;
    if (varied(es))
        return true;
    const ids = new Set(es.map((e) => c.works.find((w) => w.id === e.workId).composerId));
    return !validSelections(c, mode).some((candidate) => varied(candidate) &&
        candidate.every((e) => ids.has(c.works.find((w) => w.id === e.workId).composerId)));
}
const signature = (ids) => [...ids].sort().join('|');
function seededRandom(seed) {
    return () => {
        seed |= 0;
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
function generateDefinition(c, mode, familiarity, history, random = Math.random, id = crypto.randomUUID(), now = Date.now()) {
    const pool = validSelections(c, mode);
    if (!pool.length)
        throw Error('This repertoire cannot produce a balanced set.');
    const recent = [...history].sort((a, b) => b.createdAt - a.createdAt);
    const used = new Map();
    for (const h of history) {
        const s = signature(h.workIds);
        used.set(s, (used.get(s) || 0) + 1);
    }
    const unused = pool.filter((es) => !used.has(signature(es.map((e) => e.workId))));
    // Exhaustion starts another cycle; an immediate identical repeat is still
    // forbidden whenever any other valid set exists.
    const candidates = unused.length
        ? unused
        : pool.filter((es) => pool.length === 1 ||
            signature(es.map((e) => e.workId)) !==
                signature(recent[0]?.workIds || []));
    let best = null, chosen = candidates[0], tied = 0;
    for (const es of candidates) {
        const ids = es.map((e) => e.workId);
        const rank = [
            -ids.filter((id) => !familiarity[id]?.heard && !familiarity[id]?.revealed)
                .length,
            -new Set(es.map((e) => e.family)).size,
            recent
                .slice(0, 5)
                .reduce((n, h) => n + ids.filter((id) => h.workIds.includes(id)).length, 0),
            ids.reduce((n, id) => n + (familiarity[id]?.plays || 0), 0),
        ];
        const difference = best ? rank.findIndex((v, i) => v !== best[i]) : 0;
        if (!best || (difference >= 0 && rank[difference] < best[difference])) {
            best = rank;
            chosen = es;
            tied = 1;
        }
        else if (difference === -1 && random() < 1 / ++tied)
            chosen = es;
    }
    const initialOrder = chosen.map((e) => e.id);
    for (let i = 5; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [initialOrder[i], initialOrder[j]] = [initialOrder[j], initialOrder[i]];
    }
    return {
        id,
        catalogVersion: c.version,
        mode,
        createdAt: now,
        excerpts: chosen.map(({ id, version }) => ({ id, version })),
        initialOrder,
    };
}
function validateCatalog(c) {
    const fail = (s) => {
        throw Error(s);
    };
    if (new Set(c.composers.map((x) => x.id)).size !== c.composers.length ||
        new Set(c.works.map((x) => x.id)).size !== c.works.length ||
        new Set(c.excerpts.map((x) => `${x.id}@${x.version}`)).size !==
            c.excerpts.length)
        fail('Duplicate catalog IDs');
    for (const w of c.works) {
        if (!c.composers.some((x) => x.id === w.composerId) ||
            !periods.includes(w.period) ||
            !Number.isInteger(w.year) ||
            !w.source.startsWith('https://') ||
            !w.story ||
            !w.title)
            fail(`Invalid work: ${w.id}`);
        if (!c.excerpts.some((e) => e.workId === w.id))
            fail(`No recording: ${w.id}`);
    }
    for (const e of c.excerpts) {
        if (!c.works.some((w) => w.id === e.workId) ||
            !families.includes(e.family) ||
            e.excerptDuration !== 25 ||
            e.excerptStart < 0 ||
            !Number.isInteger(e.version) ||
            e.version < 1)
            fail(`Invalid excerpt: ${e.id}`);
        for (const v of [
            e.performer,
            e.sourcePage,
            e.audioSource,
            e.license,
            e.licenseUrl,
            e.clipLicense,
            e.modifications,
            e.checked,
            e.audioPath,
        ])
            if (!v)
                fail(`Missing recording metadata: ${e.id}`);
    }
    for (const composer of c.composers)
        if (!validSelections(c, { kind: 'composer', composerId: composer.id }).length)
            fail(`Unsatisfiable composer: ${composer.id}`);
    if (c.composers.length > 1 && !validSelections(c, { kind: 'mixed' }).length)
        fail('Unsatisfiable mixed library');
}

const COLLECTION_KEY = 'musical-flashbacks:collection-v2';
const emptyCollection = () => ({
    version: 2,
    definitions: [],
    attempts: {},
    familiarity: {},
    latest: {},
});
function validateDefinition(raw, catalogs) {
    if (!raw || typeof raw !== 'object')
        throw Error('Invalid set link.');
    const d = raw;
    if (typeof d.id !== 'string' ||
        !d.id ||
        !Number.isFinite(d.createdAt) ||
        !d.mode ||
        !['composer', 'mixed', 'orchestral', 'custom'].includes(d.mode.kind) ||
        !Array.isArray(d.excerpts))
        throw Error('Invalid set definition.');
    const mode = d.mode;
    const c = catalogs[d.catalogVersion];
    if (!c)
        throw Error('This set uses a catalog version that is not available here.');
    if (mode.kind === 'composer' &&
        !c.composers.some((x) => x.id === mode.composerId))
        throw Error('Unknown composer.');
    const es = resolveExcerpts(c, d);
    const n = es.length;
    if (n < 4 || n > 14 ||
        new Set(es.map((e) => e.workId)).size !== n ||
        new Set(es.map((e) => c.works.find((w) => w.id === e.workId).year))
            .size !== n ||
        !validOrder(d.initialOrder, es.map((e) => e.id)))
        throw Error('This set needs distinct works, years, and excerpt labels.');
    if (mode.kind === 'composer' &&
        es.some((e) => c.works.find((w) => w.id === e.workId).composerId !== mode.composerId))
        throw Error('The composer does not match the excerpts.');
    return {
        id: d.id,
        catalogVersion: d.catalogVersion,
        createdAt: d.createdAt,
        mode: d.mode.kind !== 'composer'
            ? { kind: d.mode.kind }
            : { kind: 'composer', composerId: d.mode.composerId },
        excerpts: es.map(({ id, version }) => ({ id, version })),
        initialOrder: [...d.initialOrder],
        ...(d.legacy ? { legacy: true } : {}),
    };
}
// Only public definition fields are encoded. No attempt, note, score, or history.
function encodeSet(d) {
    const json = JSON.stringify([
        1,
        d.catalogVersion,
        d.mode.kind === 'mixed' ? '*' : d.mode.kind === 'orchestral' ? '~' : d.mode.kind === 'custom' ? '+' : d.mode.composerId,
        d.excerpts.map((e) => [e.id, e.version]),
        d.initialOrder.map((id) => d.excerpts.findIndex((e) => e.id === id)),
    ]);
    return btoa(Array.from(new TextEncoder().encode(json), (b) => String.fromCharCode(b)).join(''))
        .replaceAll('+', '-')
        .replaceAll('/', '_')
        .replace(/=+$/, '');
}
function decodeSet(token, catalogs, id = crypto.randomUUID(), now = Date.now()) {
    if (token.length > 5000 || !/^[A-Za-z0-9_-]+$/.test(token))
        throw Error('This set link is malformed.');
    try {
        const values = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(atob(token.replaceAll('-', '+').replaceAll('_', '/')), (c) => c.charCodeAt(0))));
        if (!Array.isArray(values) || values.length !== 5 || values[0] !== 1)
            throw Error('Unsupported link format.');
        const [, catalogVersion, mode, refs, order] = values;
        if (typeof mode !== 'string' ||
            !Array.isArray(refs) ||
            refs.length < 4 || refs.length > 14 ||
            !Array.isArray(order) ||
            order.length !== refs.length ||
            !order.every((n) => Number.isInteger(n) && n >= 0 && n < refs.length) ||
            !refs.every((r) => Array.isArray(r) &&
                r.length === 2 &&
                typeof r[0] === 'string' &&
                Number.isInteger(r[1])))
            throw Error('Invalid excerpt list.');
        return validateDefinition({
            id,
            createdAt: now,
            catalogVersion,
            mode: mode === '*'
                ? { kind: 'mixed' }
                : mode === '~'
                    ? { kind: 'orchestral' }
                    : mode === '+'
                    ? { kind: 'custom' }
                    : { kind: 'composer', composerId: mode },
            excerpts: refs.map(([id, version]) => ({ id, version })),
            initialOrder: order.map((i) => refs[i][0]),
        }, catalogs);
    }
    catch (e) {
        throw Error(e instanceof Error && e.message.includes('catalog version')
            ? e.message
            : 'This set link is malformed or references an unavailable excerpt.');
    }
}
const shareLink = (origin, d) => `${origin}/?set=${encodeSet(d)}`;
function addDefinition(s, d) {
    return s.definitions.some((x) => x.id === d.id)
        ? s
        : {
            ...s,
            definitions: [...s.definitions, d],
            attempts: { ...s.attempts, [d.id]: freshGame(d.initialOrder) },
        };
}
function updateAttempt(s, d, g, c) {
    const previous = s.attempts[d.id] || freshGame(d.initialOrder);
    const familiarity = { ...s.familiarity };
    for (const e of resolveExcerpts(c, d)) {
        const old = familiarity[e.workId] || {
            heard: false,
            revealed: false,
            plays: 0,
        };
        const heard = g.heard.includes(e.id), justHeard = heard && !previous.heard.includes(e.id);
        familiarity[e.workId] = {
            heard: old.heard || heard,
            revealed: old.revealed || g.submitted,
            plays: old.plays + Number(justHeard),
        };
    }
    return { ...s, attempts: { ...s.attempts, [d.id]: g }, familiarity };
}
function restoreCollection(raw, catalogs) {
    if (!raw || typeof raw !== 'object' || raw.version !== 2)
        return emptyCollection();
    const r = raw, s = emptyCollection();
    for (const candidate of Array.isArray(r.definitions) ? r.definitions : []) {
        try {
            const d = validateDefinition(candidate, catalogs);
            if (s.definitions.some((x) => x.id === d.id))
                continue;
            s.definitions.push(d);
            s.attempts[d.id] = restoreGame(r.attempts?.[d.id], d.initialOrder);
        }
        catch {
            /* One damaged definition must not discard other saved puzzles. */
        }
    }
    if (r.familiarity && typeof r.familiarity === 'object')
        for (const [id, f] of Object.entries(r.familiarity)) {
            if (f && typeof f === 'object')
                s.familiarity[id] = {
                    heard: f.heard === true,
                    revealed: f.revealed === true,
                    plays: Number.isSafeInteger(f.plays) && f.plays >= 0 ? f.plays : 0,
                };
        }
    if (r.latest && typeof r.latest === 'object')
        for (const [mode, id] of Object.entries(r.latest))
            if (s.definitions.some((d) => d.id === id))
                s.latest[mode] = id;
    // Recover familiarity from attempts too, without counting plays twice.
    for (const d of s.definitions)
        for (const e of resolveExcerpts(catalogs[d.catalogVersion], d)) {
            const old = s.familiarity[e.workId] || {
                heard: false,
                revealed: false,
                plays: 0,
            }, g = s.attempts[d.id];
            s.familiarity[e.workId] = {
                heard: old.heard || g.heard.includes(e.id),
                revealed: old.revealed || g.submitted,
                plays: Math.max(old.plays, Number(g.heard.includes(e.id))),
            };
        }
    return s;
}
function selectionHistory(s, catalogs) {
    return s.definitions.map((d) => ({
        createdAt: d.createdAt,
        workIds: resolveExcerpts(catalogs[d.catalogVersion], d).map((e) => e.workId),
    }));
}
function findShared(s, d) {
    return s.definitions.find((x) => encodeSet(x) === encodeSet(d));
}
function migrateLegacy(s, c, legacy, read) {
    for (const p of legacy) {
        const id = `legacy-${p.id}`;
        if (s.definitions.some((d) => d.id === id))
            continue;
        let raw;
        try {
            const saved = read('musical-flashbacks:' + p.id);
            if (!saved)
                continue;
            raw = JSON.parse(saved);
        }
        catch {
            continue;
        }
        if (!raw || typeof raw !== 'object')
            continue;
        const game = restoreGame(raw, p.initialOrder);
        const convert = (id) => `${p.slug}-${id}-recording`;
        const initialOrder = p.initialOrder.map(convert);
        const d = {
            id,
            catalogVersion: c.version,
            createdAt: 0,
            mode: { kind: 'composer', composerId: p.slug },
            initialOrder,
            excerpts: initialOrder.map((id) => ({ id, version: 1 })),
            legacy: true,
        };
        resolveExcerpts(c, d);
        s = addDefinition(s, d);
        s = updateAttempt(s, d, {
            ...game,
            order: game.order.map(convert),
            heard: game.heard.map(convert),
            notesByExcerptId: Object.fromEntries(Object.entries(game.notesByExcerptId).map(([id, note]) => [
                convert(id),
                note,
            ])),
        }, c);
        s = { ...s, latest: { ...s.latest, [p.slug]: id } };
    }
    return s;
}


