require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const Game = require('./models/Game');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const MongoStore = require('connect-mongo');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static('public'));
app.use(express.json());
app.use(cookieParser());

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'prediction-game-secret',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ 
    mongoUrl: process.env.MONGO_URI,
    ttl: 9 * 60 // 9 minutes in seconds
  }),
  cookie: { 
    maxAge: 9 * 60 * 1000 // 9 minutes in milliseconds
  }
}));

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

// Serve the game page for specific game IDs
app.get('/game/:gameId', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

// Create a new game
app.post('/api/games', async (req, res) => {
  const gameId = generateShortId();
  const newGame = new Game({
    id: gameId,
    question: req.body.question || 'Make your prediction',
    maxPredictors: 4, // Default max players
  });
  try {
    await newGame.save();
    res.json({ gameId });
  } catch (error) {
    res.status(500).json({ error: 'Error creating game' });
  }
});

// Get game details
app.get('/api/games/:gameId', async (req, res) => {
  const { gameId } = req.params;
  try {
    const game = await Game.findOne({ id: gameId });
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }
    
    // Check if user has an active session for this game
    const predictorId = req.session.predictorData?.[gameId]?.predictorId;
    const isExistingPredictor = predictorId && game.predictors.has(predictorId);
    
    res.json({ 
      game: {
        id: game.id,
        question: game.question,
        predictorCount: Object.keys(game.predictors).length,
        maxPredictors: game.maxPredictors,
        predictionsCount: game.predictions.size,
        allPredictionsSubmitted: game.revealedToAll,
        userSession: isExistingPredictor ? {
          predictorId,
          username: game.predictors.get(predictorId).username,
          hasSubmitted: game.predictions.has(predictorId)
        } : null
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Error getting game details' });
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
    
    // Check if this is a rejoin using session
    let predictorId = req.session.predictorData?.[gameId]?.predictorId;
    let isRejoin = false;
    
    // If the predictor exists in the game, this is a rejoin
    if (predictorId && game.predictors.has(predictorId)) {
      isRejoin = true;
    } else {
      // This is a new join
      if (Object.keys(game.predictors).length >= game.maxPredictors) {
        return res.status(400).json({ error: 'Game is full' });
      }
      
      predictorId = uuidv4();
      game.predictors.set(predictorId, {
        id: predictorId,
        username,
        avatarColor: getAvatarColor(Object.keys(game.predictors).length),
        joinedAt: new Date(),
      });
      
      await game.save();
      
      // Initialize session data if not exists
      if (!req.session.predictorData) {
        req.session.predictorData = {};
      }
      
      // Store predictor data in session
      req.session.predictorData[gameId] = {
        predictorId,
        username
      };
    }
    
    io.to(gameId).emit('predictor_update', {
      count: Object.keys(game.predictors).length,
      total: game.maxPredictors,
    });
    
    const hasSubmitted = game.predictions.has(predictorId);
    
    res.json({
      predictorId,
      isRejoin,
      hasSubmitted,
      game: {
        id: game.id,
        question: game.question,
        predictorCount: Object.keys(game.predictors).length,
        maxPredictors: game.maxPredictors,
        predictionsCount: game.predictions.size,
        allPredictionsSubmitted: game.revealedToAll
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
    const allPredictionsSubmitted = predictionsCount === game.maxPredictors;
    
    io.to(gameId).emit('prediction_update', {
      count: predictionsCount,
      total: game.maxPredictors,
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
    
    res.json({ success: true, predictionsCount, allPredictionsSubmitted });
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

// Function to get avatar color
function getAvatarColor(index) {
  const colors = ['#4361ee', '#3a0ca3', '#7209b7', '#f72585', '#4cc9f0'];
  return colors[index % colors.length];
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});