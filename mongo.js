const mongoose = require('mongoose');

module.exports = async function connectToDatabase() {
  const uri = process.env.MONGO_URI;

  if (!uri) {
    console.error('MONGO_URI is missing in your .env file.');
    process.exit(1);
  }

  try {
    await mongoose.connect(uri);
    console.log('Connected to MongoDB.');
  } catch (error) {
    console.error('MongoDB connection failed:', error.message);
    process.exit(1);
  }

  mongoose.connection.on('error', (error) => {
    console.error('MongoDB error:', error.message);
  });
  mongoose.connection.on('disconnected', () => {
    console.warn('MongoDB disconnected.');
  });
};