const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const GameUser = require('../../models/GameUser');

const MEDALS = ['🥇', '🥈', '🥉'];

async function buildLeaderboard(guildId, sort) {
  const byStreak = sort === 'streak';
  const rows = await GameUser.find({ guildId, correct: { $gt: 0 } })
    .sort(byStreak ? { bestStreak: -1, points: -1 } : { points: -1, correct: -1 })
    .limit(10);

  const embed = new EmbedBuilder()
    .setColor(0xed1d24)
    .setTitle(byStreak ? 'Leaderboard: longest streak' : 'Leaderboard: most points');

  if (rows.length === 0) {
    embed.setDescription('Nobody has guessed a character yet. Be the first with `!guess <name>`!');
    return embed;
  }

  embed.setDescription(
    rows
      .map((u, i) => {
        const place = MEDALS[i] ?? `**${i + 1}.**`;
        return byStreak
          ? `${place} <@${u.userId}> • best streak **${u.bestStreak}** • ${u.points} pts`
          : `${place} <@${u.userId}> • **${u.points}** pts • ${u.correct} correct • best streak ${u.bestStreak}`;
      })
      .join('\n')
  );
  embed.setFooter({ text: byStreak ? 'Sorted by longest streak' : 'Sorted by points' });
  return embed;
}

module.exports = {
  name: 'glb',
  category: 'Marvel Game',
  usage: ['/glb [sort]', '!glb', '!glb streak'],
  description: 'Show the top 10 players, by points or by longest streak.',

  data: new SlashCommandBuilder()
    .setName('glb')
    .setDescription('Show the guessing game leaderboard.')
    .addStringOption((o) =>
      o
        .setName('sort')
        .setDescription('What to sort by')
        .addChoices({ name: 'Points', value: 'points' }, { name: 'Longest streak', value: 'streak' })
    ),

  // Prefix command: !glb [points|streak]
  async execute(message, args) {
    if (!message.guild) return;
    const embed = await buildLeaderboard(message.guild.id, (args[0] || '').toLowerCase());
    return message.reply({ embeds: [embed], allowedMentions: { parse: [], repliedUser: false } });
  },

  // Slash command: /glb [sort]
  async executeSlash(interaction) {
    if (!interaction.guild) {
      return interaction.reply({ content: 'This command only works in a server.', flags: MessageFlags.Ephemeral });
    }
    const embed = await buildLeaderboard(interaction.guild.id, interaction.options.getString('sort'));
    return interaction.reply({ embeds: [embed], allowedMentions: { parse: [] } });
  },
};