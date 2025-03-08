const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static('public'));
app.use(express.json());

// Store active games
const games = {};

// Function to generate a short game ID
function generateShortId() {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let shortId = '';
  for (let i = 0; i < 6; i++) {
    shortId += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return shortId;
}

// Create a new game
app.post('/api/games', (req, res) => {
  const gameId = generateShortId();
  games[gameId] = {
    id: gameId,
    question: req.body.question || 'Make your prediction',
    predictions: {},
    predictors: {},
    maxPredictors: 5,
    revealedToAll: false
  };
  
  res.json({ gameId });
});

// Join a game
app.post('/api/games/:gameId/join', (req, res) => {
  const { gameId } = req.params;
  const { username } = req.body;
  
  if (!games[gameId]) {
    return res.status(404).json({ error: 'Game not found' });
  }
  
  const game = games[gameId];
  const predictorCount = Object.keys(game.predictors).length;
  
  if (predictorCount >= game.maxPredictors) {
    return res.status(400).json({ error: 'Game is full' });
  }
  
  const predictorId = uuidv4();
  game.predictors[predictorId] = {
    id: predictorId,
    username,
    avatarColor: getAvatarColor(predictorCount),
    joinedAt: new Date()
  };
  
  // Notify all users about the new predictor count
  io.to(gameId).emit('predictor_update', { 
    count: Object.keys(game.predictors).length, 
    total: game.maxPredictors 
  });
  
  res.json({ 
    predictorId, 
    game: {
      id: game.id,
      question: game.question,
      predictorCount: Object.keys(game.predictors).length,
      maxPredictors: game.maxPredictors
    } 
  });
});

// Submit a prediction
app.post('/api/games/:gameId/predict', (req, res) => {
  const { gameId } = req.params;
  const { predictorId, prediction } = req.body;
  
  if (!games[gameId]) {
    return res.status(404).json({ error: 'Game not found' });
  }
  
  const game = games[gameId];
  
  if (!game.predictors[predictorId]) {
    return res.status(403).json({ error: 'Not a valid predictor for this game' });
  }
  
  if (game.predictions[predictorId]) {
    return res.status(400).json({ error: 'You have already submitted a prediction' });
  }
  
  const timestamp = new Date();
  game.predictions[predictorId] = {
    content: prediction,
    submittedAt: timestamp
  };
  
  const predictionsCount = Object.keys(game.predictions).length;
  const allPredictionsSubmitted = predictionsCount === game.maxPredictors;
  
  // Notify all users about the new prediction count
  io.to(gameId).emit('prediction_update', { 
    count: predictionsCount, 
    total: game.maxPredictors 
  });
  
  // If all predictions submitted, reveal to everyone
  if (allPredictionsSubmitted && !game.revealedToAll) {
    game.revealedToAll = true;
    
    const revealData = {
      predictions: Object.keys(game.predictions).map(pid => ({
        predictor: game.predictors[pid],
        prediction: game.predictions[pid]
      }))
    };
    
    io.to(gameId).emit('all_predictions_revealed', revealData);
  }
  
  res.json({ 
    success: true, 
    predictionsCount, 
    allPredictionsSubmitted 
  });
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

function getAvatarColor(index) {
  const colors = [
    '#4361ee', // blue
    '#3a0ca3', // indigo
    '#7209b7', // purple
    '#f72585', // pink
    '#4cc9f0'  // light blue
  ];
  return colors[index % colors.length];
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});