const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  MessageFlags,
} = require('discord.js');

// ---------------------------------------------------------------------------
// How this works
// ---------------------------------------------------------------------------
// The help list is built from client.commands, so a new command appears here
// automatically. To control how it shows up, add these optional fields to the
// command's module.exports:
//
//   category: 'Daily Questions',          // groups commands in the list
//   usage: ['!make question <question>'] // string or array, shown in !help <name>
//   aliases: ['mq']                       // other names for !help <name>
//
// Commands without a category are listed under "Other".
// Commands with a `permissions` array are only shown to members who have at
// least one of those permissions (Administrator always counts).
// ---------------------------------------------------------------------------

// Order of the categories in the overview. Unlisted categories come after
// these (alphabetically), and "Other" always comes last.
const CATEGORY_ORDER = ['Marvel Game', 'Daily Questions', 'Moderation', 'Info'];
const FALLBACK_CATEGORY = 'Other';
const EMBED_COLOR = 0xed1d24;

const PERMISSION_LABELS = {
  Administrator: 'Administrator',
  ManageGuild: 'Manage Server',
  ManageMessages: 'Manage Messages',
  ManageChannels: 'Manage Channels',
  ManageRoles: 'Manage Roles',
  KickMembers: 'Kick Members',
  BanMembers: 'Ban Members',
};

function prettyPermission(name) {
  return PERMISSION_LABELS[name] ?? name.replace(/([a-z])([A-Z])/g, '$1 $2');
}

function getPrefix() {
  return process.env.PREFIX || '!';
}

function canUse(member, command) {
  const perms = command.permissions;
  if (!perms || perms.length === 0) return true;
  if (!member) return false; // DMs: only show commands without requirements
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  return perms.some(
    (p) => PermissionFlagsBits[p] !== undefined && member.permissions.has(PermissionFlagsBits[p])
  );
}

// Unique commands from client.commands that this member may use
function visibleCommands(client, member) {
  const seen = new Set();
  const list = [];
  for (const command of client.commands.values()) {
    if (!command?.name || seen.has(command.name)) continue;
    seen.add(command.name);
    if (canUse(member, command)) list.push(command);
  }
  return list.sort((a, b) => a.name.localeCompare(b.name));
}

function findCommand(client, input) {
  const name = input.trim().toLowerCase().replace(/^[!/]/, '').replace(new RegExp(`^${getPrefix()}`), '');
  return (
    client.commands.get(name) ||
    [...client.commands.values()].find((c) => c.aliases?.includes(name)) ||
    null
  );
}

// "/name !name" depending on what the command supports
function invocation(command, prefix) {
  const tags = [];
  if (command.data) tags.push(`\`/${command.name}\``);
  if (command.execute) tags.push(`\`${prefix}${command.name}\``);
  return tags.join(' ');
}

function categoryRank(category) {
  if (category === FALLBACK_CATEGORY) return 1000;
  const index = CATEGORY_ORDER.indexOf(category);
  return index === -1 ? 500 : index;
}

// Split lines into chunks that fit in an embed field (1024 chars max)
function chunkLines(lines, limit = 1000) {
  const chunks = [];
  let current = '';
  for (const line of lines) {
    if (current && current.length + line.length + 1 > limit) {
      chunks.push(current);
      current = '';
    }
    current += (current ? '\n' : '') + line;
  }
  if (current) chunks.push(current);
  return chunks;
}

function buildOverview(client, member) {
  const prefix = getPrefix();
  const commands = visibleCommands(client, member);

  const groups = new Map();
  for (const command of commands) {
    const category = command.category || FALLBACK_CATEGORY;
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category).push(command);
  }

  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setTitle('Help')
    .setDescription(
      `Use \`/\` or \`${prefix}\` before a command.\n` +
        `Type \`/help command:<name>\` or \`${prefix}help <name>\` for details on one command.`
    );

  const sortedCategories = [...groups.keys()].sort(
    (a, b) => categoryRank(a) - categoryRank(b) || a.localeCompare(b)
  );

  for (const category of sortedCategories) {
    const lines = groups
      .get(category)
      .map((c) => `${invocation(c, prefix)}\n${c.description || 'No description.'}`)
      .flatMap((entry) => [entry, '']) // blank line between commands
      .slice(0, -1);

    chunkLines(lines).forEach((chunk, i) => {
      embed.addFields({
        name: i === 0 ? category : `${category} (continued)`,
        value: chunk,
      });
    });
  }

  if (groups.size === 0) {
    embed.addFields({ name: 'No commands', value: 'There are no commands available to you.' });
  }

  return embed;
}

function buildDetails(command) {
  const prefix = getPrefix();
  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setTitle(`Help: ${command.name}`)
    .setDescription(command.description || 'No description.');

  const usage = [command.usage].flat().filter(Boolean);
  const fallbackUsage = [];
  if (command.data) fallbackUsage.push(`/${command.name}`);
  if (command.execute) fallbackUsage.push(`${prefix}${command.name}`);

  embed.addFields({
    name: 'Usage',
    value: '```\n' + (usage.length ? usage : fallbackUsage).join('\n') + '\n```',
  });

  embed.addFields({
    name: 'Available as',
    value: invocation(command, prefix) || 'Unknown',
    inline: true,
  });

  if (command.category) {
    embed.addFields({ name: 'Category', value: command.category, inline: true });
  }

  const perms = command.permissions?.length
    ? command.permissions.map(prettyPermission).join(' or ')
    : 'Everyone';
  embed.addFields({ name: 'Who can use it', value: perms, inline: true });

  if (command.aliases?.length) {
    embed.addFields({
      name: 'Aliases',
      value: command.aliases.map((a) => `\`${prefix}${a}\``).join(', '),
    });
  }

  return embed;
}

// Returns the embed to show, or an error string
function answer(client, member, query) {
  if (!query) return { embed: buildOverview(client, member) };

  const command = findCommand(client, query);
  if (!command || !canUse(member, command)) {
    return { error: `I don't know a command called \`${query}\`. Use \`${getPrefix()}help\` to see the list.` };
  }
  return { embed: buildDetails(command) };
}

module.exports = {
  name: 'help',
  category: 'Info',
  aliases: ['commands'],
  usage: ['/help', '/help command:<name>', '!help', '!help <name>'],
  description: 'Show all commands, or details about one command.',

  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show all commands, or details about one command.')
    .addStringOption((o) =>
      o.setName('command').setDescription('Command to get details about, e.g. make')
    ),

  // Prefix command: !help or !help <command>
  async execute(message, args) {
    const result = answer(message.client, message.member, args[0]);
    if (result.error) return message.reply(result.error);
    return message.reply({ embeds: [result.embed], allowedMentions: { repliedUser: false } });
  },

  // Slash command: /help or /help command:<name>
  async executeSlash(interaction) {
    const query = interaction.options.getString('command');
    const result = answer(interaction.client, interaction.member, query);
    if (result.error) {
      return interaction.reply({ content: result.error, flags: MessageFlags.Ephemeral });
    }
    return interaction.reply({ embeds: [result.embed], flags: MessageFlags.Ephemeral });
  },
};