const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
} = require('discord.js');

async function clearMessages(channel, member, amount) {
  if (!member.permissions.has(PermissionFlagsBits.ManageMessages)) {
    return "You don't have permission to manage messages.";
  }
  if (isNaN(amount) || amount < 1 || amount > 100) {
    return 'Please provide a number between 1 and 100.';
  }
  try {
    const deleted = await channel.bulkDelete(amount, true);
    return `Successfully cleared ${deleted.size} messages.`;
  } catch (error) {
    console.log('Clear command error:', error.message);
    return 'Could not delete messages. They might be too old (14+ days).';
  }
}

module.exports = {
  name: 'clear',
  permissions: ['Administrator', 'ManageMessages'],
  description: 'Clear a specified number of messages.',

  data: new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Clear a specified number of messages.')
    .addIntegerOption((option) =>
      option
        .setName('amount')
        .setDescription('Number of messages to delete (1-100)')
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  // Prefix command: !clear 10
  async execute(message, args) {
    const amount = parseInt(args[0]);
    const result = await clearMessages(message.channel, message.member, amount);
    const msg = await message.channel.send(result);
    setTimeout(() => msg.delete().catch(() => {}), 5000);
  },

  // Slash command: /clear amount:10
  async executeSlash(interaction) {
    const amount = interaction.options.getInteger('amount');
    const result = await clearMessages(
      interaction.channel,
      interaction.member,
      amount
    );
    await interaction.reply({ content: result, flags: MessageFlags.Ephemeral });
  },
};