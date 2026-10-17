const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  MessageFlags,
} = require('discord.js');
const dailyConfig = require('../../models/daily_config');

// Name of the role that gets pinged with every question (not case sensitive)
const PING_ROLE_NAME = 'qotd';

const USAGE =
  'Usage:\n' +
  '`!make question <question>` for an open question\n' +
  '`!make question <question> | <option A> | <option B> | [emoji A] | [emoji B]` for a vote\n' +
  'Example: `!make question Who wins? | Thor | Hulk | ⚡ | 💚`';

// Shared logic for /make question and !make question. Returns the reply text.
// Without optionA/optionB it posts an open question.
async function postQuestion(guild, { question, optionA, optionB, emojiA, emojiB }, askedBy) {
  const cfg = await dailyConfig.get(guild.id);
  if (!cfg || !cfg.channelId) {
    return 'No channel set yet. Use `/setup` first.';
  }

  const channel = await guild.channels.fetch(cfg.channelId).catch(() => null);
  if (!channel || !channel.isTextBased()) {
    return 'The setup channel no longer exists. Run `/setup` again.';
  }

  // Ping the server's existing @qotd role (found by name)
  let ping = null;
  let pingNote = '';
  const roles = await guild.roles.fetch().catch(() => guild.roles.cache);
  const qotd = roles.find((r) => r.name.toLowerCase() === PING_ROLE_NAME);
  const canMentionAny = channel
    .permissionsFor(guild.members.me)
    ?.has(PermissionFlagsBits.MentionEveryone);

  if (!qotd) {
    pingNote = `\nI couldn't find a role named "${PING_ROLE_NAME}", so nobody was pinged.`;
  } else if (!qotd.mentionable && !canMentionAny) {
    pingNote =
      `\nI couldn't ping ${qotd.name}: turn on "Allow anyone to @mention this role" for it, ` +
      'or give me the Mention Everyone permission.';
  } else {
    ping = qotd;
  }

  optionA = optionA?.trim() || null;
  optionB = optionB?.trim() || null;

  if (!!optionA !== !!optionB) {
    return 'Give both options, or leave both empty for an open question.';
  }
  if (question.length > 250) return 'The question can be at most 250 characters.';

  const isVote = Boolean(optionA && optionB);

  emojiA = emojiA?.trim() || '🅰️';
  emojiB = emojiB?.trim() || '🅱️';

  if (isVote) {
    if (emojiA === emojiB) return 'The two options need different emojis.';
    if (optionA.length > 60 || optionB.length > 60) {
      return 'Each option can be at most 60 characters.';
    }
  }

  const embed = new EmbedBuilder()
    .setColor(0xed1d24)
    .setTitle('Daily Question')
    .setDescription(`**${question}**`);

  if (isVote) {
    embed
      .addFields(
        { name: `${emojiA}  ${optionA}`, value: 'React to vote', inline: true },
        { name: `${emojiB}  ${optionB}`, value: 'React to vote', inline: true }
      )
      .setFooter({ text: `Asked by ${askedBy}` });
  } else {
    embed.setFooter({ text: `Asked by ${askedBy}` });
  }

  let sent;
  try {
    sent = await channel.send({
      content: ping ? `${ping}` : undefined,
      embeds: [embed],
      // only ping the configured role, nothing else
      allowedMentions: ping ? { roles: [ping.id] } : { parse: [] },
    });
  } catch (error) {
    console.error('Could not post daily question:', error.message);
    return `I couldn't post in ${channel}. Check my permissions there.`;
  }

  // Open question: nothing more to do, people answer in the channel
  if (!isVote) {
    return `Open question posted in ${channel}.${pingNote}`;
  }

  const failed = [];
  for (const emoji of [emojiA, emojiB]) {
    try {
      await sent.react(emoji);
    } catch {
      failed.push(emoji);
    }
  }

  if (failed.length > 0) {
    return (
      `Posted in ${channel}, but I couldn't react with ${failed.join(' and ')}. ` +
      'Use a normal emoji or one from this server.' +
      pingNote
    );
  }
  return `Question posted in ${channel}.${pingNote}`;
}

module.exports = {
  name: 'make',
  permissions: ['ManageMessages'],
  category: 'Daily Questions',
  usage: [
    '/make question question:<text> [option_a] [option_b] [emoji_a] [emoji_b]',
    '!make question <question>',
    '!make question <question> | <option A> | <option B> | [emoji A] | [emoji B]',
  ],
  description: 'Post a daily question (open, or a vote with two options) in the setup channel.',

  data: new SlashCommandBuilder()
    .setName('make')
    .setDescription('Make a daily question and post it in the setup channel.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addSubcommand((s) =>
      s
        .setName('question')
        .setDescription('Post a question. Add two options to make it a vote.')
        .addStringOption((o) =>
          o.setName('question').setDescription('The question').setMaxLength(250).setRequired(true)
        )
        .addStringOption((o) =>
          o.setName('option_a').setDescription('Optional: first option for a vote, e.g. Thor').setMaxLength(60)
        )
        .addStringOption((o) =>
          o.setName('option_b').setDescription('Optional: second option for a vote, e.g. Hulk').setMaxLength(60)
        )
        .addStringOption((o) =>
          o.setName('emoji_a').setDescription('Reaction for option A (default: 🅰️)')
        )
        .addStringOption((o) =>
          o.setName('emoji_b').setDescription('Reaction for option B (default: 🅱️)')
        )
    ),

  // Prefix command:
  //   !make question <question>
  //   !make question <question> | <A> | <B> | [emoji A] | [emoji B]
  async execute(message, args) {
    if (!message.guild) return;

    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return message.reply("You need the Manage Messages permission to use this.");
    }

    if ((args.shift() || '').toLowerCase() !== 'question') {
      return message.reply(USAGE);
    }

    const parts = args.join(' ').split('|').map((p) => p.trim());
    const [question, optionA, optionB, emojiA, emojiB] = parts;

    if (!question) {
      return message.reply(USAGE);
    }

    const text = await postQuestion(
      message.guild,
      { question, optionA, optionB, emojiA, emojiB },
      message.member.displayName
    );
    return message.reply(text);
  },

  // Slash command: /make question
  async executeSlash(interaction) {
    if (!interaction.guild) {
      return interaction.reply({
        content: 'This command only works in a server.',
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const text = await postQuestion(
      interaction.guild,
      {
        question: interaction.options.getString('question'),
        optionA: interaction.options.getString('option_a'),
        optionB: interaction.options.getString('option_b'),
        emojiA: interaction.options.getString('emoji_a'),
        emojiB: interaction.options.getString('emoji_b'),
      },
      interaction.member?.displayName ?? interaction.user.username
    );
    return interaction.editReply(text);
  },
};