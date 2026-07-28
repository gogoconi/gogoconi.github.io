(() => {
  const canvas = document.querySelector('#game-canvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const scoreEl = document.querySelector('#score');
  const highScoreEl = document.querySelector('#high-score');
  const healthEl = document.querySelector('#health');
  const statusEl = document.querySelector('#game-status');
  const messageEl = document.querySelector('#game-message');
  const startButton = document.querySelector('#start-game');
  const pauseButton = document.querySelector('#pause-game');
  const restartButton = document.querySelector('#restart-game');
  const fireButton = document.querySelector('#fire-game');

  const CELL = 20;
  const COLS = canvas.width / CELL;
  const ROWS = canvas.height / CELL;
  const DAMAGE = { enemy: 10, projectile: 5, mine: 10, playerShot: 2 };
  const DIRECTIONS = {
    up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 },
  };
  const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };
  let snake;
  let direction;
  let queuedDirection;
  let food;
  let items;
  let enemies;
  let projectiles;
  let playerShots;
  let score;
  let health;
  let timerId = null;
  let tickCount = 0;
  let running = false;
  let paused = false;

  const readHighScore = () => {
    try { return Number(localStorage.getItem('goconi-best-score')) || 0; } catch { return 0; }
  };
  const writeHighScore = (value) => {
    try { localStorage.setItem('goconi-best-score', String(value)); } catch { /* storage is optional */ }
  };
  const same = (a, b) => a.x === b.x && a.y === b.y;
  const randomCell = () => ({ x: Math.floor(Math.random() * COLS), y: Math.floor(Math.random() * ROWS) });
  const occupied = (cell) => snake.some((part) => same(part, cell)) || enemies.some((enemy) => same(enemy, cell));
  const freeCell = () => {
    let cell = randomCell();
    let attempts = 0;
    while (occupied(cell) && attempts < 100) { cell = randomCell(); attempts += 1; }
    return cell;
  };
  const setMessage = (text, hidden = false) => {
    messageEl.textContent = text;
    messageEl.classList.toggle('is-hidden', hidden);
  };
  const updateHud = () => {
    scoreEl.textContent = String(score);
    highScoreEl.textContent = String(Math.max(readHighScore(), score));
    healthEl.textContent = String(Math.max(0, health));
  };
  const setDirection = (next) => {
    if (!running || paused || !DIRECTIONS[next] || next === OPPOSITE[direction]) return;
    queuedDirection = next;
  };
  const makeEnemy = () => ({ ...freeCell(), stepDelay: 1 + Math.floor(Math.random() * 3), stepClock: 0, shootClock: 3 + Math.floor(Math.random() * 6), flash: 0 });
  const reset = () => {
    snake = [{ x: 8, y: 8 }, { x: 7, y: 8 }, { x: 6, y: 8 }];
    direction = 'right';
    queuedDirection = 'right';
    enemies = [];
    food = freeCell();
    items = [];
    enemies = [makeEnemy(), makeEnemy()];
    projectiles = [];
    playerShots = [];
    score = 0;
    health = 100;
    tickCount = 0;
    updateHud();
    setMessage('START를 눌러 모험 시작!');
    statusEl.textContent = 'READY';
    pauseButton.disabled = true;
    draw();
  };
  const start = () => {
    if (running && !paused) return;
    if (!running) reset();
    running = true;
    paused = false;
    statusEl.textContent = 'PLAY';
    pauseButton.disabled = false;
    setMessage('', true);
    if (timerId === null) timerId = window.setInterval(tick, 120);
  };
  const pause = () => {
    if (!running) return;
    paused = !paused;
    statusEl.textContent = paused ? 'PAUSE' : 'PLAY';
    setMessage(paused ? 'PAUSED' : '', !paused);
  };
  const gameOver = (reason) => {
    running = false;
    paused = false;
    if (timerId !== null) { window.clearInterval(timerId); timerId = null; }
    if (score > readHighScore()) writeHighScore(score);
    statusEl.textContent = 'GAME OVER';
    pauseButton.disabled = true;
    setMessage(`${reason} · RESTART를 눌러 다시 시작!`);
    updateHud();
  };
  const hit = (amount, reason) => {
    health -= amount;
    if (health <= 0) gameOver(reason);
  };
  const fire = () => {
    if (!running || paused) return;
    playerShots.push({ x: snake[0].x, y: snake[0].y, direction, damage: DAMAGE.playerShot });
  };
  const maybeSpawnItem = () => {
    if (items.length < 2 && Math.random() < 0.08) items.push({ ...freeCell(), type: Math.random() < 0.6 ? 'potion' : 'mine' });
  };
  const moveEnemy = (enemy) => {
    enemy.stepClock += 1;
    enemy.shootClock -= 1;
    if (Math.random() < 0.12) enemy.stepDelay = 1 + Math.floor(Math.random() * 4);
    if (enemy.stepClock >= enemy.stepDelay) {
      enemy.stepClock = 0;
      const choices = Object.keys(DIRECTIONS).filter((key) => {
        const next = { x: enemy.x + DIRECTIONS[key].x, y: enemy.y + DIRECTIONS[key].y };
        return next.x >= 0 && next.x < COLS && next.y >= 0 && next.y < ROWS;
      });
      const chosen = choices[Math.floor(Math.random() * choices.length)];
      enemy.x += DIRECTIONS[chosen].x;
      enemy.y += DIRECTIONS[chosen].y;
    }
    if (enemy.shootClock <= 0) {
      enemy.shootClock = 5 + Math.floor(Math.random() * 8);
      const target = snake[0];
      const shotDirection = Math.abs(target.x - enemy.x) > Math.abs(target.y - enemy.y)
        ? (target.x >= enemy.x ? 'right' : 'left') : (target.y >= enemy.y ? 'down' : 'up');
      projectiles.push({ x: enemy.x, y: enemy.y, direction: shotDirection });
    }
  };
  const moveShot = (shot) => { shot.x += DIRECTIONS[shot.direction].x; shot.y += DIRECTIONS[shot.direction].y; };
  const tick = () => {
    if (!running || paused) return;
    tickCount += 1;
    direction = queuedDirection;
    const head = { x: snake[0].x + DIRECTIONS[direction].x, y: snake[0].y + DIRECTIONS[direction].y };
    if (head.x < 0 || head.x >= COLS || head.y < 0 || head.y >= ROWS || snake.some((part) => same(part, head))) return gameOver('벽 또는 꼬리 충돌');
    snake.unshift(head);
    if (same(head, food)) { score += 10; food = freeCell(); } else snake.pop();
    enemies.forEach(moveEnemy);
    playerShots.forEach(moveShot);
    projectiles.forEach(moveShot);
    playerShots = playerShots.filter((shot) => shot.x >= 0 && shot.x < COLS && shot.y >= 0 && shot.y < ROWS);
    projectiles = projectiles.filter((shot) => shot.x >= 0 && shot.x < COLS && shot.y >= 0 && shot.y < ROWS);
    enemies.forEach((enemy) => { if (same(enemy, head)) hit(DAMAGE.enemy, '적과 충돌'); });
    projectiles = projectiles.filter((shot) => { if (same(shot, head)) { hit(DAMAGE.projectile, '포탄 피격'); return false; } return true; });
    playerShots = playerShots.filter((shot) => {
      const target = enemies.find((enemy) => same(enemy, shot));
      if (!target) return true;
      target.flash = 2;
      target.hp = (target.hp || 10) - shot.damage;
      if (target.hp <= 0) { score += 25; enemies.splice(enemies.indexOf(target), 1, makeEnemy()); }
      return false;
    });
    items = items.filter((item) => {
      if (!same(item, head)) return true;
      if (item.type === 'potion') health = Math.min(100, health + 10);
      else hit(DAMAGE.mine, '지뢰를 밟았습니다');
      return false;
    });
    maybeSpawnItem();
    if (tickCount % 30 === 0 && enemies.length < 4) enemies.push(makeEnemy());
    if (score > readHighScore()) writeHighScore(score);
    updateHud();
    draw();
  };
  const block = (x, y, color, inset = 2) => { ctx.fillStyle = color; ctx.fillRect(x * CELL + inset, y * CELL + inset, CELL - inset * 2, CELL - inset * 2); };
  const draw = () => {
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#0d1630'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = 'rgba(128,214,195,.12)'; ctx.lineWidth = 1;
    for (let x = 0; x <= COLS; x += 1) { ctx.beginPath(); ctx.moveTo(x * CELL, 0); ctx.lineTo(x * CELL, canvas.height); ctx.stroke(); }
    for (let y = 0; y <= ROWS; y += 1) { ctx.beginPath(); ctx.moveTo(0, y * CELL); ctx.lineTo(canvas.width, y * CELL); ctx.stroke(); }
    block(food.x, food.y, '#ffd166', 1);
    items.forEach((item) => block(item.x, item.y, item.type === 'potion' ? '#80d6c3' : '#f45b69', 3));
    enemies.forEach((enemy) => block(enemy.x, enemy.y, '#d94b57', 2));
    projectiles.forEach((shot) => block(shot.x, shot.y, '#ff9f1c', 5));
    playerShots.forEach((shot) => block(shot.x, shot.y, '#fff', 5));
    snake.forEach((part, index) => block(part.x, part.y, index === 0 ? '#ffd166' : '#3178d6', 2));
  };
  document.addEventListener('keydown', (event) => {
    const keyMap = { ArrowUp: 'up', w: 'up', W: 'up', ArrowDown: 'down', s: 'down', S: 'down', ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right' };
    if (keyMap[event.key]) { event.preventDefault(); setDirection(keyMap[event.key]); }
    if (event.key === ' ') { event.preventDefault(); fire(); }
    if (event.key === 'p' || event.key === 'P') pause();
  });
  document.querySelectorAll('[data-direction]').forEach((button) => button.addEventListener('click', () => setDirection(button.dataset.direction)));
  startButton.addEventListener('click', start);
  pauseButton.addEventListener('click', pause);
  restartButton.addEventListener('click', () => { if (timerId !== null) { window.clearInterval(timerId); timerId = null; } running = false; reset(); start(); });
  fireButton.addEventListener('click', fire);
  reset();
})();
