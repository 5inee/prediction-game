document.addEventListener('DOMContentLoaded', () => {
  const socket = io();
  
  // DOM Elements
  const joinScreen = document.getElementById('joinScreen');
  const createGameScreen = document.getElementById('createGameScreen');
  const gameScreen = document.getElementById('gameScreen');
  
  const gameIdInput = document.getElementById('gameId');
  const usernameInput = document.getElementById('username');
  const joinGameBtn = document.getElementById('joinGameBtn');
  const createGameBtn = document.getElementById('createGameBtn');
  
  const gameQuestionInput = document.getElementById('gameQuestion');
  const createNewGameBtn = document.getElementById('createNewGameBtn');
  const backToJoinBtn = document.getElementById('backToJoinBtn');
  
  const userInfoElement = document.getElementById('userInfo');
  const usernameDisplay = document.getElementById('usernameDisplay');
  const userAvatar = document.getElementById('userAvatar');
  
  const gameQuestionDisplay = document.querySelector('#gameScreen .game-title');
  const gameCodeDisplay = document.querySelector('#gameCode span');
  const waitingMessage = document.getElementById('waitingMessage');
  const playerCountDisplay = document.querySelector('.player-count');
  
  const predictionForm = document.getElementById('predictionForm');
  const predictionInput = document.getElementById('prediction');
  const submitPredictionBtn = document.getElementById('submitPredictionBtn');
  
  const statusMessage = document.getElementById('statusMessage');
  const predictionCount = document.getElementById('predictionCount');
  const predictionsList = document.getElementById('predictionsList');
  const predictionsContainer = document.getElementById('predictionsContainer');
  
  // App State
  let currentGameId = null;
  let currentPredictorId = null;
  let hasSubmitted = false;
  
  // Event Listeners
  createGameBtn.addEventListener('click', () => {
    joinScreen.style.display = 'none';
    createGameScreen.style.display = 'block';
  });
  
  backToJoinBtn.addEventListener('click', () => {
    createGameScreen.style.display = 'none';
    joinScreen.style.display = 'block';
  });
  
  createNewGameBtn.addEventListener('click', async () => {
    const question = gameQuestionInput.value.trim();
    if (!question) {
      alert('Please enter a question for the game');
      return;
    }
    
    try {
      const response = await fetch('/api/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question })
      });
      
      const data = await response.json();
      gameIdInput.value = data.gameId;
      
      createGameScreen.style.display = 'none';
      joinScreen.style.display = 'block';
      
      alert(`Game created! Your Game Code is: ${data.gameId}`);
    } catch (error) {
      console.error('Error creating game:', error);
      alert('Failed to create game. Please try again.');
    }
  });
  
  joinGameBtn.addEventListener('click', async () => {
    const gameId = gameIdInput.value.trim();
    const username = usernameInput.value.trim();
    
    if (!gameId || !username) {
      alert('Please enter both Game ID and your name');
      return;
    }
    
    try {
      const response = await fetch(`/api/games/${gameId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to join game');
      }
      
      const data = await response.json();
      currentGameId = data.game.id;
      currentPredictorId = data.predictorId;
      
      joinScreen.style.display = 'none';
      gameScreen.style.display = 'block';
      
      userInfoElement.style.display = 'flex';
      usernameDisplay.textContent = username;
      userAvatar.textContent = username.charAt(0).toUpperCase();
      
      gameQuestionDisplay.textContent = data.game.question;
      gameCodeDisplay.textContent = data.game.id;
      playerCountDisplay.textContent = `${data.game.predictorCount}/${data.game.maxPredictors}`;
      
      socket.emit('join_game', currentGameId);
    } catch (error) {
      console.error('Error joining game:', error);
      alert(error.message || 'Failed to join game. Please try again.');
    }
  });
  
  submitPredictionBtn.addEventListener('click', async () => {
    const prediction = predictionInput.value.trim();
    
    if (!prediction) {
      alert('Please enter your prediction');
      return;
    }
    
    if (hasSubmitted) {
      alert('You have already submitted a prediction');
      return;
    }
    
    try {
      const response = await fetch(`/api/games/${currentGameId}/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ predictorId: currentPredictorId, prediction })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to submit prediction');
      }
      
      statusMessage.style.display = 'block';
      hasSubmitted = true;
    } catch (error) {
      console.error('Error submitting prediction:', error);
      alert(error.message || 'Failed to submit prediction. Please try again.');
    }
  });
  
  socket.on('prediction_update', (data) => {
    predictionCount.textContent = `${data.count} of ${data.total} predictions submitted`;
  });
  
  socket.on('all_predictions_revealed', (data) => {
    statusMessage.style.display = 'none';
    predictionCount.style.display = 'none';
    predictionsContainer.innerHTML = '';
    
    data.predictions.forEach(item => {
      const { predictor, prediction } = item;
      const formattedPrediction = prediction.content.replace(/\n/g, '<br>');
      
      const predictionCard = document.createElement('div');
      predictionCard.className = 'prediction-card';
      predictionCard.innerHTML = `<strong>${predictor.username}:</strong> ${formattedPrediction}`;
      
      predictionsContainer.appendChild(predictionCard);
    });
    
    predictionsList.style.display = 'block';
  });
});