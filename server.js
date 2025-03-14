require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const Game = require('./models/Game');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static('public'));
app.use(express.json());

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => console.error('❌ MongoDB Connection Error:', err));

// Function to generate a short game ID
function generateShortId() {
  const characters = 'CP6aJqx4w^tQsnD3p!EhcyAId278MmUjirY$@Xge0%FuR#vGo9b&STZW1LkKVfOHl5BNz';
  let shortId = '';
  for (let i = 0; i < 6; i++) {
    shortId += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return shortId;
}

// Create a new game
app.post('/api/games', async (req, res) => {
  const gameId = generateShortId();
  const newGame = new Game({
    id: gameId,
    question: req.body.question || 'Make your prediction',
    maxPredictors: 5, // Default max players
  });
  try {
    await newGame.save();
    res.json({ gameId });
  } catch (error) {
    res.status(500).json({ error: 'Error creating game' });
  }
});

// Join a game
app.post('/api/games/:gameId/join', async (req, res) => {
  const { gameId } = req.params;
  const { username } = req.body;
  try {
    const game = await Game.findOne({ id: gameId });
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }
    if (Object.keys(game.predictors).length >= game.maxPredictors) {
      return res.status(400).json({ error: 'Game is full' });
    }
    
    // Create a new predictor entry
    const predictorId = uuidv4();
    
    // Get existing colors - properly iterate through the Map structure
    const existingColors = [];
    for (const [_, predictor] of game.predictors.entries()) {
      if (predictor.avatarColor) {
        existingColors.push(predictor.avatarColor);
      }
    }
    
    // Find a color that hasn't been used yet
    const colors = ['#4361ee', '#3a0ca3', '#7209b7', '#f72585', '#4cc9f0'];
    let avatarColor;
    
    // First try to find an unused color
    for (const color of colors) {
      if (!existingColors.includes(color)) {
        avatarColor = color;
        break;
      }
    }
    
    // If all colors are used (or there was an issue finding unused colors),
    // fall back to the simple index approach
    if (!avatarColor) {
      const colorIndex = Object.keys(game.predictors).length;
      avatarColor = colors[colorIndex % colors.length];
    }
    
    // Add the new predictor with the selected color
    game.predictors.set(predictorId, {
      id: predictorId,
      username,
      avatarColor: avatarColor,
      joinedAt: new Date(),
    });
    
    await game.save();
    io.to(gameId).emit('predictor_update', {
      count: Object.keys(game.predictors).length,
      total: game.maxPredictors,
    });
    
    res.json({
      predictorId,
      game: {
        id: game.id,
        question: game.question,
        predictorCount: Object.keys(game.predictors).length,
        maxPredictors: game.maxPredictors,
      },
    });
  } catch (error) {
    console.error('Error in join game:', error);
    res.status(500).json({ error: 'Error joining game' });
  }
});

// Submit a prediction
// Join a game
app.post('/api/games/:gameId/join', async (req, res) => {
  const { gameId } = req.params;
  const { username } = req.body;
  
  // Basic validation
  if (!gameId || !username) {
    return res.status(400).json({ error: 'Game ID and username are required' });
  }
  
  try {
    const game = await Game.findOne({ id: gameId });
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }
    
    if (Object.keys(game.predictors).length >= game.maxPredictors) {
      return res.status(400).json({ error: 'Game is full' });
    }
    
    // Create a new predictor entry
    const predictorId = uuidv4();
    
    // Simple color selection using index
    const colors = ['#4361ee', '#3a0ca3', '#7209b7', '#f72585', '#4cc9f0'];
    const colorIndex = Object.keys(game.predictors).length;
    const avatarColor = colors[colorIndex % colors.length];
    
    // Add the new predictor with the selected color
    game.predictors.set(predictorId, {
      id: predictorId,
      username,
      avatarColor: avatarColor,
      joinedAt: new Date(),
    });
    
    await game.save();
    
    // Emit socket event
    io.to(gameId).emit('predictor_update', {
      count: Object.keys(game.predictors).length,
      total: game.maxPredictors,
    });
    
    // Send response
    return res.status(200).json({
      predictorId,
      game: {
        id: game.id,
        question: game.question,
        predictorCount: Object.keys(game.predictors).length,
        maxPredictors: game.maxPredictors,
      },
    });
  } catch (error) {
    console.error('Error joining game:', error);
    return res.status(500).json({ error: 'Server error when joining game' });
  }
});

// Socket.io connection handler
io.on('connection', (socket) => {
  console.log('New client connected');
  socket.on('join_game', (gameId) => {
    socket.join(gameId);
  });
  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});

// Function to get avatar color
function getAvatarColor(index) {
  const colors = ['#4361ee', '#3a0ca3', '#7209b7', '#f72585', '#4cc9f0'];
  return colors[index % colors.length];
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});