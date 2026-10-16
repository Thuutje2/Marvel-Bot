/**
 * Character data for the guessing game.
 * Reads data/marvel_api.json (made by scripts/build_characters.js) and, if it
 * exists, data/characters.json (your curated list) for extra accepted names.
 */
const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
// 'all'     = every Marvel character from the API that has enough info for hints
// 'curated' = only the characters that are also in your curated characters.json
const POOL_MODE = 'all';
// A character needs at least this many of: affiliation, first appearance,
// occupation, base, otherwise there are too few hints to make a fair round.
const MIN_HINT_FIELDS = 2;
// Points for guessing right on attempt 1, 2, 3 ... (attempts after this give 0)
const POINTS = [50, 40, 30, 20, 10, 5];
const MAX_HINTS = POINTS.length;

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = process.env.GAME_DATA_DIR || path.join(ROOT, 'data');

function readJson(...files) {
  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (error) {
      console.error(`Could not read ${file}: ${error.message}`);
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------
const marvel = readJson(path.join(DATA_DIR, 'marvel_api.json')) || [];
const curated =
  readJson(path.join(DATA_DIR, 'characters.json'), path.join(ROOT, 'characters.json')) || [];

const curatedByApiId = new Map(curated.filter((c) => c.apiId).map((c) => [c.apiId, c]));

// Lowercase, no accents, only letters and digits: "Spider-Man" -> "spiderman"
const norm = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]/g, '');

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const all = marvel
  .filter((r) => r && r.name)
  .map((r) => ({ ...r, extra: curatedByApiId.get(r.apiId) || null }))
  .sort((a, b) => a.apiId - b.apiId);

const byId = new Map(all.map((c) => [c.apiId, c]));

// ---------------------------------------------------------------------------
// Which names count as a correct guess
// ---------------------------------------------------------------------------
const acceptedCache = new Map();

function acceptedNames(c) {
  if (acceptedCache.has(c.apiId)) return acceptedCache.get(c.apiId);

  const names = new Set();
  const add = (s) => {
    const n = norm(s);
    if (n.length >= 2) names.add(n);
  };

  add(c.name);
  add(c.name.replace(/\(.*?\)/g, '')); // "Captain Marvel (Mar-Vell)" -> "Captain Marvel"
  add(c.name.replace(/\s+(II|III|IV|V)$/i, '')); // "Hulk II" -> "Hulk"
  add(c.name.replace(/^the\s+/i, ''));
  if (c.fullName) add(c.fullName); // "Tony Stark"
  if (c.extra) {
    add(c.extra.name);
    (c.extra.aliases || []).forEach(add);
  }

  acceptedCache.set(c.apiId, names);
  return names;
}

// norm(name) -> characters, for !ci lookups
const nameIndex = new Map();
for (const c of all) {
  for (const n of acceptedNames(c)) {
    if (!nameIndex.has(n)) nameIndex.set(n, []);
    nameIndex.get(n).push(c);
  }
}

function matchesGuess(character, guess) {
  const g = norm(guess);
  return g.length >= 2 && acceptedNames(character).has(g);
}

// Best match for a typed name (used by !ci)
function findCharacter(query) {
  const q = norm(query);
  if (!q) return null;
  const exact = all.find((c) => norm(c.name) === q);
  if (exact) return exact;
  const viaName = nameIndex.get(q);
  if (viaName) return viaName[0];
  const partial = all.filter((c) => norm(c.name).includes(q));
  return partial.length === 1 ? partial[0] : null;
}

// Names that contain the typed text, to suggest when nothing matched
function searchCharacters(query, limit = 5) {
  const q = norm(query);
  if (!q) return [];
  return all.filter((c) => norm(c.name).includes(q)).slice(0, limit);
}

// ---------------------------------------------------------------------------
// The pool of characters that can be picked for a round
// ---------------------------------------------------------------------------
const hasEnoughInfo = (c) =>
  [c.groups, c.firstAppearance, c.occupation, c.base].filter(Boolean).length >= MIN_HINT_FIELDS;

