const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

app.use(express.static('public'));

const tables = Array(5).fill().map(() => ({ players: [], gameState: null }));

io.on('connection', (socket) => {
    let playerName = '';

    socket.on('setName', (name) => {
        playerName = name;
    });

    socket.on('getTables', () => {
        socket.emit('tablesUpdate', tables.map(table => ({ players: table.players.length })));
    });

    socket.on('joinTable', (tableIndex) => {
        if (tables[tableIndex].players.length < 2) {
            tables[tableIndex].players.push({ id: socket.id, name: playerName });
            socket.join(`table-${tableIndex}`);

            if (tables[tableIndex].players.length === 2) {
                const [player1, player2] = tables[tableIndex].players;
                io.to(player1.id).emit('joinedTable', { tableId: tableIndex, playerId: 'red', opponentName: player2.name });
                io.to(player2.id).emit('joinedTable', { tableId: tableIndex, playerId: 'yellow', opponentName: player1.name });
                
                tables[tableIndex].gameState = {
                    board: Array(6).fill().map(() => Array(7).fill('')),
                    currentPlayer: 'red'
                };
                io.to(`table-${tableIndex}`).emit('gameStarted', tables[tableIndex].gameState);
            } else {
                socket.emit('joinedTable', { tableId: tableIndex, playerId: 'red', opponentName: '' });
            }

            io.emit('tablesUpdate', tables.map(table => ({ players: table.players.length })));
        }
    });

    socket.on('makeMove', ({ tableId, col }) => {
        const table = tables[tableId];
        if (table && table.gameState) {
            const row = findLowestEmptyRow(table.gameState.board, col);
            if (row !== -1) {
                table.gameState.board[row][col] = table.gameState.currentPlayer;
                if (checkWin(table.gameState.board, row, col)) {
                    io.to(`table-${tableId}`).emit('gameOver', { winner: table.gameState.currentPlayer });
                    table.gameState = null;
                } else if (checkDraw(table.gameState.board)) {
                    io.to(`table-${tableId}`).emit('gameOver', { winner: 'draw' });
                    table.gameState = null;
                } else {
                    table.gameState.currentPlayer = table.gameState.currentPlayer === 'red' ? 'yellow' : 'red';
                    io.to(`table-${tableId}`).emit('gameUpdated', table.gameState);
                }
            }
        }
    });

    socket.on('leaveTable', (tableId) => {
        const table = tables[tableId];
        if (table) {
            table.players = table.players.filter(player => player.id !== socket.id);
            table.gameState = null;
            socket.leave(`table-${tableId}`);
            io.to(`table-${tableId}`).emit('opponentLeft');
            io.emit('tablesUpdate', tables.map(table => ({ players: table.players.length })));
        }
    });

    socket.on('disconnect', () => {
        for (let i = 0; i < tables.length; i++) {
            const table = tables[i];
            const playerIndex = table.players.findIndex(player => player.id === socket.id);
            if (playerIndex !== -1) {
                table.players.splice(playerIndex, 1);
                table.gameState = null;
                io.to(`table-${i}`).emit('opponentLeft');
                io.emit('tablesUpdate', tables.map(table => ({ players: table.players.length })));
                break;
            }
        }
    });
});

function findLowestEmptyRow(board, col) {
    for (let row = 5; row >= 0; row--) {
        if (board[row][col] === '') {
            return row;
        }
    }
    return -1;
}

function checkWin(board, row, col) {
    const directions = [[0, 1], [1, 0], [1, 1], [1, -1]];
    const player = board[row][col];

    for (const [dx, dy] of directions) {
        if (countPieces(board, row, col, dx, dy, player) + countPieces(board, row, col, -dx, -dy, player) - 1 >= 4) {
            return true;
        }
    }
    return false;
}

function countPieces(board, row, col, dx, dy, player) {
    let count = 0;
    while (row >= 0 && row < 6 && col >= 0 && col < 7 && board[row][col] === player) {
        count++;
        row += dx;
        col += dy;
    }
    return count;
}

function checkDraw(board) {
    return board.every(row => row.every(cell => cell !== ''));
}

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
