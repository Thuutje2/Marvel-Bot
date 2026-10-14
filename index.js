require('dotenv').config();
const connectToDatabase = require('./mongo');
connectToDatabase();

const { Client, GatewayIntentBits, Collection } = require('discord.js');
const fs = require('fs');
const { EmbedBuilder } = require('@discordjs/builders');
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildPresences,
  ],
});

const prefix = process.env.PREFIX;
const token = process.env.TOKEN;

// Load commands
const commandHandler = require('./handlers/command_handler');
commandHandler(client);

// Laad interactie-handlers
const interactionHandler = require('./handlers/interaction_handler');
interactionHandler(client);

// Laad slash commands
const deployCommands = require('./handlers/deploy_commands');
deployCommands(client);

// Laad event handlers
const eventHandler = require('./handlers/event_handler');
eventHandler(client);

client.once('clientReady', () => {
  console.log(`Logged in as ${client.user.id}`);
  console.log(
    'messageCreate listeners:',
    client.listenerCount('messageCreate')
  );
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);

  if (!command || !command.executeSlash) {
    console.error(
      `No slash command matching ${interaction.commandName} was found.`
    );
    return;
  }

  try {
    await command.executeSlash(interaction);
  } catch (error) {
    console.error(
      `Error executing slash command "${interaction.commandName}":`,
      error
    );
    const errorMessage = 'There was an error executing this command!';

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({
        content: errorMessage,
        ephemeral: true,
      });
    } else {
      await interaction.reply({
        content: errorMessage,
        ephemeral: true,
      });
    }
  }
});

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;
  if (!message.content.startsWith(prefix)) return;

  const args = message.content.slice(prefix.length).trim().split(/ +/);
  const commandName = args.shift().toLowerCase();

  const command = client.commands.get(commandName);
  if (!command || !command.execute) return;

  try {
    await command.execute(message, args);
  } catch (error) {
    console.error(`Error executing prefix command "${commandName}":`, error);
    message.channel.send('There was an error executing this command!');
  }
});

client.login(token);