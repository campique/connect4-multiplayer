const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

app.use(express.static('public'));

const tables = Array(5).fill().map(() => ({ players: [], gameState: null, rematchVotes: [] }));

io.on('connection', (socket) => {
    let playerName = '';

    socket.on('setName', (name) => {
        playerName = name;
        console.log(`Player ${name} connected`);
        socket.emit('tablesUpdate', tables.map(table => ({ players: table.players.length })));
    });

    socket.on('getTables', () => {
        console.log('getTables called, sending:', tables.map(table => ({ players: table.players.length })));
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
                
                startNewGame(tableIndex);
            } else {
                socket.emit('joinedTable', { tableId: tableIndex, playerId: 'red', opponentName: '' });
            }

            io.emit('tablesUpdate', tables.map(table => ({ players: table.players.length })));
        }
    });

    socket.on('makeMove', ({ tableId, col }) => {
        console.log(`Move attempt: Table ${tableId}, Column ${col}, Player ${playerName}`);
        const table = tables[tableId];
        if (table && table.gameState) {
            const playerIndex = table.players.findIndex(player => player.id === socket.id);
            const playerColor = playerIndex === 0 ? 'red' : 'yellow';
            
            if (playerColor !== table.gameState.currentPlayer) {
                console.log(`Invalid move: not ${playerName}'s turn`);
                return;
            }

            const row = findLowestEmptyRow(table.gameState.board, col);
            if (row !== -1) {
                table.gameState.board[row][col] = playerColor;
                console.log(`Move made: Row ${row}, Column ${col}, Player ${playerName}`);

                io.to(`table-${tableId}`).emit('gameUpdated', table.gameState);

                if (checkWin(table.gameState.board, row, col)) {
                    io.to(`table-${tableId}`).emit('gameOver', { winner: playerColor });
                    console.log(`Game over: ${playerName} wins`);
                    askForRematch(tableId);
                } else if (checkDraw(table.gameState.board)) {
                    io.to(`table-${tableId}`).emit('gameOver', { winner: 'draw' });
                    console.log(`Game over: Draw`);
                    askForRematch(tableId);
                } else {
                    table.gameState.currentPlayer = table.gameState.currentPlayer === 'red' ? 'yellow' : 'red';
                    console.log(`Turn changed to ${table.gameState.currentPlayer}`);
                }
            } else {
                console.log(`Invalid move: Column ${col} is full`);
            }
        } else {
            console.log(`Invalid move: No active game on table ${tableId}`);
        }
    });

    socket.on('rematchVote', ({ tableId, vote }) => {
        const table = tables[tableId];
        if (table) {
            const playerIndex = table.players.findIndex(player => player.id === socket.id);
            table.rematchVotes[playerIndex] = vote;

            if (table.rematchVotes.length === 2) {
                if (table.rematchVotes.every(v => v === true)) {
                    startNewGame(tableId);
                } else {
                    io.to(`table-${tableId}`).emit('returnToLobby');
                    resetTable(tableId);
                }
            }
        }
    });

    socket.on('leaveTable', (tableId) => {
        const table = tables[tableId];
        if (table) {
            table.players = table.players.filter(player => player.id !== socket.id);
            socket.leave(`table-${tableId}`);
            io.to(`table-${tableId}`).emit('opponentLeft');
            resetTable(tableId);
            io.emit('tablesUpdate', tables.map(table => ({ players: table.players.length })));
            console.log(`Player ${playerName} left table ${tableId}`);
        }
    });

    socket.on('disconnect', () => {
        console.log(`Player ${playerName} disconnected`);
        for (let i = 0; i < tables.length; i++) {
            const table = tables[i];
            const playerIndex = table.players.findIndex(player => player.id === socket.id);
            if (playerIndex !== -1) {
                table.players.splice(playerIndex, 1);
                io.to(`table-${i}`).emit('opponentLeft');
                resetTable(i);
                io.emit('tablesUpdate', tables.map(table => ({ players: table.players.length })));
                break;
            }
        }
    });
});

function startNewGame(tableId) {
    tables[tableId].gameState = {
        board: Array(6).fill().map(() => Array(7).fill('')),
        currentPlayer: 'red'
    };
    tables[tableId].rematchVotes = [];
    io.to(`table-${tableId}`).emit('gameStarted', tables[tableId].gameState);
    console.log(`New game started on table ${tableId}`);
}

function resetTable(tableId) {
    tables[tableId].gameState = null;
    tables[tableId].rematchVotes = [];
}

function askForRematch(tableId) {
    io.to(`table-${tableId}`).emit('askRematch');
}

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
