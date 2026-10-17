const { query } = require('../database');

// Returns { guildId, channelId } or null
async function get(guildId) {
  const [rows] = await query('SELECT guild_id, channel_id FROM daily_config WHERE guild_id = ?', [guildId]);
  if (rows.length === 0) return null;
  return { guildId: rows[0].guild_id, channelId: rows[0].channel_id };
}

// Saves the channel for the daily questions (creates the row if needed)
async function setChannel(guildId, channelId) {
  await query(
    'INSERT INTO daily_config (guild_id, channel_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE channel_id = ?',
    [guildId, channelId, channelId]
  );
}

module.exports = { get, setChannel };