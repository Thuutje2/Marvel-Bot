/**
 * One-time build script: downloads every character from superheroapi.com,
 * keeps only Marvel, and enriches your curated characters.json with the extra
 * data (image, groups, occupation, base, powerstats ...).
 *
 * Run it from the project root:   node scripts/build_characters.js
 *
 * Needs SUPERHERO_TOKEN in your .env file. The bot itself never calls the API
 * while running, it only reads the JSON files this script writes.
 *
 * Output:
 *   data/marvel_api.json        every Marvel character from the API (cleaned)
 *   data/characters.json        your curated list, enriched (a .bak copy of the
 *                               original is saved the first time)
 */
const fs = require('fs');
const path = require('path');

try {
  require('dotenv').config();
} catch {
  // dotenv not installed: fall back to real environment variables
}

const ROOT = path.resolve(__dirname, '..');
const TOKEN = process.env.SUPERHERO_TOKEN;
const BASE = (process.env.SUPERHERO_API_BASE || 'https://superheroapi.com/api').replace(/\/$/, '');
const MAX_ID = Number(process.env.SUPERHERO_MAX_ID || 731);
const CONCURRENCY = 6;

if (!TOKEN) {
  console.error('SUPERHERO_TOKEN is missing. Add it to your .env file:\nSUPERHERO_TOKEN=your_access_token');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The API uses "null", "-" and "" for missing values
function clean(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') return value;
  const v = value.trim();
  return v === '' || v === '-' || v.toLowerCase() === 'null' ? null : v;
}

function cleanList(list) {
  if (!Array.isArray(list)) return [];
  return list.map(clean).filter(Boolean);
}

function stat(value) {
  const v = clean(value);
  if (v === null) return null; // keep missing stats empty instead of turning them into 0
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// The API docs show "httpss://" in an example; fix that kind of typo
function cleanUrl(url) {
  const u = clean(url);
  return u ? u.replace(/^httpss:\/\//i, 'https://') : null;
}

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

async function fetchCharacter(id) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(`${BASE}/${TOKEN}/${id}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return data.response === 'success' ? data : null;
    } catch (error) {
      if (attempt === 3) {
        console.warn(`  id ${id}: giving up (${error.message})`);
        return null;
      }
      await sleep(500 * attempt);
    }
  }
  return null;
}

function toRecord(raw) {
  const bio = raw.biography || {};
  const look = raw.appearance || {};
  const work = raw.work || {};
  const conn = raw.connections || {};
  const ps = raw.powerstats || {};
  return {
    apiId: Number(raw.id),
    name: clean(raw.name),
    fullName: clean(bio['full-name']),
    alterEgos: clean(bio['alter-egos']),
    aliases: cleanList(bio.aliases),
    placeOfBirth: clean(bio['place-of-birth']),
    firstAppearance: clean(bio['first-appearance']),
    publisher: clean(bio.publisher),
    alignment: clean(bio.alignment),
    gender: clean(look.gender),
    race: clean(look.race),
    occupation: clean(work.occupation),
    base: clean(work.base),
    groups: clean(conn['group-affiliation']),
    image: cleanUrl(raw.image && raw.image.url),
    powerstats: {
      intelligence: stat(ps.intelligence),
      strength: stat(ps.strength),
      speed: stat(ps.speed),
      durability: stat(ps.durability),
      power: stat(ps.power),
      combat: stat(ps.combat),
    },
  };
}

const isMarvel = (record) => /^marvel/i.test(record.publisher || '');

// ---------------------------------------------------------------------------
// 1. Download everything
// ---------------------------------------------------------------------------
async function downloadAll() {
  const ids = Array.from({ length: MAX_ID }, (_, i) => i + 1);
  const results = [];
  let next = 0;
  let done = 0;

  async function worker() {
    while (next < ids.length) {
      const id = ids[next++];
      const raw = await fetchCharacter(id);
      if (raw) results.push(toRecord(raw));
      done++;
      if (done % 50 === 0 || done === ids.length) {
        console.log(`  ${done}/${ids.length} downloaded`);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return results.sort((a, b) => a.apiId - b.apiId);
}

// ---------------------------------------------------------------------------
// 2. Match curated characters to API records
// ---------------------------------------------------------------------------
function findMatch(curated, marvel) {
  // Manual override: put "apiId": 346 on a character in characters.json
  if (curated.apiId) {
    return { record: marvel.find((r) => r.apiId === curated.apiId) || null, ambiguous: false };
  }

  const names = new Set([curated.name, ...(curated.aliases || [])].map(norm));
  const candidates = marvel.filter((r) => names.has(norm(r.name)));

  if (candidates.length === 0) {
    // The API may list the character under another name: try the real name
    const byRealName = curated.fullName
      ? marvel.filter((r) => r.fullName && norm(r.fullName) === norm(curated.fullName))
      : [];
    if (byRealName.length === 0) return { record: null, ambiguous: false };
    return { record: byRealName[0], ambiguous: byRealName.length > 1 };
  }
  if (candidates.length === 1) return { record: candidates[0], ambiguous: false };

  // Several records share the name: prefer the one with the same real name
  const sameFullName = candidates.filter(
    (r) => curated.fullName && norm(r.fullName) && norm(curated.fullName).includes(norm(r.fullName).slice(0, 8))
  );
  if (sameFullName.length >= 1) {
    return { record: sameFullName[0], ambiguous: sameFullName.length > 1 };
  }
  return { record: candidates[0], ambiguous: true };
}

function enrich(curated, record) {
  const extra = {
    apiId: record.apiId,
    image: record.image,
    placeOfBirth: record.placeOfBirth,
    occupation: record.occupation,
    base: record.base,
    groups: record.groups,
    alignment: record.alignment,
    gender: record.gender,
    race: record.race,
    powerstats: record.powerstats,
  };
  const result = { ...curated };
  for (const [key, value] of Object.entries(extra)) {
    if (value !== null && value !== undefined) result[key] = value;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
(async () => {
  const dataDir = path.join(ROOT, 'data');
  fs.mkdirSync(dataDir, { recursive: true });

  // Where is your curated file?
  const curatedPath = [path.join(dataDir, 'characters.json'), path.join(ROOT, 'characters.json')].find(
    fs.existsSync
  );
  if (!curatedPath) {
    console.error('Could not find characters.json. Put it in data/characters.json first.');
    process.exit(1);
  }
  const curated = JSON.parse(fs.readFileSync(curatedPath, 'utf8'));

  console.log(`Downloading ${MAX_ID} characters from the API...`);
  const all = await downloadAll();
  if (all.length === 0) {
    console.error('The API returned no characters. Check your SUPERHERO_TOKEN and try again.');
    process.exit(1);
  }

  const marvel = all.filter(isMarvel);
  fs.writeFileSync(path.join(dataDir, 'marvel_api.json'), JSON.stringify(marvel, null, 2));
  console.log(`\nAPI: ${all.length} characters, ${marvel.length} from Marvel -> data/marvel_api.json`);

  const unmatched = [];
  const ambiguous = [];
  const enriched = curated.map((character) => {
    const { record, ambiguous: isAmbiguous } = findMatch(character, marvel);
    if (!record) {
      unmatched.push(character.name);
      return character;
    }
    if (isAmbiguous) ambiguous.push(`${character.name} -> ${record.name} (id ${record.apiId})`);
    return enrich(character, record);
  });

  const backupPath = `${curatedPath}.bak`;
  if (!fs.existsSync(backupPath)) fs.copyFileSync(curatedPath, backupPath);
  fs.writeFileSync(curatedPath, JSON.stringify(enriched, null, 2));

  console.log(`\nEnriched ${enriched.length - unmatched.length}/${enriched.length} curated characters -> ${path.relative(ROOT, curatedPath)}`);
  if (ambiguous.length) {
    console.log('\nCheck these, several API records matched (add "apiId" to pick the right one):');
    ambiguous.forEach((line) => console.log('  -', line));
  }
  if (unmatched.length) {
    console.log('\nNo match in the API (kept as they were, add "apiId" by hand if you want):');
    unmatched.forEach((name) => console.log('  -', name));
  }
})().catch((error) => {
  console.error('Build failed:', error);
  process.exit(1);
});