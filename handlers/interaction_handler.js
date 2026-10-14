const fs = require('fs');

function loadInteractions(client) {
  const interactionFiles = fs
    .readdirSync('./commands')
    .filter((file) => file.endsWith('.js'));

  for (const file of interactionFiles) {
    const interaction = require(`../commands/${file}`);
    client.interactions.set(interaction.data.name, interaction);
  }
}

module.exports = loadInteractions;