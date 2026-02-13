// Countdown Timer Window Script

let isPaused = false;
let remainingSeconds = 0;
let currentProfit = null;

// Update timer display
function updateTimerDisplay(seconds) {
  const timerEl = document.getElementById('countdownTimer');
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  timerEl.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;

  // Update timer color based on remaining time
  timerEl.className = 'countdown-dock-timer';
  if (seconds <= 60) {
    timerEl.classList.add('critical');
  } else if (seconds <= 300) {
    timerEl.classList.add('warning');
  }
}

// Update profit display
function updateProfitDisplay(profitData) {
  const profitEl = document.getElementById('countdownProfit');

  if (!profitData) {
    profitEl.textContent = '-';
    profitEl.className = 'countdown-dock-profit';
    return;
  }

  const profitText = profitData.totalDivine >= 1
    ? `+${profitData.totalDivine.toFixed(1)}d`
    : `+${Math.round(profitData.totalChaos)}c`;

  profitEl.textContent = profitText;
  profitEl.className = 'countdown-dock-profit' + (profitData.totalChaos >= 0 ? '' : ' negative');
}

// Pause/Resume button
document.getElementById('pauseRunBtn').addEventListener('click', () => {
  window.countdownAPI.togglePause();
});

// Stop button
document.getElementById('stopRunBtn').addEventListener('click', () => {
  window.countdownAPI.stopRun();
});

// Listen for updates from main process
window.countdownAPI.onTimerUpdate((data) => {
  remainingSeconds = data.remainingSeconds;
  isPaused = data.isPaused;
  currentProfit = data.profit;

  updateTimerDisplay(remainingSeconds);
  updateProfitDisplay(currentProfit);

  // Update pause button
  const pauseBtn = document.getElementById('pauseRunBtn');
  const dockContent = document.getElementById('dockContent');

  if (isPaused) {
    pauseBtn.textContent = '▶';
    pauseBtn.title = 'Resume';
    dockContent.classList.add('paused');
  } else {
    pauseBtn.textContent = '⏸';
    pauseBtn.title = 'Pause';
    dockContent.classList.remove('paused');
  }
});

// Initialize
updateTimerDisplay(0);
updateProfitDisplay(null);
