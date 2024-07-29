const baseURL = 'http://127.0.0.1:5000'; // Change this to your server's base URL

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const padding = 20; // Padding around the rendering area
const dpr = window.devicePixelRatio || 1;

let nodes = [];
let adjacencyList = {};
let playerTurn = false; // true for player's turn, false for opponent's turn
let gameState;
let partyCode;
let playerId;

// Class to manage the game state
class GameState {
    constructor(nodes) {
        this.nodeStates = {};
        nodes.forEach(node => {
            this.nodeStates[node.id] = 'black'; // Default state
        });
    }

    // Set the state of a node
    setNodeState(nodeId, state) {
        if (this.nodeStates[nodeId]) {
            this.nodeStates[nodeId] = state;
        }
    }

    // Get the state of a node
    getNodeState(nodeId) {
        return this.nodeStates[nodeId];
    }

    // Get all node states
    getAllNodeStates() {
        return this.nodeStates;
    }
}

// Function to resize the canvas to fit the window and adjust for DPR
function resizeCanvas() {
    const size = Math.min(window.innerWidth, window.innerHeight);
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);
}

// Function to fetch file content
async function fetchFile(filePath) {
    const response = await fetch(filePath);
    if (!response.ok) {
        throw new Error(`Failed to load ${filePath}`);
    }
    return response.text();
}

// Function to parse coordinates file
function parseCoordsFile(content) {
    nodes = content.trim().split('\n').map((line, index) => {
        const [x, y] = line.trim().split(/\s+/).map(Number);
        return { id: index + 1, x, y: 1 - y }; // flipping y
    });
}

// Function to parse adjacency list file
function parseAdjListFile(content) {
    adjacencyList = {};
    const lines = content.trim().split('\n');
    lines.forEach((line, index) => {
        adjacencyList[index + 1] = line.split(/\s+/).map(Number).filter(n => n !== 0);
    });
}

// Function to draw the nodes
function drawNodes() {
    nodes.forEach(node => {
        const scaledX = padding + node.x * (canvas.width / dpr - 2 * padding);
        const scaledY = padding + node.y * (canvas.height / dpr - 2 * padding);

        ctx.beginPath();
        ctx.arc(scaledX, scaledY, 10, 0, 2 * Math.PI);
        ctx.fillStyle = gameState.getNodeState(node.id);
        ctx.fill();
        ctx.stroke();
        ctx.closePath();

        // Draw node id
        ctx.fillStyle = 'white';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(node.id, scaledX, scaledY);
    });
}

// Function to draw the edges
function drawEdges() {
    nodes.forEach(node => {
        const neighbors = adjacencyList[node.id];
        if (neighbors) {
            neighbors.forEach(neighborId => {
                const neighbor = nodes.find(n => n.id === neighborId);
                if (neighbor) {
                    const scaledX1 = padding + node.x * (canvas.width / dpr - 2 * padding);
                    const scaledY1 = padding + node.y * (canvas.height / dpr - 2 * padding);
                    const scaledX2 = padding + neighbor.x * (canvas.width / dpr - 2 * padding);
                    const scaledY2 = padding + neighbor.y * (canvas.height / dpr - 2 * padding);

                    ctx.beginPath();
                    ctx.moveTo(scaledX1, scaledY1);
                    ctx.lineTo(scaledX2, scaledY2);
                    ctx.stroke();
                    ctx.closePath();
                }
            });
        }
    });
}

// Draw the board
function drawBoard() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawEdges();
    drawNodes();
}

// Make a move
async function makeMove() {
    if (!playerTurn) return;

    const nodeId = parseInt(document.getElementById('nodeInput').value);
    if (isNaN(nodeId) || !gameState.getNodeState(nodeId)) {
        alert('Invalid node ID');
        return;
    }

    gameState.setNodeState(nodeId, 'blue'); // Player's move is blue
    drawBoard();

    if (checkWinCondition('blue', nodeId)) {
        await sendMoveToServer(nodeId, 'blue');
        alert('You win!');
        location.reload();
        return;
    }

    playerTurn = false;
    document.getElementById('moveButton').disabled = true;

    // Send move to server and wait for opponent's move
    await sendMoveToServer(nodeId, 'blue');
    setTimeout(fetchOpponentMove, 1000);
}

