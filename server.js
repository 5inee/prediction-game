require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const Game = require('./models/Game');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Middleware setup - ORDER MATTERS!
// Body parser middleware must come before routes
app.use(express.json());

// Set up API routes BEFORE static file serving
// This ensures API routes are matched first

// Create a new game
app.post('/api/games', async (req, res) => {
  try {
    console.log('Creating new game with question:', req.body.question);
    const gameId = generateShortId();
    const newGame = new Game({
      id: gameId,
      question: req.body.question || 'Make your prediction',
      maxPredictors: 5, // Default max players
    });
    
    await newGame.save();
    console.log('Game created with ID:', gameId);
    return res.json({ gameId });
  } catch (error) {
    console.error('Error creating game:', error);
    return res.status(500).json({ error: 'Error creating game' });
  }
});

// Join a game
app.post('/api/games/:gameId/join', async (req, res) => {
  console.log('Received join request for game:', req.params.gameId);
  
  try {
    const { gameId } = req.params;
    const { username } = req.body;
    
    console.log('Join attempt - Game:', gameId, 'User:', username);
    
    if (!gameId || !username) {
      console.log('Missing gameId or username');
      return res.status(400).json({ error: 'Game ID and username are required' });
    }
    
    const game = await Game.findOne({ id: gameId });
    
    if (!game) {
      console.log('Game not found:', gameId);
      return res.status(404).json({ error: 'Game not found' });
    }
    
    if (Object.keys(game.predictors).length >= game.maxPredictors) {
      console.log('Game is full');
      return res.status(400).json({ error: 'Game is full' });
    }
    
    const predictorId = uuidv4();
    
    // Simple color assignment using index
    const colors = ['#4361ee', '#3a0ca3', '#7209b7', '#f72585', '#4cc9f0'];
    const colorIndex = Object.keys(game.predictors).length;
    const avatarColor = colors[colorIndex % colors.length];
    
    console.log('Assigning color:', avatarColor, 'to player #', colorIndex);
    
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
    
    const responseData = {
      predictorId,
      game: {
        id: game.id,
        question: game.question,
        predictorCount: Object.keys(game.predictors).length,
        maxPredictors: game.maxPredictors,
      },
    };
    
    console.log('Join successful, sending response:', JSON.stringify(responseData));
    return res.json(responseData);
  } catch (error) {
    console.error('Error joining game:', error);
    return res.status(500).json({ error: 'Server error when joining game' });
  }
});

// Submit a prediction
app.post('/api/games/:gameId/predict', async (req, res) => {
  try {
    const { gameId } = req.params;
    const { predictorId, prediction } = req.body;
    
    const game = await Game.findOne({ id: gameId });
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }
    if (!game.predictors.has(predictorId)) {
      return res.status(403).json({ error: 'Not a valid predictor for this game' });
    }
    if (game.predictions.size >= game.maxPredictors) {
      return res.status(400).json({ error: 'Maximum predictions reached, game is closed' });
    }
    
    game.predictions.set(predictorId, {
      content: prediction,
      submittedAt: new Date(),
    });
    
    await game.save();
    
    const predictionsCount = game.predictions.size;
    const allPredictionsSubmitted = predictionsCount === game.maxPredictors;
    
    io.to(gameId).emit('prediction_update', {
      count: predictionsCount,
      total: game.maxPredictors,
    });
    
    if (allPredictionsSubmitted && !game.revealedToAll) {
      game.revealedToAll = true;
      await game.save();
      
      const predictionsArray = [];
      
      for (const [pid, predictionData] of game.predictions.entries()) {
        const predictor = game.predictors.get(pid);
        
        predictionsArray.push({
          predictor,
          prediction: predictionData
        });
      }
      
      io.to(gameId).emit('all_predictions_revealed', {
        predictions: predictionsArray
      });
    }
    
    return res.json({ success: true, predictionsCount, allPredictionsSubmitted });
  } catch (error) {
    console.error('Error submitting prediction:', error);
    return res.status(500).json({ error: 'Error submitting prediction' });
  }
});

// Static files - IMPORTANT: This comes AFTER API routes
app.use(express.static('public'));

// For any other route, serve the index.html file
// This ensures SPA routing works correctly
app.get('*', (req, res) => {
  // Only serve index.html for non-API routes
  if (!req.path.startsWith('/api/')) {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
});

// Socket.io connection handler
io.on('connection', (socket) => {
  console.log('New client connected');
  socket.on('join_game', (gameId) => {
    socket.join(gameId);
    console.log('Client joined game room:', gameId);
  });
  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});

// Function to generate a short game ID
function generateShortId() {
  const characters = 'CP6aJqx4w^tQsnD3p!EhcyAId278MmUjirY$@Xge0%FuR#vGo9b&STZW1LkKVfOHl5BNz';
  let shortId = '';
  for (let i = 0; i < 6; i++) {
    shortId += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return shortId;
}

// Function to get avatar color
function getAvatarColor(index) {
  const colors = ['#4361ee', '#3a0ca3', '#7209b7', '#f72585', '#4cc9f0'];
  return colors[index % colors.length];
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});