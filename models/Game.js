const mongoose = require('mongoose');

const gameSchema = new mongoose.Schema({
    id: { 
        type: String, 
        required: true, 
        unique: true,
        index: true 
    },
    question: { 
        type: String, 
        required: true,
        maxlength: 500
    },
    predictions: { 
        type: Map, 
        of: {
            content: { type: String, maxlength: 1000 },
            submittedAt: { type: Date, default: Date.now }
        }, 
        default: {} 
    },
    predictors: { 
        type: Map, 
        of: {
            id: String,
            username: { type: String, maxlength: 50 },
            avatarColor: String,
            joinedAt: { type: Date, default: Date.now }
        }, 
        default: {} 
    },
    maxPredictors: { 
        type: Number, 
        default: 5,
        min: 2,
        max: 20
    },
    revealedToAll: { 
        type: Boolean, 
        default: false 
    }
}, { timestamps: true });

module.exports = mongoose.model('Game', gameSchema);