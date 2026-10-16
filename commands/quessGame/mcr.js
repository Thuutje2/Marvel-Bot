const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const GameUser = require('../../models/GameUser');
const { COOLDOWN_MS } = require('../../game/engine');

async function cooldownText(guildId, userId) {
  const user = await GameUser.findOne({ guildId, userId });
  const until = user?.cooldownUntil?.getTime() ?? 0;
  if (until <= Date.now()) {
    return 'You\'re not on cooldown. Start guessing with `!guess <character name>`.';
  }
  return `Your next character is ready <t:${Math.floor(until / 1000)}:R>.`;
}

module.exports = {
  name: 'mcr',
  category: 'Marvel Game',
  usage: ['/mcr', '!mcr'],
  description: `Show how long until you can guess again (${COOLDOWN_MS / 60000} minutes after a correct guess).`,

  data: new SlashCommandBuilder()
    .setName('mcr')
    .setDescription('Show your remaining cooldown for the guessing game.'),

  // Prefix command: !mcr
  async execute(message) {
    if (!message.guild) return;
    const text = await cooldownText(message.guild.id, message.author.id);
    return message.reply({ content: text, allowedMentions: { repliedUser: false } });
  },

  // Slash command: /mcr
  async executeSlash(interaction) {
    if (!interaction.guild) {
      return interaction.reply({ content: 'This command only works in a server.', flags: MessageFlags.Ephemeral });
    }
    const text = await cooldownText(interaction.guild.id, interaction.user.id);
    return interaction.reply({ content: text, flags: MessageFlags.Ephemeral });
  },
};