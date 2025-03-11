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
  const maxPredictorsInput = document.getElementById('maxPredictors');
  const createNewGameBtn = document.getElementById('createNewGameBtn');
  const backToJoinBtn = document.getElementById('backToJoinBtn');

  const userInfoElement = document.getElementById('userInfo');
  const usernameDisplay = document.getElementById('usernameDisplay');
  const userAvatar = document.getElementById('userAvatar');

  const gameQuestionDisplay = document.querySelector('#gameScreen .game-title');
  const gameCodeDisplay = document.querySelector('#gameCode span');
  const waitingMessage = document.getElementById('waitingMessage');
  const playerCountDisplay = document.querySelector('.player-count');
  const playersList = document.getElementById('playersList');

  const predictionForm = document.getElementById('predictionForm');
  const predictionInput = document.getElementById('prediction');
  const submitPredictionBtn = document.getElementById('submitPredictionBtn');

  const statusMessage = document.getElementById('statusMessage');
  const predictionCount = document.getElementById('predictionCount');
  const predictionsList = document.getElementById('predictionsList');
  const predictionsContainer = document.getElementById('predictionsContainer');
  const copyGameLinkBtn = document.getElementById('copyGameLink');

  // App State
  let currentGameId = null;
  let currentPredictorId = null;
  let hasSubmitted = false;
  let appState = {
    game: null,
    user: null
  };

  // Helper Functions
  function showScreen(screenId) {
    joinScreen.style.display = screenId === 'joinScreen' ? 'block' : 'none';
    createGameScreen.style.display = screenId === 'createGameScreen' ? 'block' : 'none';
    gameScreen.style.display = screenId === 'gameScreen' ? 'block' : 'none';
  }

  function showMessage(message, isError = false) {
    const toast = document.createElement('div');
    toast.className = `toast ${isError ? 'toast-error' : 'toast-success'}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
      toast.classList.add('show');
    }, 10);
    
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => {
        document.body.removeChild(toast);
      }, 300);
    }, 3000);
  }

  function updatePlayersList(players) {
    if (!playersList) return;
    
    playersList.innerHTML = '';
    players.forEach(player => {
      const playerItem = document.createElement('div');
      playerItem.className = 'player-item';
      playerItem.innerHTML = `
        <div class="player-avatar" style="background-color: ${player.avatarColor}">
          ${player.username.charAt(0).toUpperCase()}
        </div>
        <span>${player.username}</span>
      `;
      playersList.appendChild(playerItem);
    });
  }

  // Event Listeners
  createGameBtn.addEventListener('click', () => {
    showScreen('createGameScreen');
  });

  backToJoinBtn.addEventListener('click', () => {
    showScreen('joinScreen');
  });

  createNewGameBtn.addEventListener('click', async () => {
    const question = gameQuestionInput.value.trim();
    if (!question) {
      showMessage('Please enter a question for the game', true);
      return;
    }

    try {
      const maxPredictors = parseInt(maxPredictorsInput?.value || "5", 10);
      
      const response = await fetch('/api/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          question,
          maxPredictors: maxPredictors > 0 ? maxPredictors : 5
        }),
      });

      const data = await response.json();
      if (response.ok) {
        gameIdInput.value = data.gameId;
        showScreen('joinScreen');
        showMessage(`Game created! Your Game Code is: ${data.gameId}`);
      } else {
        throw new Error(data.error || 'Failed to create game');
      }
    } catch (error) {
      console.error('Error creating game:', error);
      showMessage('Failed to create game. Please try again.', true);
    }
  });

  joinGameBtn.addEventListener('click', async () => {
    const gameId = gameIdInput.value.trim();
    const username = usernameInput.value.trim();

    if (!gameId || !username) {
      showMessage('Please enter both Game ID and your name', true);
      return;
    }

    try {
      const response = await fetch(`/api/games/${gameId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to join game');
      }

      const data = await response.json();

      // Set up the game state
      currentGameId = data.game.id;
      currentPredictorId = data.predictorId;
      appState.game = data.game;
      appState.user = {
        id: data.predictorId,
        username: username
      };

      // Update UI
      showScreen('gameScreen');
      userInfoElement.style.display = 'flex';
      usernameDisplay.textContent = username;
      userAvatar.textContent = username.charAt(0).toUpperCase();

      gameQuestionDisplay.textContent = data.game.question;
      gameCodeDisplay.textContent = data.game.id;
      playerCountDisplay.textContent = `${data.game.predictorCount}/${data.game.maxPredictors}`;
      
      // Show appropriate UI based on game state
      if (data.game.revealedToAll) {
        predictionForm.style.display = 'none';
        statusMessage.style.display = 'block';
        statusMessage.textContent = 'All predictions have been submitted. Check out the results below!';
      }

      // Connect to socket room
      socket.emit('join_game', currentGameId);
      
      // If the game has a "Copy Link" button, set up sharing
      if (copyGameLinkBtn) {
        copyGameLinkBtn.addEventListener('click', () => {
          const gameUrl = `${window.location.origin}?gameId=${currentGameId}`;
          navigator.clipboard.writeText(gameUrl)
            .then(() => showMessage('Game link copied to clipboard!'))
            .catch(err => showMessage('Failed to copy link', true));
        });
      }
    } catch (error) {
      console.error('Error joining game:', error);
      showMessage(error.message || 'Failed to join game. Please try again.', true);
    }
  });

  submitPredictionBtn.addEventListener('click', async () => {
    const prediction = predictionInput.value.trim();

    if (!prediction) {
      showMessage('Please enter your prediction', true);
      return;
    }

    if (hasSubmitted) {
      showMessage('You have already submitted a prediction', true);
      return;
    }

    try {
      const response = await fetch(`/api/games/${currentGameId}/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          predictorId: currentPredictorId,
          prediction,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to submit prediction');
      }

      const data = await response.json();

      // Update UI
      predictionForm.style.display = 'none';
      statusMessage.style.display = 'block';
      hasSubmitted = true;
      showMessage('Your prediction has been submitted!');
      
      // Update prediction count
      predictionCount.textContent = `${data.predictionsCount} of ${data.totalPredictors} predictions submitted`;
    } catch (error) {
      console.error('Error submitting prediction:', error);
      showMessage(error.message || 'Failed to submit prediction. Please try again.', true);
    }
  });

  // Check for gameId in URL params when page loads
  window.addEventListener('load', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const gameIdParam = urlParams.get('gameId');
    
    if (gameIdParam) {
      gameIdInput.value = gameIdParam;
      // Focus on username input instead since gameId is already filled
      usernameInput.focus();
      showMessage(`Game code ${gameIdParam} detected from URL`);
    }
  });

  // Socket event handlers
  socket.on('predictor_update', (data) => {
    playerCountDisplay.textContent = `${data.count}/${data.total}`;
    
    // Update players list if available
    if (data.predictors) {
      updatePlayersList(data.predictors);
    }
  });

  socket.on('prediction_update', (data) => {
    predictionCount.textContent = `${data.count} of ${data.total} predictions submitted`;
  });

  socket.on('game_state', (data) => {
    // Update UI based on current game state
    playerCountDisplay.textContent = `${data.predictorCount}/${data.maxPredictors}`;
    
    // If game is already in "revealed" state but we're just joining
    if (data.revealedToAll) {
      predictionForm.style.display = 'none';
      statusMessage.style.display = 'block';
      statusMessage.textContent = 'All predictions have been submitted. Check out the results below!';
    }
  });

  socket.on('all_predictions_revealed', (data) => {
    statusMessage.style.display = 'none';
    predictionCount.style.display = 'none';
    predictionsContainer.innerHTML = '';

    if (!data.predictions || data.predictions.length === 0) {
      predictionsContainer.innerHTML = '<div class="empty-state">No predictions were submitted.</div>';
      predictionsList.style.display = 'block';
      return;
    }

    data.predictions.forEach((item) => {
      const { predictor, prediction } = item;
      if (!predictor || !prediction) return; // Skip if data is invalid
      
      const isCurrentUser = predictor.id === currentPredictorId;

      const predictionCard = document.createElement('div');
      predictionCard.className = `prediction-card ${isCurrentUser ? 'prediction-card-self' : ''}`;

      const submittedAt = new Date(prediction.submittedAt);
      const timeString = submittedAt.toLocaleTimeString();

      // Safely format prediction content with line breaks
      const formattedPrediction = prediction.content
        ? prediction.content.replace(/\n/g, '<br>')
        : '';

      predictionCard.innerHTML = `
        <div class="prediction-header">
          <div class="predictor-info">
            <div class="predictor-avatar" style="background-color: ${predictor.avatarColor || '#ccc'}">
              ${predictor.username ? predictor.username.charAt(0).toUpperCase() : '?'}
            </div>
            <div class="predictor-name">
              ${predictor.username || 'Unknown'} ${isCurrentUser ? '(You)' : ''}
            </div>
          </div>
          <div class="timestamp">${timeString}</div>
        </div>
        <div class="prediction-content">${formattedPrediction}</div>
      `;

      predictionsContainer.appendChild(predictionCard);
    });

    predictionsList.style.display = 'block';
  });
});