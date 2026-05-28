const { ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');

// State
let mode = 'idle'; // idle, work, break, paused
let timeLeft = 25 * 60;
let accumulatedBreak = 0; // in minutes
let timerInterval = null;
let currentSessionPauseSeconds = 0;
let pauseStartTime = null;

// Config (can be adjusted to smaller values for testing)
const WORK_TIME = 25 * 60;
const BREAK_EARN = 5;

// Data Storage
const dataFile = path.join(__dirname, 'data.json');

// DOM Elements
const timeDisplay = document.getElementById('timeDisplay');
const statusDisplay = document.getElementById('statusDisplay');
const topicInput = document.getElementById('topicInput');
const startBtn = document.getElementById('startBtn');
const pauseBtn = document.getElementById('pauseBtn');
const stopBtn = document.getElementById('stopBtn');
const takeBreakBtn = document.getElementById('takeBreakBtn');
const accumulatedBreakDisplay = document.getElementById('accumulatedBreak');
const closeBtn = document.getElementById('closeBtn');
const dashboardBtn = document.getElementById('dashboardBtn');

closeBtn.addEventListener('click', () => {
    ipcRenderer.send('quit-app');
});

dashboardBtn.addEventListener('click', () => {
    ipcRenderer.send('open-dashboard');
});

function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function updateDisplay() {
    timeDisplay.textContent = formatTime(timeLeft);
    accumulatedBreakDisplay.textContent = accumulatedBreak;
    takeBreakBtn.disabled = accumulatedBreak === 0 || mode === 'break';
    
    if (mode === 'idle') {
        statusDisplay.textContent = 'Ready to Work';
        statusDisplay.style.color = 'var(--text-muted)';
        pauseBtn.style.display = 'none';
        startBtn.style.display = 'block';
    } else if (mode === 'work') {
        statusDisplay.textContent = 'Working on: ' + (topicInput.value || 'General');
        statusDisplay.style.color = 'var(--primary)';
        pauseBtn.style.display = 'block';
        pauseBtn.textContent = 'Pause';
        startBtn.style.display = 'none';
    } else if (mode === 'paused') {
        statusDisplay.textContent = 'Paused';
        statusDisplay.style.color = 'var(--warning)';
        pauseBtn.textContent = 'Resume';
        pauseBtn.style.display = 'block';
        startBtn.style.display = 'none';
    } else if (mode === 'break') {
        statusDisplay.textContent = 'On Break';
        statusDisplay.style.color = 'var(--secondary)';
        pauseBtn.style.display = 'none';
        startBtn.style.display = 'block';
    }
}

function playBeep() {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    
    // Play 3 beeps
    for (let i = 0; i < 3; i++) {
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(880, audioCtx.currentTime + i * 0.5); // A5
        
        gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime + i * 0.5);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + i * 0.5 + 0.3);
        
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        
        oscillator.start(audioCtx.currentTime + i * 0.5);
        oscillator.stop(audioCtx.currentTime + i * 0.5 + 0.3);
    }
}

function saveSession(topic, minutes, pauseMinutes) {
    let data = [];
    try {
        if (fs.existsSync(dataFile)) {
            data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
        }
    } catch (e) {
        console.error('Error reading data file', e);
    }
    
    data.push({
        topic: topic || 'General',
        minutes: minutes,
        pauseMinutes: pauseMinutes || 0,
        timestamp: new Date().toISOString()
    });
    
    try {
        fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error('Error writing data file', e);
    }
}

function tick() {
    if (timeLeft > 0) {
        timeLeft--;
        updateDisplay();
    } else {
        clearInterval(timerInterval);
        playBeep();
        
        if (mode === 'work') {
            // Finished work session
            accumulatedBreak += BREAK_EARN;
            saveSession(topicInput.value, WORK_TIME / 60, currentSessionPauseSeconds / 60);
            
            mode = 'idle';
            timeLeft = WORK_TIME;
            currentSessionPauseSeconds = 0;
            startBtn.textContent = 'Start Next Session';
            
            new Notification('Pomodoro Tracker', {
                body: `Work session completed! You earned a ${BREAK_EARN} min break.`
            });
            
        } else if (mode === 'break') {
            // Finished break session
            accumulatedBreak = 0;
            mode = 'idle';
            timeLeft = WORK_TIME;
            startBtn.textContent = 'Start Work';
            
            new Notification('Pomodoro Tracker', {
                body: `Break is over! Time to get back to work.`
            });
        }
        updateDisplay();
    }
}

startBtn.addEventListener('click', () => {
    if (mode === 'work' || mode === 'paused') return;
    
    clearInterval(timerInterval);
    mode = 'work';
    timeLeft = WORK_TIME;
    currentSessionPauseSeconds = 0;
    timerInterval = setInterval(tick, 1000);
    updateDisplay();
});

pauseBtn.addEventListener('click', () => {
    if (mode === 'work') {
        clearInterval(timerInterval);
        mode = 'paused';
        pauseStartTime = Date.now();
        updateDisplay();
    } else if (mode === 'paused') {
        currentSessionPauseSeconds += (Date.now() - pauseStartTime) / 1000;
        mode = 'work';
        timerInterval = setInterval(tick, 1000);
        updateDisplay();
    }
});

stopBtn.addEventListener('click', () => {
    clearInterval(timerInterval);
    if (mode === 'paused') {
        currentSessionPauseSeconds += (Date.now() - pauseStartTime) / 1000;
    }
    
    // Save partial progress if stopping a work session early
    if (mode === 'work' || mode === 'paused') {
        const workedSeconds = WORK_TIME - timeLeft;
        if (workedSeconds > 0) {
            saveSession(topicInput.value, workedSeconds / 60, currentSessionPauseSeconds / 60);
        }
    }
    
    mode = 'idle';
    timeLeft = WORK_TIME;
    currentSessionPauseSeconds = 0;
    startBtn.textContent = 'Start';
    updateDisplay();
});

takeBreakBtn.addEventListener('click', () => {
    if (accumulatedBreak > 0) {
        clearInterval(timerInterval);
        mode = 'break';
        timeLeft = accumulatedBreak * 60;
        startBtn.textContent = 'Start Work';
        timerInterval = setInterval(tick, 1000);
        updateDisplay();
    }
});

updateDisplay();
