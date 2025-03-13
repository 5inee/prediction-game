const mongoose = require('mongoose');

const gameSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    question: { type: String, required: true },
    predictions: { type: Map, of: Object, default: {} },
    predictors: { type: Map, of: Object, default: {} },
    maxPredictors: { type: Number, default: 5 },
    revealedToAll: { type: Boolean, default: false }
});

module.exports = mongoose.model('Game', gameSchema);
