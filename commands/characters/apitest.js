const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  MessageFlags,
} = require('discord.js');

const TIMEOUT_MS = 8000;
const apiBase = () => (process.env.SUPERHERO_API_BASE || 'https://superheroapi.com/api').replace(/\/$/, '');

// The API uses "null", "-" and "" for missing values
function clean(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') return value;
  const v = value.trim();
  return v === '' || v === '-' || v.toLowerCase() === 'null' ? null : v;
}

const cleanUrl = (url) => {
  const u = clean(url);
  return u ? u.replace(/^httpss:\/\//i, 'https://') : null;
};

const isMarvel = (character) => /^marvel/i.test(clean(character.biography?.publisher) || '');

const short = (text, max = 1000) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

async function callApi(pathname) {
  const token = process.env.SUPERHERO_TOKEN;
  const started = Date.now();
  const res = await fetch(`${apiBase()}/${token}/${pathname}`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const ms = Date.now() - started;
  if (!res.ok) throw new Error(`the API answered with HTTP ${res.status}`);
  return { data: await res.json(), ms };
}

function buildEmbed(character, { ms, total, marvelMatches }) {
  const bio = character.biography || {};
  const work = character.work || {};
  const ps = character.powerstats || {};

  const embed = new EmbedBuilder()
    .setColor(0xed1d24)
    .setTitle(character.name)
    .setFooter({
      text: `API OK • ${ms} ms • ${total} result(s), ${marvelMatches.length} Marvel`,
    });

  const image = cleanUrl(character.image?.url);
  if (image) embed.setImage(image);

  const fields = [
    ['API id', character.id],
    ['Real name', clean(bio['full-name'])],
    ['Publisher', clean(bio.publisher)],
    ['First appearance', clean(bio['first-appearance'])],
    ['Occupation', clean(work.occupation)],
    ['Base', clean(work.base)],
    ['Groups', clean(character.connections?.['group-affiliation'])],
  ];
  for (const [name, value] of fields) {
    embed.addFields({ name, value: short(String(value ?? 'unknown')), inline: name !== 'Groups' });
  }

  const labels = { intelligence: 'INT', strength: 'STR', speed: 'SPD', durability: 'DUR', power: 'POW', combat: 'CMB' };
  const stats = Object.entries(labels)
    .map(([key, label]) => (clean(ps[key]) !== null ? `${label} ${ps[key]}` : null))
    .filter(Boolean);
  if (stats.length) embed.addFields({ name: 'Powerstats', value: stats.join(' • ') });

  const others = marvelMatches.filter((c) => c.id !== character.id).slice(0, 5);
  if (others.length) {
    embed.setDescription(
      `Other Marvel matches: ${others.map((c) => `${c.name} (id ${c.id})`).join(', ')}`
    );
  }

  embed.addFields({
    name: 'Image check',
    value: image
      ? 'If you can see the picture below, Discord can load the API images.'
      : 'This character has no image in the API.',
  });
  return embed;
}

// Shared logic for /apitest and !apitest. Returns { content } or { embeds }.
async function runTest(query) {
  if (!process.env.SUPERHERO_TOKEN) {
    return { content: 'SUPERHERO_TOKEN is missing in your .env file, so I can\'t reach the API.' };
  }

  try {
    // No name given: just check that the token works by loading id 1
    if (!query) {
      const { data, ms } = await callApi('1');
      if (data.response !== 'success') {
        return { content: `The API rejected the request: ${data.error || 'unknown error'}. Check your token.` };
      }
      const embed = buildEmbed(data, { ms, total: 1, marvelMatches: isMarvel(data) ? [data] : [] });
      return { content: 'Your token works. Pass a name to search, for example `!apitest iron man`.', embeds: [embed] };
    }

    const { data, ms } = await callApi(`search/${encodeURIComponent(query)}`);
    if (data.response !== 'success') {
      const reason = data.error || 'unknown error';
      return {
        content: /token/i.test(reason)
          ? `The API rejected the request: ${reason}. Check your token.`
          : `No result for \`${query}\`: ${reason}.`,
      };
    }

    const results = data.results || [];
    const marvelMatches = results.filter(isMarvel);

    if (marvelMatches.length === 0) {
      const publishers = [...new Set(results.map((c) => clean(c.biography?.publisher) || 'unknown'))];
      return {
        content:
          `The API found ${results.length} result(s) for \`${query}\`, but none from Marvel` +
          (publishers.length ? ` (publishers: ${publishers.join(', ')})` : '') +
          '. The game would skip it.',
      };
    }

    const embed = buildEmbed(marvelMatches[0], { ms, total: results.length, marvelMatches });
    return { embeds: [embed] };
  } catch (error) {
    // Never include the request URL here, it contains your token
    const reason = error.name === 'TimeoutError' ? `no answer within ${TIMEOUT_MS / 1000} seconds` : error.message;
    return { content: `Could not reach the API: ${reason}.` };
  }
}

module.exports = {
  name: 'apitest',
  permissions: ['ManageGuild'],
  category: 'Admin',
  usage: ['/apitest [name]', '!apitest [name]'],
  description: 'Test the SuperHero API token and look up a Marvel character.',

  data: new SlashCommandBuilder()
    .setName('apitest')
    .setDescription('Test the SuperHero API token and look up a Marvel character.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((o) =>
      o.setName('name').setDescription('Character to search for, e.g. iron man (empty = just test the token)')
    ),

  // Prefix command: !apitest [name]
  async execute(message, args) {
    if (!message.guild) return;

    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return message.reply('You need the Manage Server permission to use this.');
    }

    const result = await runTest(args.join(' ').trim());
    return message.reply({ ...result, allowedMentions: { repliedUser: false } });
  },

  // Slash command: /apitest [name]
  async executeSlash(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const result = await runTest(interaction.options.getString('name')?.trim());
    return interaction.editReply(result);
  },
};