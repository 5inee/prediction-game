// models/Game.js
const mongoose = require('mongoose');

const gameSchema = new mongoose.Schema({
  question: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  maxPredictors: { type: Number, default: 5 },
  status: { type: String, enum: ['waiting', 'in_progress', 'completed'], default: 'waiting' },
  predictions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Prediction' }],
  expiresAt: { type: Date }
});

module.exports = mongoose.model('Game', gameSchema);