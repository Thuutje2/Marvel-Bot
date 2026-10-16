const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const GameUser = require('../../models/GameUser');
const characters = require('../../game/characters');

async function buildProfile(guildId, target) {
  const user = await GameUser.findOne({ guildId, userId: target.id });

  const embed = new EmbedBuilder()
    .setColor(0xed1d24)
    .setTitle(`${target.displayName ?? target.username}'s profile`)
    .setThumbnail(target.displayAvatarURL());

  if (!user || (user.correct === 0 && user.points === 0)) {
    embed.setDescription('No correct guesses yet. Start with `!guess <character name>`!');
    return embed;
  }

  const rank = (await GameUser.countDocuments({ guildId, points: { $gt: user.points } })) + 1;

  // Favorite character = the one guessed right most often
  let favorite = null;
  for (const [id, count] of user.guessedCounts.entries()) {
    if (!favorite || count > favorite.count) favorite = { id: Number(id), count };
  }
  const favoriteCharacter = favorite ? characters.getById(favorite.id) : null;

  embed.addFields(
    { name: 'Total points', value: String(user.points), inline: true },
    { name: 'Correct guesses', value: String(user.correct), inline: true },
    { name: 'Rank', value: `#${rank}`, inline: true },
    { name: 'Current streak', value: String(user.streak), inline: true },
    { name: 'Best streak', value: String(user.bestStreak), inline: true },
    {
      name: 'Favorite character',
      value: favoriteCharacter ? `${favoriteCharacter.name} (${favorite.count}x)` : 'None yet',
      inline: true,
    }
  );
  if (favoriteCharacter?.image) embed.setImage(favoriteCharacter.image);
  return embed;
}

module.exports = {
  name: 'gp',
  category: 'Marvel Game',
  usage: ['/gp [user]', '!gp', '!gp @user'],
  description: 'Show your guessing game profile: points, correct guesses, streak and favorite character.',

  data: new SlashCommandBuilder()
    .setName('gp')
    .setDescription('Show a guessing game profile.')
    .addUserOption((o) => o.setName('user').setDescription('Whose profile to show (default: yours)')),

  // Prefix command: !gp [@user]
  async execute(message) {
    if (!message.guild) return;
    const target = message.mentions.members.first() || message.member;
    const embed = await buildProfile(message.guild.id, target);
    return message.reply({ embeds: [embed], allowedMentions: { repliedUser: false } });
  },

  // Slash command: /gp [user]
  async executeSlash(interaction) {
    if (!interaction.guild) {
      return interaction.reply({ content: 'This command only works in a server.', flags: MessageFlags.Ephemeral });
    }
    const user = interaction.options.getUser('user') || interaction.user;
    const target = interaction.guild.members.cache.get(user.id) || user;
    const embed = await buildProfile(interaction.guild.id, target);
    return interaction.reply({ embeds: [embed] });
  },
};