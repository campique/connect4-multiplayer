const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

app.use(express.static('public'));

const games = {};

io.on('connection', (socket) => {
  console.log('A user connected');

  socket.on('createGame', () => {
    const gameId = Math.random().toString(36).substring(2, 8).toUpperCase();
    games[gameId] = {
      red: socket.id,
      gameState: Array(6).fill().map(() => Array(7).fill('')),
      currentPlayer: 'red',
      gameActive: false
    };
    socket.join(gameId);
    socket.emit('gameCreated', gameId);
  });

  socket.on('joinGame', (gameId) => {
    const game = games[gameId];
    if (game && !game.yellow) {
      game.yellow = socket.id;
      socket.join(gameId);
      io.to(gameId).emit('gameJoined', gameId);
    } else {
      socket.emit('joinError', 'Invalid game code or game is full');
    }
  });

  socket.on('startGame', (gameId) => {
    const game = games[gameId];
    if (game) {
      game.gameActive = true;
      io.to(gameId).emit('gameStarted', game);
    }
  });

  socket.on('makeMove', ({ gameId, col }) => {
    const game = games[gameId];
    if (game && game.gameActive) {
      const row = findLowestEmptyRow(game.gameState, col);
      if (row !== -1) {
        game.gameState[row][col] = game.currentPlayer;
        if (checkWin(game.gameState, row, col)) {
          game.gameActive = false;
          io.to(gameId).emit('gameOver', { winner: game.currentPlayer });
        } else if (checkDraw(game.gameState)) {
          game.gameActive = false;
          io.to(gameId).emit('gameOver', { winner: 'draw' });
        } else {
          game.currentPlayer = game.currentPlayer === 'red' ? 'yellow' : 'red';
        }
        io.to(gameId).emit('gameUpdated', game);
      }
    }
  });

  socket.on('disconnect', () => {
    console.log('A user disconnected');
  });
});

function findLowestEmptyRow(gameState, col) {
  for (let row = 5; row >= 0; row--) {
    if (gameState[row][col] === '') {
      return row;
    }
  }
  return -1;
}

function checkWin(gameState, row, col) {
  const directions = [[0, 1], [1, 0], [1, 1], [1, -1]];
  const player = gameState[row][col];

  for (const [dx, dy] of directions) {
    if (countPieces(gameState, row, col, dx, dy, player) + countPieces(gameState, row, col, -dx, -dy, player) - 1 >= 4) {
      return true;
    }
  }
  return false;
}

function countPieces(gameState, row, col, dx, dy, player) {
  let count = 0;
  while (row >= 0 && row < 6 && col >= 0 && col < 7 && gameState[row][col] === player) {
    count++;
    row += dx;
    col += dy;
  }
  return count;
}

function checkDraw(gameState) {
  return gameState.every(row => row.every(cell => cell !== ''));
}

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
