const difficultySettings = {
  beginner: { rows: 9, cols: 9, mines: 10 },
  intermediate: { rows: 16, cols: 16, mines: 40 },
  expert: { rows: 16, cols: 30, mines: 99 },
};

const boardElement = document.querySelector('#board');
const difficultyElement = document.querySelector('#difficulty');
const newGameButton = document.querySelector('#new-game');
const faceButton = document.querySelector('#face-button');
const mineCountElement = document.querySelector('#mine-count');
const timerElement = document.querySelector('#timer');
const messageElement = document.querySelector('#board-message');
const soundToggle = document.querySelector('#sound-toggle');

let settings;
let cells = [];
let gameState = 'ready';
let flags = 0;
let revealed = 0;
let seconds = 0;
let timerId = null;
let soundEnabled = true;
let audioContext;

function makeAudioContext() {
  if (!audioContext) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) audioContext = new AudioContext();
  }
  if (audioContext?.state === 'suspended') audioContext.resume();
}

function tone(frequency, duration, type = 'sine', volume = 0.035, delay = 0) {
  if (!soundEnabled || !audioContext) return;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  const start = audioContext.currentTime + delay;
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain).connect(audioContext.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

function playSound(kind) {
  makeAudioContext();
  if (!audioContext || !soundEnabled) return;
  if (kind === 'reveal') tone(440, 0.07, 'sine', 0.02);
  if (kind === 'flag') tone(330, 0.08, 'triangle', 0.025);
  if (kind === 'unflag') tone(220, 0.07, 'triangle', 0.02);
  if (kind === 'win') { tone(523, 0.12, 'sine', 0.035); tone(659, 0.14, 'sine', 0.035, 0.1); tone(784, 0.19, 'sine', 0.04, 0.22); }
  if (kind === 'lose') { tone(220, 0.18, 'sawtooth', 0.035); tone(155, 0.25, 'sawtooth', 0.03, 0.15); }
}

function formatNumber(value) { return String(value).padStart(3, '0'); }

function createBoard() {
  cells = Array.from({ length: settings.rows * settings.cols }, (_, index) => ({
    index, row: Math.floor(index / settings.cols), col: index % settings.cols,
    mine: false, revealed: false, flagged: false, adjacent: 0,
  }));
  boardElement.innerHTML = '';
  boardElement.style.gridTemplateColumns = `repeat(${settings.cols}, 1fr)`;
  boardElement.setAttribute('aria-rowcount', settings.rows);
  boardElement.setAttribute('aria-colcount', settings.cols);
  cells.forEach((cell) => {
    const button = document.createElement('button');
    button.className = 'cell hidden';
    button.type = 'button';
    button.dataset.index = cell.index;
    button.setAttribute('role', 'gridcell');
    button.setAttribute('aria-label', `Hidden square, row ${cell.row + 1}, column ${cell.col + 1}`);
    button.addEventListener('click', () => revealCell(cell.index));
    button.addEventListener('contextmenu', (event) => { event.preventDefault(); toggleFlag(cell.index); });
    boardElement.appendChild(button);
  });
}

function neighbors(cell) {
  const result = [];
  for (let row = cell.row - 1; row <= cell.row + 1; row += 1) {
    for (let col = cell.col - 1; col <= cell.col + 1; col += 1) {
      if (row === cell.row && col === cell.col) continue;
      if (row >= 0 && row < settings.rows && col >= 0 && col < settings.cols) result.push(cells[row * settings.cols + col]);
    }
  }
  return result;
}

function placeMines(firstIndex) {
  const safeZone = new Set([firstIndex, ...neighbors(cells[firstIndex]).map((cell) => cell.index)]);
  const candidates = cells.filter((cell) => !safeZone.has(cell.index));
  for (let i = candidates.length - 1; i > 0; i -= 1) {
    const swapIndex = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[swapIndex]] = [candidates[swapIndex], candidates[i]];
  }
  candidates.slice(0, settings.mines).forEach((cell) => { cell.mine = true; });
  cells.filter((cell) => !cell.mine).forEach((cell) => {
    cell.adjacent = neighbors(cell).filter((neighbor) => neighbor.mine).length;
  });
}

