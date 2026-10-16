const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const characters = require('../../game/characters');
const { isCurrentCharacter } = require('../../game/engine');

const short = (text, max = 1000) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

const STAT_LABELS = {
  intelligence: 'INT',
  strength: 'STR',
  speed: 'SPD',
  durability: 'DUR',
  power: 'POW',
  combat: 'CMB',
};

function buildEmbed(c) {
  const embed = new EmbedBuilder().setColor(0xed1d24).setTitle(c.name);

  const fields = [
    ['Real name', c.fullName],
    ['First appearance', c.firstAppearance],
    ['Occupation', c.occupation],
    ['Base', c.base],
    ['Born in', c.placeOfBirth],
    ['Alignment', c.alignment],
    ['Affiliation', c.groups],
    ['Played by', c.extra?.actor],
    ['Films and series', c.extra?.series?.join(', ')],
  ];
  for (const [name, value] of fields) {
    if (value) embed.addFields({ name, value: short(String(value)), inline: value.length < 40 });
  }

  const stats = Object.entries(STAT_LABELS)
    .filter(([key]) => c.powerstats?.[key] !== null && c.powerstats?.[key] !== undefined)
    .map(([key, label]) => `${label} ${c.powerstats[key]}`);
  if (stats.length) embed.addFields({ name: 'Powerstats', value: stats.join(' • ') });

  if (c.image) embed.setImage(c.image);
  return embed;
}

// Returns { content } or { embeds }
async function lookup(guildId, userId, query) {
  if (!query) return { content: 'Usage: `!ci <character name>`' };

  const character = characters.findCharacter(query);
  if (!character) {
    const suggestions = characters.searchCharacters(query);
    return {
      content:
        `I don't know a Marvel character called \`${query}\`.` +
        (suggestions.length ? ` Did you mean: ${suggestions.map((c) => c.name).join(', ')}?` : ''),
    };
  }

  // Don't give away the answer to the round that is in progress
  if (await isCurrentCharacter(guildId, userId, character.apiId)) {
    return { content: 'Nice try! That\'s the character you\'re guessing right now.' };
  }
  return { embeds: [buildEmbed(character)] };
}

module.exports = {
  name: 'ci',
  category: 'Marvel Game',
  usage: ['/ci character:<name>', '!ci <character name>'],
  description: 'Get information about a Marvel character.',

  data: new SlashCommandBuilder()
    .setName('ci')
    .setDescription('Get information about a Marvel character.')
    .addStringOption((o) =>
      o.setName('character').setDescription('Character name, e.g. Iron Man').setRequired(true)
    ),

  // Prefix command: !ci <character name>
  async execute(message, args) {
    if (!message.guild) return;
    const result = await lookup(message.guild.id, message.author.id, args.join(' ').trim());
    return message.reply({ ...result, allowedMentions: { repliedUser: false } });
  },

  // Slash command: /ci character:<name>
  async executeSlash(interaction) {
    if (!interaction.guild) {
      return interaction.reply({ content: 'This command only works in a server.', flags: MessageFlags.Ephemeral });
    }
    const result = await lookup(
      interaction.guild.id,
      interaction.user.id,
      interaction.options.getString('character').trim()
    );
    return interaction.reply(result);
  },
};