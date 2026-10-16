const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { processGuess, COOLDOWN_MS } = require('../../game/engine');
const { POINTS } = require('../../game/characters');

const unix = (date) => Math.floor(new Date(date).getTime() / 1000);

const hintList = (hints) => hints.map((h, i) => `**${i + 1}.** ${h}`).join('\n');

// Turn a game result into { content, embeds, ephemeral }
function render(result) {
  switch (result.type) {
    case 'notready':
      return {
        content: 'The character data is missing. Run `node scripts/build_characters.js` first.',
        ephemeral: true,
      };

    case 'busy':
      return { content: 'One moment, I\'m still processing your last guess.', ephemeral: true };

    case 'cooldown':
      return {
        content: `You're on cooldown. Your next character is ready <t:${unix(result.until)}:R>.`,
        ephemeral: true,
      };

    case 'usage':
      return {
        content:
          'Guess a Marvel character with `!guess <character name>` or `/guess`.\n' +
          'Every wrong guess gives you an extra hint.',
        ephemeral: true,
      };

    case 'status': {
      const embed = new EmbedBuilder()
        .setColor(0xed1d24)
        .setTitle(`Your round so far (${result.attempts} wrong)`)
        .setDescription(hintList(result.hints));
      return { embeds: [embed] };
    }

    case 'wrong': {
      const embed = new EmbedBuilder()
        .setColor(0xed1d24)
        .setTitle(`Wrong! Attempt ${result.attempt}`)
        .setDescription(hintList(result.hints))
        .setFooter({
          text: result.noMoreHints
            ? 'No more hints, keep guessing! Your streak was reset.'
            : 'Your streak was reset. Guess again with !guess <name>',
        });
      return { embeds: [embed] };
    }

    case 'correct': {
      const c = result.character;
      const embed = new EmbedBuilder()
        .setColor(0x2ecc71)
        .setTitle(`Correct! It's ${c.name}`)
        .addFields(
          { name: 'Points', value: `+${result.points}`, inline: true },
          { name: 'Attempts', value: String(result.attempt), inline: true },
          { name: 'Streak', value: String(result.streak), inline: true },
          { name: 'Total points', value: String(result.totalPoints), inline: true },
          { name: 'Next character', value: `<t:${unix(result.cooldownUntil)}:R>`, inline: true }
        );
      if (c.fullName) embed.setDescription(`Real name: ${c.fullName}`);
      if (c.image) embed.setImage(c.image);
      return { embeds: [embed] };
    }

    default:
      return { content: 'Something went wrong.', ephemeral: true };
  }
}

module.exports = {
  name: 'guess',
  category: 'Marvel Game',
  usage: ['/guess character:<name>', '!guess <character name>'],
  description:
    `Guess the Marvel character. Wrong guesses give hints (up to ${POINTS.length}). ` +
    `Points: ${POINTS.join('/')}. After a correct guess you wait ${COOLDOWN_MS / 60000} minutes.`,

  data: new SlashCommandBuilder()
    .setName('guess')
    .setDescription('Guess the Marvel character. Wrong guesses give you hints.')
    .addStringOption((o) =>
      o.setName('character').setDescription('Your guess, e.g. Iron Man (empty = show your hints so far)')
    ),

  // Prefix command: !guess <character name>
  async execute(message, args) {
    if (!message.guild) return;
    const result = await processGuess(message.guild.id, message.author.id, args.join(' '));
    const { ephemeral, ...payload } = render(result);
    return message.reply({ ...payload, allowedMentions: { repliedUser: false } });
  },

  // Slash command: /guess character:<name>
  async executeSlash(interaction) {
    if (!interaction.guild) {
      return interaction.reply({ content: 'This command only works in a server.', flags: MessageFlags.Ephemeral });
    }
    const result = await processGuess(
      interaction.guild.id,
      interaction.user.id,
      interaction.options.getString('character')
    );
    const { ephemeral, ...payload } = render(result);
    return interaction.reply({ ...payload, flags: ephemeral ? MessageFlags.Ephemeral : undefined });
  },
};