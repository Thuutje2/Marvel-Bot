const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  MessageFlags,
} = require('discord.js');
const dailyConfig = require('../../models/daily_config');

const TEXT_CHANNEL_TYPES = [ChannelType.GuildText, ChannelType.GuildAnnouncement];

// Shared logic for both /setup and !setup. Returns the reply text.
async function saveChannel(guild, channel) {
  if (!channel || !TEXT_CHANNEL_TYPES.includes(channel.type)) {
    return 'Please choose a text channel.';
  }

  // Make sure the bot can actually post and react there
  const perms = channel.permissionsFor(guild.members.me);
  const missing = [
    ['ViewChannel', PermissionFlagsBits.ViewChannel],
    ['SendMessages', PermissionFlagsBits.SendMessages],
    ['EmbedLinks', PermissionFlagsBits.EmbedLinks],
    ['AddReactions', PermissionFlagsBits.AddReactions],
  ]
    .filter(([, flag]) => !perms?.has(flag))
    .map(([name]) => name);

  if (missing.length > 0) {
    return `I'm missing these permissions in ${channel}: ${missing.join(', ')}.`;
  }

  await dailyConfig.setChannel(guild.id, channel.id);

  return `Daily questions will now be posted in ${channel}. Use \`/make question\` to post one.`;
}

module.exports = {
  name: 'setup',
  permissions: ['ManageGuild'],
  category: 'Daily Questions',
  usage: ['/setup channel:#channel', '!setup #channel'],
  description: 'Set the channel where the daily questions are posted.',

  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Set the channel where the daily questions are posted.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption((o) =>
      o
        .setName('channel')
        .setDescription('Channel for the daily questions')
        .addChannelTypes(...TEXT_CHANNEL_TYPES)
        .setRequired(true)
    ),

  // Prefix command: !setup #channel
  async execute(message, args) {
    if (!message.guild) return;

    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return message.reply('You need the Manage Server permission to use this.');
    }

    const channel =
      message.mentions.channels.first() ||
      message.guild.channels.cache.get(args[0]);

    if (!channel) {
      return message.reply('Usage: `!setup #channel`');
    }

    const text = await saveChannel(message.guild, channel);
    return message.reply(text);
  },

  // Slash command: /setup channel:#channel
  async executeSlash(interaction) {
    if (!interaction.guild) {
      return interaction.reply({
        content: 'This command only works in a server.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const channel = interaction.options.getChannel('channel');
    const text = await saveChannel(interaction.guild, channel);
    return interaction.reply({ content: text, flags: MessageFlags.Ephemeral });
  },
};