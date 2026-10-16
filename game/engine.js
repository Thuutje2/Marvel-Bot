/**
 * Game rules. Returns plain result objects, the commands turn them into messages.
 */
const GameUser = require('../models/GameUser');
const characters = require('./characters');

const COOLDOWN_MS = 15 * 60 * 1000; // wait after a correct guess
const RECENT_LIMIT = 40; // how many recent characters to avoid repeating

const busy = new Set(); // stops one person's double-click from running twice

async function getUser(guildId, userId) {
  return GameUser.findOneAndUpdate(
    { guildId, userId },
    { $setOnInsert: { guildId, userId } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

function shownHints(character, count) {
  return characters.buildHints(character).slice(0, count);
}

async function run(guildId, userId, text) {
  if (!characters.isReady()) return { type: 'notready' };

  const user = await getUser(guildId, userId);
  const now = Date.now();

  if (user.cooldownUntil && user.cooldownUntil.getTime() > now) {
    return { type: 'cooldown', until: user.cooldownUntil };
  }

  const guess = (text || '').trim();

  // "!guess" without a name: show where the round stands
  if (!guess) {
    const current = user.currentCharacterId ? characters.getById(user.currentCharacterId) : null;
    if (current && user.wrongAttempts > 0) {
      return {
        type: 'status',
        attempts: user.wrongAttempts,
        hints: shownHints(current, user.wrongAttempts),
      };
    }
    return { type: 'usage' };
  }

  // Pick the secret character on the first guess of a round
  let character = user.currentCharacterId ? characters.getById(user.currentCharacterId) : null;
  if (!character) {
    character = characters.pickRandom(user.recentIds);
    user.currentCharacterId = character.apiId;
    user.wrongAttempts = 0;
  }

  const attempt = user.wrongAttempts + 1;

  if (characters.matchesGuess(character, guess)) {
    const points = characters.pointsForAttempt(attempt);
    user.points += points;
    user.correct += 1;
    user.streak += 1;
    user.bestStreak = Math.max(user.bestStreak, user.streak);

    const key = String(character.apiId);
    user.guessedCounts.set(key, (user.guessedCounts.get(key) || 0) + 1);

    user.recentIds = [character.apiId, ...user.recentIds].slice(0, RECENT_LIMIT);
    user.currentCharacterId = null;
    user.wrongAttempts = 0;
    user.cooldownUntil = new Date(now + COOLDOWN_MS);
    await user.save();

    return {
      type: 'correct',
      character,
      attempt,
      points,
      streak: user.streak,
      totalPoints: user.points,
      cooldownUntil: user.cooldownUntil,
    };
  }

  // Wrong: the streak resets and the next hint is revealed
  user.wrongAttempts = attempt;
  user.streak = 0;
  await user.save();

  return {
    type: 'wrong',
    attempt,
    hints: shownHints(character, attempt),
    noMoreHints: attempt > characters.buildHints(character).length,
  };
}

async function processGuess(guildId, userId, text) {
  const key = `${guildId}:${userId}`;
  if (busy.has(key)) return { type: 'busy' };
  busy.add(key);
  try {
    return await run(guildId, userId, text);
  } finally {
    busy.delete(key);
  }
}

// Is this the character the user is guessing right now? (used to avoid spoilers)
async function isCurrentCharacter(guildId, userId, apiId) {
  const user = await GameUser.findOne({ guildId, userId });
  return Boolean(user && user.currentCharacterId === apiId);
}

module.exports = { processGuess, isCurrentCharacter, COOLDOWN_MS };