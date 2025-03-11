document.addEventListener('DOMContentLoaded', () => {
  const socket = io();

  // DOM Elements
  const joinScreen = document.getElementById('joinScreen');
  const createGameScreen = document.getElementById('createGameScreen');
  const gameScreen = document.getElementById('gameScreen');
  const gameResultScreen = document.getElementById('gameResultScreen');

  const gameIdInput = document.getElementById('gameId');
  const usernameInput = document.getElementById('username');
  const joinGameBtn = document.getElementById('joinGameBtn');
  const createGameBtn = document.getElementById('createGameBtn');
  const invalidGameMessage = document.getElementById('invalidGameMessage');

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

  const predictionForm = document.getElementById('predictionForm');
  const predictionInput = document.getElementById('prediction');
  const charCountDisplay = document.getElementById('charCountDisplay');
  const submitPredictionBtn = document.getElementById('submitPredictionBtn');

  const statusMessage = document.getElementById('statusMessage');
  const predictionCount = document.getElementById('predictionCount');
  const predictionsList = document.getElementById('predictionsList');
  const predictionsContainer = document.getElementById('predictionsContainer');
  const copyLinkBtn = document.getElementById('copyLinkBtn');

  // Loading spinners
  const joinSpinner = document.getElementById('joinSpinner');
  const createSpinner = document.getElementById('createSpinner');
  const submitSpinner = document.getElementById('submitSpinner');

  // App State
  let currentGameId = null;
  let currentPredictorId = null;
  let hasSubmitted = false;
  let maxPredictorsValue = 5;

  // Init from URL params if present (for direct joining)
  initFromUrlParams();

  // Event Listeners
  createGameBtn.addEventListener('click', () => {
    joinScreen.style.display = 'none';
    createGameScreen.style.display = 'block';
  });

  backToJoinBtn.addEventListener('click', () => {
    createGameScreen.style.display = 'none';
    joinScreen.style.display = 'block';
  });

  // Character counter for prediction input
  if (predictionInput) {
    predictionInput.addEventListener('input', () => {
      const currentLength = predictionInput.value.length;
      const maxLength = 1000;
      charCountDisplay.textContent = `${currentLength}/${maxLength}`;
      
      if (currentLength > maxLength) {
        charCountDisplay.classList.add('text-danger');
        submitPredictionBtn.disabled = true;
      } else {
        charCountDisplay.classList.remove('text-danger');
        submitPredictionBtn.disabled = false;
      }
    });
  }

  // Copy game link button
  if (copyLinkBtn) {
    copyLinkBtn.addEventListener('click', () => {
      const gameLink = `${window.location.origin}?game=${currentGameId}`;
      navigator.clipboard.writeText(gameLink)
        .then(() => {
          copyLinkBtn.textContent = 'Copied!';
          setTimeout(() => {
            copyLinkBtn.textContent = 'Copy Game Link';
          }, 2000);
        })
        .catch(err => {
          console.error('Could not copy text: ', err);
        });
    });
  }

  // Max predictors input handler
  if (maxPredictorsInput) {
    maxPredictorsInput.addEventListener('change', () => {
      maxPredictorsValue = parseInt(maxPredictorsInput.value) || 5;
    });
  }

  createNewGameBtn.addEventListener('click', async () => {
    const question = gameQuestionInput.value.trim();
    if (!question) {
      showToast('Please enter a question for the game');
      return;
    }

    // Disable button and show spinner
    createNewGameBtn.disabled = true;
    createSpinner.style.display = 'inline-block';

    try {
      const response = await fetch('/api/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          question,
          maxPredictors: maxPredictorsValue
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create game');
      }

      const data = await response.json();
      gameIdInput.value = data.gameId;

      createGameScreen.style.display = 'none';
      joinScreen.style.display = 'block';

      showToast(`Game created! Your Game Code is: ${data.gameId}`);
    } catch (error) {
      console.error('Error creating game:', error);
      showToast('Failed to create game. Please try again.');
    } finally {
      createNewGameBtn.disabled = false;
      createSpinner.style.display = 'none';
    }
  });

  joinGameBtn.addEventListener('click', joinGame);

  submitPredictionBtn.addEventListener('click', async () => {
    const prediction = predictionInput.value.trim();

    if (!prediction) {
      showToast('Please enter your prediction');
      return;
    }

    if (prediction.length > 1000) {
      showToast('Your prediction is too long (maximum 1000 characters)');
      return;
    }

    if (hasSubmitted) {
      showToast('You have already submitted a prediction');
      return;
    }

    // Disable button and show spinner
    submitPredictionBtn.disabled = true;
    submitSpinner.style.display = 'inline-block';

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
    } catch (error) {
      console.error('Error submitting prediction:', error);
      showToast(error.message || 'Failed to submit prediction. Please try again.');
    } finally {
      submitPredictionBtn.disabled = false;
      submitSpinner.style.display = 'none';
    }
  });

  // Helper function to join game (used by button and URL params)
  async function joinGame() {
    const gameId = gameIdInput.value.trim();
    const username = usernameInput.value.trim();

    if (!gameId || !username) {
      showToast('Please enter both Game ID and your name');
      return;
    }

    // Hide any previous error message
    invalidGameMessage.style.display = 'none';

    // Disable button and show spinner
    joinGameBtn.disabled = true;
    joinSpinner.style.display = 'inline-block';

    try {
      // First check if game exists and is active
      const gameCheckResponse = await fetch(`/api/games/${gameId}`);
      
      if (!gameCheckResponse.ok) {
        throw new Error('Game not found or no longer active');
      }
      
      const gameData = await gameCheckResponse.json();
      
      // Check if game is already completed
      if (gameData.isCompleted) {
        throw new Error('This game has already completed');
      }

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

      // Set up the game
      currentGameId = data.game.id;
      currentPredictorId = data.predictorId;

      // Update browser URL with game ID for sharing
      window.history.replaceState({}, '', `?game=${currentGameId}`);

      // Update UI
      joinScreen.style.display = 'none';
      gameScreen.style.display = 'block';

      userInfoElement.style.display = 'flex';
      usernameDisplay.textContent = username;
      userAvatar.textContent = username.charAt(0).toUpperCase();

      gameQuestionDisplay.textContent = data.game.question;
      gameCodeDisplay.textContent = data.game.id;
      playerCountDisplay.textContent = `${data.game.predictorCount}/${data.game.maxPredictors}`;

      // Show prediction count if some predictions already exist
      if (data.game.predictionsCount > 0) {
        predictionCount.style.display = 'block';
        predictionCount.textContent = `${data.game.predictionsCount} of ${data.game.predictorCount} predictions submitted`;
      }

      // Connect to socket room
      socket.emit('join_game', currentGameId);
    } catch (error) {
      console.error('Error joining game:', error);
      invalidGameMessage.style.display = 'block';
      invalidGameMessage.textContent = error.message || 'Failed to join game. Please try again.';
    } finally {
      joinGameBtn.disabled = false;
      joinSpinner.style.display = 'none';
    }
  }

  // Socket event handlers
  socket.on('predictor_update', (data) => {
    playerCountDisplay.textContent = `${data.count}/${data.total}`;
  });

  socket.on('prediction_update', (data) => {
    predictionCount.style.display = 'block';
    predictionCount.textContent = `${data.count} of ${data.total} predictions submitted`;
  });

  socket.on('all_predictions_revealed', (data) => {
    statusMessage.style.display = 'none';
    predictionCount.style.display = 'none';
    predictionsContainer.innerHTML = '';

    data.predictions.forEach((item) => {
      const { predictor, prediction } = item;
      const isCurrentUser = predictor.id === currentPredictorId;

      const predictionCard = document.createElement('div');
      predictionCard.className = 'prediction-card';
      if (isCurrentUser) {
        predictionCard.classList.add('current-user');
      }

      const submittedAt = new Date(prediction.submittedAt);
      const timeString = submittedAt.toLocaleTimeString();

      // Sanitize prediction content to prevent XSS
      const tempDiv = document.createElement('div');
      tempDiv.textContent = prediction.content;
      const safeContent = tempDiv.textContent;
      const formattedPrediction = safeContent.replace(/\n/g, '<br>');

      predictionCard.innerHTML = `
        <div class="prediction-header">
          <div class="predictor-info">
            <div class="predictor-avatar" style="background-color: ${predictor.avatarColor}">
              ${predictor.username.charAt(0).toUpperCase()}
            </div>
            <div class="predictor-name">
              ${predictor.username} ${isCurrentUser ? '(You)' : ''}
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

  // Helper functions
  function showToast(message) {
    // Check if a toast container exists, create if not
    let toastContainer = document.getElementById('toast-container');
    if (!toastContainer) {
      toastContainer = document.createElement('div');
      toastContainer.id = 'toast-container';
      document.body.appendChild(toastContainer);
    }

    // Create and add the toast
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    toastContainer.appendChild(toast);

    // Remove the toast after animation
    setTimeout(() => {
      toast.classList.add('show');
      setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
          toastContainer.removeChild(toast);
        }, 300);
      }, 3000);
    }, 10);
  }

  function initFromUrlParams() {
    const urlParams = new URLSearchParams(window.location.search);
    const gameId = urlParams.get('game');
    
    if (gameId) {
      gameIdInput.value = gameId;
      // Focus on the username input since the game ID is already filled
      usernameInput.focus();
    }
  }
});