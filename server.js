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

// Improved avatar color selection
function getAvatarColor(index) {
  // Expanded color palette with distinct colors
  const colors = [
    '#4361ee', // blue
    '#3a0ca3', // deep purple
    '#7209b7', // purple
    '#f72585', // pink
    '#4cc9f0', // light blue
    '#43aa8b', // teal
    '#f9c74f', // yellow
    '#90be6d', // green
    '#f8961e', // orange
    '#e63946'  // red
  ];
  
  // Ensure we're using the right index (between 0 and colors.length-1)
  return colors[index % colors.length];
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
    
    // Get the current count of predictors to assign color
    const predictorCount = Object.keys(game.predictors).length;
    const predictorId = uuidv4();
    
    game.predictors.set(predictorId, {
      id: predictorId,
      username,
      avatarColor: getAvatarColor(predictorCount),
      joinedAt: new Date(),
    });
    
    await game.save();
    
    // Update the player count (predictors)
    const updatedPredictorCount = Object.keys(game.predictors).length;
    io.to(gameId).emit('predictor_update', {
<<<<<<< HEAD
      count: updatedPredictorCount,
=======
      count: predictorCount + 1,
>>>>>>> origin/main
      total: game.maxPredictors,
    });
    
    res.json({
      predictorId,
      game: {
        id: game.id,
        question: game.question,
<<<<<<< HEAD
        predictorCount: updatedPredictorCount,
=======
        predictorCount: predictorCount + 1,
>>>>>>> origin/main
        maxPredictors: game.maxPredictors,
      },
    });
  } catch (error) {
    res.status(500).json({ error: 'Error joining game' });
  }
});

// Submit a prediction
app.post('/api/games/:gameId/predict', async (req, res) => {
  const { gameId } = req.params;
  const { predictorId, prediction } = req.body;
  try {
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
    
    // Get the updated counts
    const predictionsCount = game.predictions.size;
    const allPredictionsSubmitted = predictionsCount === Object.keys(game.predictors).length;
    
    // Send prediction update to all clients
    io.to(gameId).emit('prediction_update', {
      count: predictionsCount,
      total: Object.keys(game.predictors).length,
    });
    
    if (allPredictionsSubmitted && !game.revealedToAll) {
      game.revealedToAll = true;
      await game.save();
      
      // Create predictions array with correct structure
      const predictionsArray = [];
      
      // Iterate through each prediction
      for (const [pid, predictionData] of game.predictions.entries()) {
        // Get the predictor information
        const predictor = game.predictors.get(pid);
        
        // Add to the array with the right structure
        predictionsArray.push({
          predictor,
          prediction: predictionData
        });
      }
      
      io.to(gameId).emit('all_predictions_revealed', {
        predictions: predictionsArray
      });
    }
    
    res.json({ 
      success: true, 
      predictionsCount, 
      predictorsCount: Object.keys(game.predictors).length,
      allPredictionsSubmitted 
    });
  } catch (error) {
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

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
