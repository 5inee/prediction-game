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

// Get game data
app.get('/api/games/:gameId', async (req, res) => {
  const { gameId } = req.params;
  try {
    const game = await Game.findOne({ id: gameId });
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }

    // Return a sanitized game object with counts
    res.json({
      id: game.id,
      question: game.question,
      predictorCount: Object.keys(game.predictors).length,
      maxPredictors: game.maxPredictors,
      predictionCount: Object.keys(game.predictions).length,
      revealedToAll: game.revealedToAll
    });
  } catch (error) {
    console.error('Error getting game:', error);
    res.status(500).json({ error: 'Error retrieving game' });
  }
});

// Create a new game
app.post('/api/games', async (req, res) => {
  try {
    const gameId = generateShortId();
    const maxPredictors = req.body.maxPredictors || 5; // Allow custom max players
    const newGame = new Game({
      id: gameId,
      question: req.body.question || 'Make your prediction',
      maxPredictors: maxPredictors,
    });
    
    await newGame.save();
    res.json({ gameId, maxPredictors });
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
    
    // Emit updadate to all clients in the room
    io.to(gameId).emit('predictor_update', {
      count: Object.keys(game.predictors).length,
      total: game.maxPredictors,
      predictors: Array.from(game.predictors.values())
    });
    
    res.json({
      predictorId,
      game: {
        id: game.id,
        question: game.question,
        predictorCount: Object.keys(game.predictors).length,
        maxPredictors: game.maxPredictors,
        predictionCount: Object.keys(game.predictions).length,
        revealedToAll: game.revealedToAll
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
  
  try {
    const game = await Game.findOne({ id: gameId });
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }
    
    if (!game.predictors.has(predictorId)) {
      return res.status(403).json({ error: 'Not a valid predictor for this game' });
    }
    
    if (game.predictions.has(predictorId)) {
      return res.status(400).json({ error: 'You have already submitted a prediction' });
    }
    
    if (game.predictions.size >= game.maxPredictors) {
      return res.status(400).json({ error: 'Maximum predictions reached, game is closed' });
    }
    
    // Add the prediction
    game.predictions.set(predictorId, {
      content: prediction,
      submittedAt: new Date(),
    });
    
    await game.save();
    
    const predictionsCount = game.predictions.size;
    const allPredictionsSubmitted = predictionsCount === Object.keys(game.predictors).length;
    
    // Send update to all clients about prediction count
    io.to(gameId).emit('prediction_update', {
      count: predictionsCount,
      total: Object.keys(game.predictors).length,
    });
    
    // Check if all predictions are in and game should be revealed
    if (allPredictionsSubmitted && !game.revealedToAll) {
      game.revealedToAll = true;
      await game.save();
      
      // Create properly formatted predictions array
      const predictionsArray = [];
      
      for (const [pid, predictionData] of game.predictions.entries()) {
        const predictor = game.predictors.get(pid);
        if (predictor) { // Make sure predictor exists
          predictionsArray.push({
            predictor: { ...predictor },
            prediction: { ...predictionData }
          });
        }
      }
      
      // Emit the reveal event with all predictions
      io.to(gameId).emit('all_predictions_revealed', {
        predictions: predictionsArray
      });
    }
    
    res.json({ 
      success: true, 
      predictionsCount, 
      totalPredictors: Object.keys(game.predictors).length,
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
  
  socket.on('join_game', async (gameId) => {
    socket.join(gameId);
    
    // Send current game state
    try {
      const game = await Game.findOne({ id: gameId });
      if (game) {
        socket.emit('game_state', {
          predictorCount: Object.keys(game.predictors).length,
          maxPredictors: game.maxPredictors,
          predictionCount: Object.keys(game.predictions).length,
          revealedToAll: game.revealedToAll
        });
        
        // If game is already revealed, send all predictions to the new client
        if (game.revealedToAll) {
          const predictionsArray = [];
          
          for (const [pid, predictionData] of game.predictions.entries()) {
            const predictor = game.predictors.get(pid);
            if (predictor) {
              predictionsArray.push({
                predictor: { ...predictor },
                prediction: { ...predictionData }
              });
            }
          }
          
          socket.emit('all_predictions_revealed', {
            predictions: predictionsArray
          });
        }
      }
    } catch (error) {
      console.error('Error fetching game state for socket:', error);
    }
  });
  
  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});

// Function to get avatar color
function getAvatarColor(index) {
  const colors = ['#4361ee', '#3a0ca3', '#7209b7', '#f72585', '#4cc9f0', '#f94144', '#f8961e', '#90be6d', '#43aa8b'];
  return colors[index % colors.length];
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});