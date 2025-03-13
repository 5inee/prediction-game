const mongoose = require('mongoose');

const gameSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    question: { type: String, required: true },
    predictions: {
        type: Map,
        of: new mongoose.Schema({
            content: { type: String, required: true },
            submittedAt: { type: Date, default: Date.now }
        })
    },
    predictors: {
        type: Map,
        of: new mongoose.Schema({
            id: { type: String, required: true },
            username: { type: String, required: true },
            avatarColor: { type: String },
            joinedAt: { type: Date, default: Date.now }
        })
    },
    maxPredictors: { type: Number, default: 5 },
    revealedToAll: { type: Boolean, default: false }
});

module.exports = mongoose.model('Game', gameSchema);