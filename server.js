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
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let shortId = '';
  for (let i = 0; i < 6; i++) {
    shortId += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return shortId;
}

// Get game details
app.get('/api/games/:gameId', async (req, res) => {
  const { gameId } = req.params;
  try {
    const game = await Game.findOne({ id: gameId });
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }

    // Return game details without exposing all predictions if not revealed yet
    res.json({
      id: game.id,
      question: game.question,
      predictorCount: Object.keys(game.predictors).length,
      maxPredictors: game.maxPredictors,
      predictionsCount: game.predictions.size,
      isCompleted: game.revealedToAll,
      createdAt: game._id.getTimestamp()
    });
  } catch (error) {
    console.error('Error getting game:', error);
    res.status(500).json({ error: 'Error retrieving game details' });
  }
});

// Create a new game
app.post('/api/games', async (req, res) => {
  const gameId = generateShortId();
  const newGame = new Game({
    id: gameId,
    question: req.body.question || 'Make your prediction',
    maxPredictors: req.body.maxPredictors || 5,
  });
  try {
    await newGame.save();
    res.json({ gameId });
  } catch (error) {
    console.error('Error creating game:', error);
    res.status(500).json({ error: 'Error creating game' });
  }
});

// Join a game
app.post('/api/games/:gameId/join', async (req, res) => {
  const { gameId } = req.params;
  const { username } = req.body;
  
  if (!username || username.trim() === '') {
    return res.status(400).json({ error: 'Username is required' });
  }

  try {
    const game = await Game.findOne({ id: gameId });
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }
    
    // Check if game is already completed
    if (game.revealedToAll) {
      return res.status(400).json({ error: 'This game has already completed' });
    }
    
    // Check if game is full
    if (Object.keys(game.predictors).length >= game.maxPredictors) {
      return res.status(400).json({ error: 'Game is full' });
    }
    
    const predictorId = uuidv4();
    game.predictors.set(predictorId, {
      id: predictorId,
      username,
      avatarColor: getAvatarColor(Object.keys(game.predictors).length),
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
        predictionsCount: game.predictions.size,
      },
    });
  } catch (error) {
    console.error('Error joining game:', error);
    res.status(500).json({ error: 'Error joining game' });
  }
});

// Submit a prediction
app.post('/api/games/:gameId/predict', async (req, res) => {
  const { gameId } = req.params;
  const { predictorId, prediction } = req.body;
  
  if (!prediction || prediction.trim() === '') {
    return res.status(400).json({ error: 'Prediction cannot be empty' });
  }
  
  // Validate prediction length
  if (prediction.length > 1000) {
    return res.status(400).json({ error: 'Prediction is too long (maximum 1000 characters)' });
  }
  
  try {
    const game = await Game.findOne({ id: gameId });
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }
    
    if (game.revealedToAll) {
      return res.status(400).json({ error: 'This game has already completed' });
    }
    
    if (!game.predictors.has(predictorId)) {
      return res.status(403).json({ error: 'Not a valid predictor for this game' });
    }
    
    // Check if this predictor has already submitted
    if (game.predictions.has(predictorId)) {
      return res.status(400).json({ error: 'You have already submitted a prediction' });
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
    const allPredictionsSubmitted = predictionsCount === Object.keys(game.predictors).length;
    
    io.to(gameId).emit('prediction_update', {
      count: predictionsCount,
      total: Object.keys(game.predictors).length,
    });
    
    // If all connected players have submitted predictions
    if (allPredictionsSubmitted && !game.revealedToAll) {
      game.revealedToAll = true;
      await game.save();
      
      // Create properly formatted predictions array
      const predictionsArray = Array.from(game.predictions.entries()).map(([pid, predictionData]) => {
        const predictor = game.predictors.get(pid);
        return {
          predictor,
          prediction: predictionData
        };
      });
      
      io.to(gameId).emit('all_predictions_revealed', {
        predictions: predictionsArray
      });
    }
    
    res.json({ 
      success: true, 
      predictionsCount, 
      allPredictionsSubmitted 
    });
  } catch (error) {
    console.error('Error submitting prediction:', error);
    res.status(500).json({ error: 'Error submitting prediction' });
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
  const colors = ['#4361ee', '#3a0ca3', '#7209b7', '#f72585', '#4cc9f0', '#fb8500', '#2ec4b6', '#f94144', '#7209b7', '#3f37c9'];
  return colors[index % colors.length];
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});