function renderCell(cell) {
  const element = boardElement.children[cell.index];
  const mineClass = cell.mine && cell.revealed ? ' mine' : '';
  element.className = `cell ${cell.revealed ? 'revealed' : 'hidden'}${cell.flagged ? ' flagged' : ''}${mineClass}`;
  element.dataset.number = cell.adjacent || '';
  element.textContent = cell.revealed && cell.adjacent > 0 ? cell.adjacent : '';
  if (cell.revealed) element.setAttribute('aria-label', cell.mine ? 'Mine' : `${cell.adjacent || 'Empty'} nearby mines`);
  else if (cell.flagged) element.setAttribute('aria-label', 'Flagged square');
}

function revealCell(index) {
  if (gameState === 'won' || gameState === 'lost') return;
  makeAudioContext();
  const cell = cells[index];
  if (cell.flagged || cell.revealed) return;
  if (gameState === 'ready') {
    placeMines(index);
    gameState = 'playing';
    timerId = window.setInterval(() => { seconds += 1; timerElement.textContent = formatNumber(seconds); }, 1000);
    messageElement.textContent = 'Read the numbers. Find a clear path.';
  }
  if (cell.mine) { loseGame(cell); return; }
  floodReveal(cell);
  playSound('reveal');
  checkWin();
}

function floodReveal(startCell) {
  const queue = [startCell];
  while (queue.length) {
    const cell = queue.shift();
    if (cell.revealed || cell.flagged || cell.mine) continue;
    cell.revealed = true;
    revealed += 1;
    renderCell(cell);
    if (cell.adjacent === 0) neighbors(cell).forEach((neighbor) => {
      if (!neighbor.revealed && !neighbor.flagged && !neighbor.mine) queue.push(neighbor);
    });
  }
}

function toggleFlag(index) {
  if (gameState === 'won' || gameState === 'lost') return;
  makeAudioContext();
  const cell = cells[index];
  if (cell.revealed) return;
  if (gameState === 'ready') messageElement.textContent = 'Reveal a square first to begin.';
  if (!cell.flagged && flags >= settings.mines) return;
  cell.flagged = !cell.flagged;
  flags += cell.flagged ? 1 : -1;
  mineCountElement.textContent = formatNumber(settings.mines - flags);
  renderCell(cell);
  playSound(cell.flagged ? 'flag' : 'unflag');
}

function revealAllMines(exploded) {
  cells.filter((cell) => cell.mine).forEach((cell) => {
    cell.revealed = true;
    renderCell(cell);
    if (cell.index === exploded.index) boardElement.children[cell.index].classList.add('exploded');
  });
}

function loseGame(exploded) {
  gameState = 'lost';
  window.clearInterval(timerId);
  revealAllMines(exploded);
  faceButton.textContent = '×';
  messageElement.textContent = 'A mine found you. Start again when you’re ready.';
  playSound('lose');
}

function checkWin() {
  if (revealed !== cells.length - settings.mines) return;
  gameState = 'won';
  window.clearInterval(timerId);
  cells.filter((cell) => cell.mine && !cell.flagged).forEach((cell) => { cell.flagged = true; renderCell(cell); });
  flags = settings.mines;
  mineCountElement.textContent = '000';
  faceButton.textContent = '★';
  messageElement.textContent = 'Beautiful work. The field is clear.';
  playSound('win');
}

function startGame() {
  window.clearInterval(timerId);
  settings = difficultySettings[difficultyElement.value];
  gameState = 'ready';
  flags = 0;
  revealed = 0;
  seconds = 0;
  mineCountElement.textContent = formatNumber(settings.mines);
  timerElement.textContent = '000';
  faceButton.textContent = '●';
  messageElement.textContent = 'Click any square to start';
  createBoard();
}

newGameButton.addEventListener('click', startGame);
faceButton.addEventListener('click', startGame);
difficultyElement.addEventListener('change', startGame);
soundToggle.addEventListener('click', () => {
  soundEnabled = !soundEnabled;
  soundToggle.setAttribute('aria-pressed', String(soundEnabled));
  soundToggle.setAttribute('aria-label', `Turn sound effects ${soundEnabled ? 'off' : 'on'}`);
  soundToggle.querySelector('.toggle-text').textContent = soundEnabled ? 'ON' : 'OFF';
  if (soundEnabled) playSound('reveal');
});

startGame();