const pool = all.filter((c) => hasEnoughInfo(c) && (POOL_MODE === 'all' || c.extra));

if (all.length === 0) {
  console.error(
    `Guess game: no characters found in ${path.join(DATA_DIR, 'marvel_api.json')}. ` +
      'Run "node scripts/build_characters.js" first.'
  );
} else {
  console.log(`Guess game: ${pool.length} characters in the pool (${all.length} loaded, mode "${POOL_MODE}").`);
}

function pickRandom(excludeIds = []) {
  const excluded = new Set(excludeIds);
  let options = pool.filter((c) => !excluded.has(c.apiId));
  if (options.length === 0) options = pool;
  return options[Math.floor(Math.random() * options.length)];
}

// ---------------------------------------------------------------------------
// Hints
// ---------------------------------------------------------------------------
// Hide the character's own name inside a hint ("Incredible Hulk #1")
function mask(text, c) {
  const tokens = new Set();
  for (const full of [c.name, c.fullName].filter(Boolean)) {
    tokens.add(full.replace(/\(.*?\)/g, '').trim());
    for (const part of full.split(/[\s\-_/]+/)) {
      if (part.replace(/[^a-z]/gi, '').length >= 4) tokens.add(part);
    }
  }
  let out = String(text);
  for (const token of [...tokens].filter(Boolean).sort((a, b) => b.length - a.length)) {
    out = out.replace(new RegExp(escapeRegExp(token), 'gi'), '█████');
  }
  return out;
}

// "Iron Man" -> "I _ _ _   M _ _  (7 letters)"
function nameShape(name) {
  const clean = name.replace(/\(.*?\)/g, '').trim();
  const letters = clean.replace(/[^a-z0-9]/gi, '').length;
  const shape = clean
    .split(' ')
    .map((word) =>
      word
        .split('')
        .map((ch, i) => (/[a-z0-9]/i.test(ch) ? (i === 0 ? ch.toUpperCase() : '_') : ch))
        .join(' ')
    )
    .join('   ');
  return `\`${shape}\` (${letters} letters)`;
}

const STAT_LABELS = {
  intelligence: 'INT',
  strength: 'STR',
  speed: 'SPD',
  durability: 'DUR',
  power: 'POW',
  combat: 'CMB',
};

// At most MAX_HINTS hints, vague first, the name pattern always last
function buildHints(c) {
  const candidates = [];

  const ps = c.powerstats || {};
  const stats = Object.entries(STAT_LABELS)
    .filter(([key]) => ps[key] !== null && ps[key] !== undefined)
    .map(([key, label]) => `${label} ${ps[key]}`);
  if (stats.length) candidates.push(`**Powerstats:** ${stats.join(' • ')}`);

  const profile = [c.gender, c.race, c.alignment ? `${c.alignment} alignment` : null].filter(Boolean);
  if (profile.length) candidates.push(`**Profile:** ${profile.join(', ')}`);

  if (c.occupation) candidates.push(`**Occupation:** ${mask(c.occupation, c)}`);

  const where = [c.base && `based in ${c.base}`, c.placeOfBirth && `born in ${c.placeOfBirth}`].filter(Boolean);
  if (where.length) candidates.push(`**Where:** ${mask(where.join(', '), c)}`);

  if (c.groups) candidates.push(`**Affiliation:** ${mask(c.groups, c)}`);
  if (c.firstAppearance) candidates.push(`**First appearance:** ${mask(c.firstAppearance, c)}`);

  const hints = candidates.slice(-(MAX_HINTS - 1));
  hints.push(`**Name:** ${nameShape(c.name)}`);
  return hints.map((h) => (h.length > 900 ? `${h.slice(0, 899)}…` : h));
}

const pointsForAttempt = (attempt) => POINTS[attempt - 1] ?? 0;

module.exports = {
  POINTS,
  MAX_HINTS,
  isReady: () => pool.length > 0,
  poolSize: () => pool.length,
  getById: (id) => byId.get(id) || null,
  pickRandom,
  matchesGuess,
  findCharacter,
  searchCharacters,
  buildHints,
  pointsForAttempt,
  norm,
};