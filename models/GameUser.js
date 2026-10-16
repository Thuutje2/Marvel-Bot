const mongoose = require('mongoose');

const gameUserSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  userId: { type: String, required: true },

  points: { type: Number, default: 0 },
  correct: { type: Number, default: 0 }, // total correct guesses
  streak: { type: Number, default: 0 }, // correct in a row, resets on a wrong guess
  bestStreak: { type: Number, default: 0 },

  // The round in progress
  currentCharacterId: { type: Number, default: null }, // apiId of the secret character
  wrongAttempts: { type: Number, default: 0 }, // wrong guesses on that character

  cooldownUntil: { type: Date, default: null },
  recentIds: { type: [Number], default: [] }, // recently guessed, to avoid repeats
  guessedCounts: { type: Map, of: Number, default: {} }, // apiId -> times guessed right
});

gameUserSchema.index({ guildId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model('GameUser', gameUserSchema);