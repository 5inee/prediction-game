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

  // Share game link elements
  const shareLink = document.createElement('div');
  shareLink.className = 'share-link';
  shareLink.innerHTML = `
    <p>Share this link with others to join:</p>
    <div class="link-container">
      <input type="text" id="gameLinkInput" readonly>
      <button id="copyLinkBtn">Copy</button>
    </div>
  `;

  // App State
  let currentGameId = null;
  let currentPredictorId = null;
  let hasSubmitted = false;

  // Check if we're on a game page
  const pathParts = window.location.pathname.split('/');
  if (pathParts[1] === 'game' && pathParts[2]) {
    const gameId = pathParts[2];
    checkExistingGame(gameId);
  }

  // Copy link functionality
  document.addEventListener('click', (e) => {
    if (e.target.id === 'copyLinkBtn') {
      const linkInput = document.getElementById('gameLinkInput');
      linkInput.select();
      document.execCommand('copy');
      e.target.textContent = 'Copied!';
      setTimeout(() => {
        e.target.textContent = 'Copy';
      }, 2000);
    }
  });

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
        body: JSON.stringify({ question }),
      });

      const data = await response.json();
      
      // Redirect to the game page
      window.location.href = `/game/${data.gameId}`;
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
      // Redirect to the game page
      window.location.href = `/game/${gameId}?username=${encodeURIComponent(username)}`;
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
      alert(error.message || 'Failed to submit prediction. Please try again.');
    }
  });

  async function checkExistingGame(gameId) {
    try {
      const response = await fetch(`/api/games/${gameId}`);
      
      if (!response.ok) {
        throw new Error('Game not found');
      }
      
      const data = await response.json();
      currentGameId = gameId;
      
      // Get the username from URL if present
      const urlParams = new URLSearchParams(window.location.search);
      const username = urlParams.get('username');
      
      // If we have an existing session
      if (data.game.userSession) {
        rejoinGame(data.game.userSession, data.game);
      } else if (username) {
        // Try to join with the username from URL
        joinGame(gameId, username);
      } else {
        // Show join screen with game ID pre-filled
        joinScreen.style.display = 'block';
        gameIdInput.value = gameId;
        gameIdInput.disabled = true;
      }
    } catch (error) {
      console.error('Error checking game:', error);
      joinScreen.style.display = 'block';
    }
  }

  async function joinGame(gameId, username) {
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

      // Set up the game
      currentGameId = data.game.id;
      currentPredictorId = data.predictorId;
      hasSubmitted = data.hasSubmitted;

      // Update UI
      joinScreen.style.display = 'none';
      gameScreen.style.display = 'block';

      userInfoElement.style.display = 'flex';
      usernameDisplay.textContent = username;
      userAvatar.textContent = username.charAt(0).toUpperCase();

      gameQuestionDisplay.textContent = data.game.question;
      gameCodeDisplay.textContent = data.game.id;
      
      // Update player count
      playerCountDisplay.textContent = `${data.game.predictorCount}/${data.game.maxPredictors} players`;
      
      // Display prediction count if there are any
      if (data.game.predictionsCount > 0) {
        predictionCount.style.display = 'block';
        predictionCount.textContent = `Predictions: ${data.game.predictionsCount}/${data.game.maxPredictors}`;
      }
      
      // Add game link for sharing
      document.querySelector('#gameCode').after(shareLink);
      const gameLinkInput = document.getElementById('gameLinkInput');
      gameLinkInput.value = `${window.location.origin}/game/${data.game.id}`;
      
      // Handle prediction state
      if (data.hasSubmitted) {
        predictionForm.style.display = 'none';
        statusMessage.style.display = 'block';
      } else if (data.game.allPredictionsSubmitted) {
        predictionForm.style.display = 'none';
      }
      
      // Connect to socket room
      socket.emit('join_game', currentGameId);

      // Clear URL parameters
      window.history.replaceState({}, document.title, `/game/${gameId}`);
    } catch (error) {
      console.error('Error joining game:', error);
      alert(error.message || 'Failed to join game. Please try again.');
      joinScreen.style.display = 'block';
    }
  }

  function rejoinGame(session, gameData) {
    // Set up the game with existing session data
    currentGameId = gameData.id;
    currentPredictorId = session.predictorId;
    hasSubmitted = session.hasSubmitted;

    // Update UI
    joinScreen.style.display = 'none';
    gameScreen.style.display = 'block';

    userInfoElement.style.display = 'flex';
    usernameDisplay.textContent = session.username;
    userAvatar.textContent = session.username.charAt(0).toUpperCase();

    gameQuestionDisplay.textContent = gameData.question;
    gameCodeDisplay.textContent = gameData.id;
    
    // Update player count
    playerCountDisplay.textContent = `${gameData.predictorCount}/${gameData.maxPredictors} players`;
    
    // Display prediction count if there are any
    if (gameData.predictionsCount > 0) {
      predictionCount.style.display = 'block';
      predictionCount.textContent = `Predictions: ${gameData.predictionsCount}/${gameData.maxPredictors}`;
    }
    
    // Add game link for sharing
    document.querySelector('#gameCode').after(shareLink);
    const gameLinkInput = document.getElementById('gameLinkInput');
    gameLinkInput.value = `${window.location.origin}/game/${gameData.id}`;
    
    // Handle prediction state
    if (session.hasSubmitted) {
      predictionForm.style.display = 'none';
      statusMessage.style.display = 'block';
    } else if (gameData.allPredictionsSubmitted) {
      predictionForm.style.display = 'none';
    }
    
    // Connect to socket room
    socket.emit('join_game', currentGameId);
    
    console.log('Rejoined game with session:', session);
  }

  // Socket event handlers
  socket.on('predictor_update', (data) => {
    // Update player count with the data from the server
    playerCountDisplay.textContent = `${data.count}/${data.total} players`;
  });

  socket.on('prediction_update', (data) => {
    // Update the prediction count display if needed
    if (predictionCount) {
      predictionCount.style.display = 'block';
      predictionCount.textContent = `Predictions: ${data.count}/${data.total}`;
    }
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

      const submittedAt = new Date(prediction.submittedAt);
      const timeString = submittedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      const formattedPrediction = prediction.content.replace(/\n/g, '<br>');

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
});