// Function to send move to server
async function sendMoveToServer(nodeId, color) {
    try {
        const response = await fetch(`${baseURL}/api/pushMove`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ partyCode, nodeId, color }),
        });
        if (!response.ok) {
            throw new Error('Failed to push move');
        }
    } catch (error) {
        alert('An error occurred on the server');
        window.location.href = '/';
    }
}

// Function to fetch opponent's move from server
async function fetchOpponentMove() {
    try {
        const response = await fetch(`${baseURL}/api/getMove?partyCode=${partyCode}`);
        if (!response.ok) {
            throw new Error('Failed to fetch opponent move');
        }
        const data = await response.json();
        const opponentMove = data.nodeId;

        if (opponentMove === 0 || gameState.getNodeState(opponentMove) !== 'black') {
            setTimeout(fetchOpponentMove, 1000); // Try again after some time
            return;
        }

        gameState.setNodeState(opponentMove, 'red'); // Opponent's move is red
        drawBoard();

        if (checkWinCondition('red', opponentMove)) {
            alert('You lose!');
            location.reload();
            return;
        }

        playerTurn = true;
        document.getElementById('moveButton').disabled = false;
    } catch (error) {
        alert('An error occurred on the server');
        window.location.href = '/';
    }
}

// Check win condition
function checkWinCondition(color, nodeId) {
    const side1 = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const side2 = new Set([9, 10, 11, 12, 13, 14, 15, 16, 17]);
    const side3 = new Set([17, 18, 19, 20, 21, 22, 23, 24, 1]);

    const visited = new Set();
    const queue = [nodeId];

    let touchesSide1 = false;
    let touchesSide2 = false;
    let touchesSide3 = false;

    while (queue.length > 0) {
        const currentNodeId = queue.shift();
        if (visited.has(currentNodeId)) continue;
        visited.add(currentNodeId);

        if (side1.has(currentNodeId)) touchesSide1 = true;
        if (side2.has(currentNodeId)) touchesSide2 = true;
        if (side3.has(currentNodeId)) touchesSide3 = true;

        if (touchesSide1 && touchesSide2 && touchesSide3) {
            return true;
        }

        adjacencyList[currentNodeId].forEach(neighborId => {
            if (gameState.getNodeState(neighborId) === color && !visited.has(neighborId)) {
                queue.push(neighborId);
            }
        });
    }

    return false;
}

// Load files and draw the board
async function loadAndDraw() {
    try {
        const coordsContent = await fetchFile('coordinates.txt');
        parseCoordsFile(coordsContent);

        const adjListContent = await fetchFile('adjacency.txt');
        parseAdjListFile(adjListContent);

        gameState = new GameState(nodes); // Initialize game state
        drawBoard();

        // Get initial turn info from server
        await fetchInitialTurn();
    } catch (error) {
        console.error(error);
    }
}

// Function to fetch initial turn from server
async function fetchInitialTurn() {
    try {
        const response = await fetch(`${baseURL}/api/getPlayerID?partyCode=${partyCode}`);
        if (!response.ok) {
            throw new Error('Failed to get player ID');
        }
        const data = await response.json();
        playerId = data.playerId;

        if (playerId === 0) {
            alert('Invalid party code');
            window.location.href = '/';
        } else if (playerId === 1) {
            alert('Share this link with your friend to join the game');
            playerTurn = true;
            document.getElementById('moveButton').disabled = false;
        } else if (playerId === 2) {
            playerTurn = false;
            document.getElementById('moveButton').disabled = true;
            setTimeout(fetchOpponentMove, 1000);
        }
    } catch (error) {
        alert('An error occurred on the server');
        window.location.href = '/';
    }
}

// Function to get party code from URL
function getPartyCodeFromURL() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('code');
}

// Automatically resize canvas and load/draw the board on page load
window.onload = () => {
    resizeCanvas();
    partyCode = getPartyCodeFromURL();
    loadAndDraw();
};

// Resize canvas when the window is resized
window.onresize = () => {
    resizeCanvas();
    drawBoard();
};
