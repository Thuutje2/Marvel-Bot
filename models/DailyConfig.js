const mongoose = require('mongoose');

const dailyConfigSchema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true },
  channelId: { type: String, default: null }, // channel where the questions are posted
});

module.exports = mongoose.model('DailyConfig', dailyConfigSchema);