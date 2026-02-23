/* --- SHARED STATE & UTILS --- */
const el = (id) => document.getElementById(id);

// --- TWA HAPTIC FEEDBACK WRAPPER ---
const haptic = {
  impact: (style = 'light') => {
    try {
      if (window.Telegram?.WebApp?.HapticFeedback?.impactOccurred) {
        window.Telegram.WebApp.HapticFeedback.impactOccurred(style);
      }
    } catch(e) {}
  },
  notification: (type = 'success') => {
    try {
      if (window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred) {
        window.Telegram.WebApp.HapticFeedback.notificationOccurred(type);
      }
    } catch(e) {}
  },
  selection: () => {
    try {
      if (window.Telegram?.WebApp?.HapticFeedback?.selectionChanged) {
        window.Telegram.WebApp.HapticFeedback.selectionChanged();
      }
    } catch(e) {}
  }
};

let grid = [], solution = [], givenCells = new Set(), timerInterval, startTime = 0;
let activeCell = null, activeTool = null, highlightEnabled = true, undoStack = [];
let isPencilMode = false;
let hintCount = 0, isGameFinished = false, isSoundEnabled = false;
let currentUser = { id: null, username: 'Гость', avatar: null, score: 0, bestTimes: { easy: null, medium: null, hard: null } };
let currentRatingType = 'score', currentRatingDifficulty = 'easy';

const elements = {
  grid: el('grid'), numberRow: el('number-row'), difficulty: el('difficulty'),
  newGameBtn: el('newGame'), checkBtn: el('check'), undoBtn: el('undo-button'),
  pencilBtn: el('pencil-button'),
  hintBtn: el('hint-button'), timer: el('timer'), message: el('message'),
  userAvatar: el('user-avatar'), username: el('username'), userScore: el('user-score'),
  loadingScreen: el('loading-screen'), winModal: el('win-modal'),
  settingsModal: el('settings-modal'), ratingModal: el('rating-modal'),
  gridLogo: el('grid-logo'), logoWrapper: el('logo-wrapper'),
  flashOverlay: el('flash-overlay'),
  loaderBar: el('loader-bar'), percentageText: el('percentage'),
  loadingText: el('loading-text'), loadingInterface: el('loading-interface'),
  loginInterface: el('login-interface'), loginBtn: el('login-btn'),
  themeSelector: el('theme-selector'),
  appContainer: el('app-container')
};

function formatTime(s) {
  if (s == null) return '--:--';
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function getDiffName(d) {
  return { easy: 'Легко', medium: 'Средне', hard: 'Сложно' }[d] || d;
}

function toggleModal(modalId, show) {
  const m = el(modalId);
  if (show) {
    m.classList.remove('hidden');
    // Force a reflow before adding the active class so the transition actually plays
    void m.offsetWidth;
    m.classList.add('active');
  } else {
    m.classList.remove('active');
    setTimeout(() => m.classList.add('hidden'), 300);
  }
}
/* 
  FIREBASE CONFIGURATION
  IMPORTANT: This file is ignored by Git to prevent API key leaks.
  If you are deploying this, make sure to provide this file on your hosting.
*/
const firebaseConfig = {
    apiKey: "AIzaSyBkYQ7tRMrZ-mghBnkJ_EvuzHpjs_p8hOY",
    authDomain: "sudo-9fbfc.firebaseapp.com",
    projectId: "sudo-9fbfc",
    storageBucket: "sudo-9fbfc.appspot.com",
    messagingSenderId: "927814106972",
    appId: "1:927814106972:web:71e0773453f9d16f598b99"
};
/* --- FIREBASE & USER LOGIC --- */
let db, auth, usersCollection, recordsCollection;

function initFirebase() {
    try {
        if (typeof firebase === 'undefined') {
            console.error("Firebase SDK not loaded!");
            return false;
        }
        if (typeof firebaseConfig === 'undefined' || !firebaseConfig.apiKey) {
            console.warn("Firebase Config missing, using mock/guest mode.");
            return false;
        }

        // Check if already initialized to avoid errors
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
        }

        db = firebase.firestore();
        auth = firebase.auth();
        usersCollection = db.collection('users');
        recordsCollection = db.collection('timeRecords');
        return true;
    } catch (e) {
        console.error("Firebase Init Failed:", e);
        return false;
    }
}

async function initUser() {
    console.log("initUser starting...");
    // Start loading visual immediately
    // initLoadingGrid(); // Removed
    // animateLoadingGrid(); // Removed
    // setTimeout(startLoadingSequence, 300); // Removed

    // Watchdog: If stuck for more than 5s, force finish // Removed
    // const watchdog = setTimeout(() => { // Removed
    //     if (!isLoaded) { // Removed
    //         console.warn("Watchdog triggered: Initialization taking too long."); // Removed
    //         updateLoadingProgress(100, "Готово (авто)"); // Removed
    //     } // Removed
    // }, 6000); // Removed

    const isFirebaseOK = initFirebase();

    try {
        if (!isFirebaseOK) throw new Error("Firebase init returned false");

        console.log("Firebase Auth: Signing in...");
        updateLoadingProgress(30, "Синхронизация...");
        await auth.signInAnonymously();

        let uid = auth.currentUser.uid;
        let userData = { username: 'Гость', avatar: null };

        console.log("Telegram: Checking WebApp SDK...");
        updateLoadingProgress(50, "Профиль...");
        if (window.Telegram?.WebApp?.initDataUnsafe?.user) {
            const tgUser = window.Telegram.WebApp.initDataUnsafe.user;
            uid = String(tgUser.id);
            userData.username = tgUser.username || tgUser.first_name || 'Игрок';
            if (tgUser.photo_url) userData.avatar = tgUser.photo_url;
            console.log("Telegram User detected:", userData.username);
        }

        // Generate avatar based on name if none exists
        if (!userData.avatar) {
            const nameInitial = userData.username.charAt(0).toUpperCase();
            // Generate a consistent color based on the username string
            let hash = 0;
            for (let i = 0; i < userData.username.length; i++) {
                hash = userData.username.charCodeAt(i) + ((hash << 5) - hash);
            }
            const color = Math.abs(hash).toString(16).substring(0, 6).padStart(6, '0');
            userData.avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(nameInitial)}&background=${color}&color=fff&size=128&rounded=true&font-size=0.5`;
        }

        currentUser.id = uid;
        currentUser.username = userData.username;
        currentUser.avatar = userData.avatar;

        elements.username.textContent = currentUser.username;
        elements.userAvatar.src = currentUser.avatar;

        console.log("Firestore: Loading user record...");
        updateLoadingProgress(70, "Данные...");
        const doc = await usersCollection.doc(uid).get();
        if (doc.exists) {
            const data = doc.data();
            currentUser.score = data.score || 0;
            currentUser.bestTimes = data.bestTimes || { easy: null, medium: null, hard: null };
            console.log("User data loaded. Score:", currentUser.score);
        }
        // Note: New users use defaults from core.js

        updateLoadingProgress(90, "Облака...");
        try {
            elements.userScore.textContent = Math.floor(currentUser.score || 0);
            updateRecordDisplay();
        } catch (err) { console.error("UI Update Error:", err); }

        // clearTimeout(watchdog); // Removed
        console.log("initUser success.");
        updateLoadingProgress(100, "Готово!");
    } catch (e) {
        console.warn("initUser failed, continuing in Offline/Guest mode:", e.message);
        // clearTimeout(watchdog); // Removed
        // Fallback for Guest mode
        // Final fallback for UI sync
        if (window.Telegram?.WebApp?.initDataUnsafe?.user) {
            const tgUser = window.Telegram.WebApp.initDataUnsafe.user;
            currentUser.username = tgUser.username || tgUser.first_name || 'Игрок';
            if (tgUser.photo_url) {
                currentUser.avatar = tgUser.photo_url;
            }
        }
        
        if (!currentUser.avatar) {
             const nameInitial = currentUser.username.charAt(0).toUpperCase();
             let hash = 0;
             for (let i = 0; i < currentUser.username.length; i++) {
                 hash = currentUser.username.charCodeAt(i) + ((hash << 5) - hash);
             }
             const color = Math.abs(hash).toString(16).substring(0, 6).padStart(6, '0');
             currentUser.avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(nameInitial)}&background=${color}&color=fff&size=128&rounded=true&font-size=0.5`;
        }

        elements.username.textContent = currentUser.username;
        elements.userAvatar.src = currentUser.avatar;
        updateLoadingProgress(100, "Оффлайн режим");
    }
}

async function saveWin(time, pts) {
    currentUser.score += pts;
    elements.userScore.textContent = Math.floor(currentUser.score);
    const diff = elements.difficulty.value;

    let newRecord = false;
    if (!currentUser.bestTimes[diff] || time < currentUser.bestTimes[diff]) {
        currentUser.bestTimes[diff] = time;
        newRecord = true;
    }

    updateRecordDisplay();

    if (currentUser.id && usersCollection && recordsCollection) {
        usersCollection.doc(currentUser.id).set({
            score: currentUser.score,
            bestTimes: currentUser.bestTimes,
            username: currentUser.username,
            avatar: currentUser.avatar
        }, { merge: true }).catch(console.error);

        recordsCollection.add({
            userId: currentUser.id,
            username: currentUser.username,
            avatar: currentUser.avatar,
            difficulty: diff,
            time: time,
            date: new Date().toISOString()
        }).catch(console.error);
    }

    el('win-modal-message').innerHTML = `Сложность: <b style="color:white">${getDiffName(diff)}</b><br>Время: <span style="font-feature-settings: 'tnum';">${formatTime(time)}</span><br>Счет: <span style="color:var(--accent-color)">+${Math.floor(pts)}</span>${newRecord ? '<br><br>🏆 <b>Новый рекорд!</b>' : ''}`;
    toggleModal('win-modal', true);
}

function updateRecordDisplay() {
    el('easy-record').textContent = formatTime(currentUser.bestTimes.easy);
    el('medium-record').textContent = formatTime(currentUser.bestTimes.medium);
    el('hard-record').textContent = formatTime(currentUser.bestTimes.hard);
}

async function loadLeaderboard() {
    const list = el('rating-list');
    list.innerHTML = '<div style="text-align:center; padding:30px; opacity:0.6;">Загрузка...</div>';

    let query;
    if (currentRatingType === 'score') {
        query = usersCollection.orderBy('score', 'desc').limit(100);
    } else {
        query = recordsCollection.where('difficulty', '==', currentRatingDifficulty).orderBy('time', 'asc').limit(100);
    }

    try {
        const snap = await query.get();
        list.innerHTML = '';
        if (snap.empty) {
            list.innerHTML = '<div style="text-align:center; padding:30px; opacity:0.6;">Нет записей</div>';
            return;
        }

        let rankCounter = 1;
        let displayedCount = 0;
        snap.forEach((doc) => {
            if (displayedCount >= 20) return;
            const d = doc.data();
            const username = d.username || 'Неизвестно';

            // Filter out guest and unknown users
            const isGuest = !username || username.toLowerCase() === 'guest' || username.toLowerCase() === 'гость' || username.toLowerCase() === 'unknown' || username.toLowerCase() === 'неизвестно';

            if (isGuest) {
                rankCounter++; // Increment rank even for guests to keep absolute ranking
                return;
            }

            const rank = rankCounter++;
            displayedCount++;

            let rankClass = "rank-cell";
            let rankContent = rank;
            if (rank === 1) { rankClass += " rank-1"; }
            if (rank === 2) { rankClass += " rank-2"; }
            if (rank === 3) { rankClass += " rank-3"; }

            const row = document.createElement('div');
            row.className = 'rank-row';

            row.innerHTML = `
                <div class="${rankClass}">${rankContent}</div>
                <img src="${d.avatar || 'https://cdn-icons-png.flaticon.com/512/847/847969.png'}" style="width:36px; height:36px; border-radius:50%; border:1px solid rgba(255,255,255,0.2);">
                <div class="player-info">
                  <div class="player-name">${username}</div>
                </div>
                <div class="player-score">${currentRatingType === 'score' ? Math.floor(d.score) : formatTime(d.time)}</div>
            `;
            list.appendChild(row);
        });

        if (displayedCount === 0) {
            list.innerHTML = '<div style="text-align:center; padding:30px; opacity:0.6;">Только гости в топе</div>';
        }
    } catch (e) { list.textContent = "Ошибка загрузки данных"; console.error(e); }
}
/* --- CORE GAME LOGIC --- */

// --- LOADING SCREEN LOGIC ---
let loadingProgress = 0, isLoaded = false, gridAnimationInterval;

function initLoadingGrid() {
    elements.gridLogo.innerHTML = '';
    for (let i = 0; i < 9; i++) {
        const cell = document.createElement('div');
        cell.className = 'sudoku-loading-cell w-full h-full rounded-[4px]';
        elements.gridLogo.appendChild(cell);
    }
}

function animateLoadingGrid() {
    const cells = document.querySelectorAll('.sudoku-loading-cell');
    let sequenceIndex = 0;
    const path = [0, 3, 6, 1, 4, 7, 2, 5, 8];
    gridAnimationInterval = setInterval(() => {
        const cellIdx = path[sequenceIndex];
        const cell = cells[cellIdx];
        if (cell) {
            activateLoadingCell(cell, sequenceIndex + 1);
        }
        sequenceIndex = (sequenceIndex + 1) % path.length;
    }, 150);
}

function activateLoadingCell(cell, number) {
    cell.classList.add('active');
    cell.innerText = number;
    spawnParticle(cell);
    setTimeout(() => {
        cell.classList.remove('active');
        setTimeout(() => { cell.innerText = ''; }, 200);
    }, 400);
}

function spawnParticle(element) {
    const rect = element.getBoundingClientRect();
    const particle = document.createElement('div');
    const size = Math.random() * 2 + 1;
    particle.style.width = size + 'px';
    particle.style.height = size + 'px';
    particle.className = 'particle';
    const startX = rect.left + rect.width / 2;
    const startY = rect.top + rect.height / 2;
    particle.style.left = startX + 'px';
    particle.style.top = startY + 'px';
    const angle = Math.random() * Math.PI * 2;
    const distance = 40 + Math.random() * 40;
    const mx = Math.cos(angle) * distance + 'px';
    const my = Math.sin(angle) * distance + 'px';
    particle.style.setProperty('--mx', mx);
    particle.style.setProperty('--my', my);
    document.body.appendChild(particle);
    setTimeout(() => particle.remove(), 2000);
}

loadingProgress = 0;

function updateLoadingProgress(target, text, duration = 500) {
    const start = loadingProgress;
    const startTime = performance.now();

    if (text) elements.loadingText.innerText = text;

    function animate(currentTime) {
        const elapsed = currentTime - startTime;
        let progress = elapsed / duration;
        
        if (progress >= 1) progress = 1;

        // Smooth easing out
        const easeOut = 1 - Math.pow(1 - progress, 3);
        const currentVal = start + (target - start) * easeOut;

        // Ensure we strictly move forward
        if (currentVal > loadingProgress) {
            loadingProgress = currentVal;
            elements.loaderBar.style.width = `${loadingProgress}%`;
            elements.percentageText.innerText = `${Math.floor(loadingProgress)}%`;
        }

        if (progress < 1) {
            requestAnimationFrame(animate);
        } else {
            // Force 100% just in case of rounding errors
            if (target >= 100) {
                loadingProgress = 100;
                elements.loaderBar.style.width = `100%`;
                elements.percentageText.innerText = `100%`;
                if (!isLoaded) completeLoading();
            }
        }
    }
    requestAnimationFrame(animate);
}

function startLoadingSequence() {
    // This is now just an initial kick-off or placeholder
    // Real progress is driven by auth.js
    updateLoadingProgress(15, "Инициализация систем...");
}

function completeLoading() {
    if (isLoaded) return; // Prevent double execution
    isLoaded = true;
    if (gridAnimationInterval) clearInterval(gridAnimationInterval);
    elements.loadingText.innerText = "Готово!";

    const shouldAutoStart = !!(window.Telegram?.WebApp?.initData); // Check for real TG env, not just the injected mock object

    if (shouldAutoStart) {
        // Smooth fade out, then start game AFTER the screen is gone
        setTimeout(() => {
            elements.loadingScreen.style.transition = 'opacity 0.8s cubic-bezier(0.4, 0, 0.2, 1), transform 0.8s cubic-bezier(0.4, 0, 0.2, 1)';
            elements.loadingScreen.style.opacity = '0';
            elements.loadingScreen.style.transform = 'scale(1.05)';
            
            setTimeout(() => {
                elements.loadingScreen.style.display = 'none';
                startGame(true, true); // Start AFTER loading screen is hidden
            }, 800);
        }, 300); // Small delay to let the user see 100%
    } else {
        // Show login button for web version
        elements.flashOverlay.classList.add('flash-active');
        setTimeout(() => {
            elements.loadingInterface.style.transform = 'translateY(-20px)';
            elements.loadingInterface.style.opacity = '0';
            elements.loadingInterface.style.transition = 'all 0.6s cubic-bezier(0.2, 0.8, 0.2, 1)';
            setTimeout(() => {
                elements.loadingInterface.classList.add('hidden');
                elements.loginInterface.classList.remove('hidden');
                elements.loginInterface.classList.add('flex');
                elements.loginInterface.style.animation = 'none';
                elements.loginInterface.offsetHeight;
                elements.loginInterface.style.animation = 'fadeInUp 0.8s cubic-bezier(0.2, 0.8, 0.2, 1) forwards';
                elements.logoWrapper.style.transform = 'rotateY(0deg) rotateX(0deg)';
            }, 500);
        }, 300);
    }
}

// --- SOUND SYSTEM ---
const DEFAULT_SOUND_URL = 'https://github.com/codex-cdx/sudo/raw/refs/heads/main/%D0%9F%D0%BB%D0%B0%D0%BC%D0%B1.mp3';
let clickSound = new Audio(DEFAULT_SOUND_URL);
let mediaRecorder = null, audioChunks = [], isRecording = false;
let originalAudioBuffer = null;
let audioContext = new (window.AudioContext || window.webkitAudioContext)();
let previewSource = null;

function loadCustomSound() {
    const customSoundData = localStorage.getItem('sudoku_custom_sound');
    if (customSoundData) {
        clickSound.src = customSoundData;
        clickSound.load();
        el('clear-sound-btn').classList.remove('hidden');
        el('test-sound-btn').classList.remove('hidden');
        el('recording-status').textContent = '✓ Звук загружен';
    }
}

function playSound() {
    if (isSoundEnabled) {
        clickSound.currentTime = 0;
        clickSound.play().catch(() => { });
    }
}

async function startRecording() {
    if (isRecording) return;
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mimeType = MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : 'audio/webm';
        mediaRecorder = new MediaRecorder(stream, { mimeType });
        audioChunks = [];
        isRecording = true;
        el('record-sound-btn').textContent = '🔴 Запись...';
        el('record-sound-btn').style.background = 'rgba(239, 68, 68, 0.3)';
        el('recording-status').textContent = 'Запись... (макс. 2 сек)';
        mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunks.push(e.data); };
        mediaRecorder.onstop = () => {
            stream.getTracks().forEach(track => track.stop());
            isRecording = false;
            const blob = new Blob(audioChunks, { type: mimeType });
            showTrimEditor(blob);
            el('record-sound-btn').textContent = '🎤 Запись';
            el('record-sound-btn').style.background = '';
            el('recording-status').textContent = 'Запись завершена. Обрежьте её ниже:';
            if (!isSoundEnabled) { isSoundEnabled = true; el('sound-toggle').textContent = "ВКЛ"; }
        };
        mediaRecorder.start();
        setTimeout(() => { if (mediaRecorder && mediaRecorder.state === 'recording') mediaRecorder.stop(); }, 2000);
    } catch (err) {
        el('recording-status').textContent = '⚠ Доступ к микрофону запрещен';
        el('recording-status').style.color = '#fb7185';
    }
}

function clearCustomSound() {
    localStorage.removeItem('sudoku_custom_sound');
    clickSound.src = DEFAULT_SOUND_URL;
    clickSound.load();
    el('clear-sound-btn').classList.add('hidden');
    el('test-sound-btn').classList.add('hidden');
    el('trim-editor').classList.add('hidden');
    el('recording-status').textContent = 'Стандартный звук восстановлен';
}

async function showTrimEditor(blob) {
    if (previewSource) { try { previewSource.stop(); } catch (e) { } previewSource = null; }
    const arrayBuffer = await (blob.arrayBuffer ? blob.arrayBuffer() : new Response(blob).arrayBuffer());
    originalAudioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    el('trim-editor').classList.remove('hidden');
    el('trim-start').value = 0;
    el('trim-end').value = 1000;
    drawWaveform(originalAudioBuffer);
}

function updateTrimDuration() {
    if (!originalAudioBuffer) return;
    const s = parseInt(el('trim-start').value) / 1000;
    const e = parseInt(el('trim-end').value) / 1000;
    const dur = (e - s) * originalAudioBuffer.duration;
    el('trim-duration').textContent = dur.toFixed(2) + ' сек';
}

function drawWaveform(buffer) {
    if (!buffer) return;
    const canvas = el('waveform');
    const ctx = canvas.getContext('2d');
    const data = buffer.getChannelData(0);
    const step = Math.ceil(data.length / canvas.width);
    const amp = canvas.height / 2;
    const sPct = parseInt(el('trim-start').value) / 10;
    const ePct = parseInt(el('trim-end').value) / 10;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    updateTrimDuration();
    for (let i = 0; i < canvas.width; i++) {
        const curPct = (i / canvas.width) * 100;
        const isActive = curPct >= sPct && curPct <= ePct;
        ctx.fillStyle = isActive ? '#ffffff' : 'rgba(255, 255, 255, 0.2)';
        let min = 1.0, max = -1.0;
        for (let j = 0; j < step; j++) {
            const idx = (i * step) + j;
            if (idx >= data.length) break;
            const datum = data[idx];
            if (datum < min) min = datum;
            if (datum > max) max = datum;
        }
        ctx.fillRect(i, (1 + min) * amp, 1, Math.max(1, (max - min) * amp));
    }
}

async function saveTrimmedAudio() {
    if (previewSource) { try { previewSource.stop(); } catch (e) { } previewSource = null; }
    if (!originalAudioBuffer) return;
    const startPct = parseInt(el('trim-start').value) / 1000;
    const endPct = parseInt(el('trim-end').value) / 1000;
    const startOffset = Math.floor(startPct * originalAudioBuffer.length);
    const endOffset = Math.floor(endPct * originalAudioBuffer.length);
    const frameCount = Math.max(1, endOffset - startOffset);
    const trimmedBuffer = audioContext.createBuffer(originalAudioBuffer.numberOfChannels, frameCount, originalAudioBuffer.sampleRate);
    for (let i = 0; i < originalAudioBuffer.numberOfChannels; i++) {
        const data = originalAudioBuffer.getChannelData(i).slice(startOffset, endOffset);
        trimmedBuffer.copyToChannel(data, i);
    }
    const wavBlob = audioBufferToWav(trimmedBuffer);
    const reader = new FileReader();
    reader.onloadend = () => {
        const result = reader.result;
        localStorage.setItem('sudoku_custom_sound', result);
        clickSound.src = result;
        clickSound.load();
        el('trim-editor').classList.add('hidden');
        el('clear-sound-btn').classList.remove('hidden');
        el('test-sound-btn').classList.remove('hidden');
        el('recording-status').textContent = '✓ Звук сохранен!';
        el('recording-status').style.color = '#22c55e';
    };
    reader.readAsDataURL(wavBlob);
}

function audioBufferToWav(buffer) {
    const numOfChan = buffer.numberOfChannels, length = buffer.length * numOfChan * 2 + 44, bufferArr = new ArrayBuffer(length), view = new DataView(bufferArr);
    let channels = [], i, sample, offset = 0, pos = 0;
    function setUint16(data) { view.setUint16(pos, data, true); pos += 2; }
    function setUint32(data) { view.setUint32(pos, data, true); pos += 4; }
    setUint32(0x46464952); setUint32(length - 8); setUint32(0x45564157); setUint32(0x20746d66); setUint32(16); setUint16(1); setUint16(numOfChan); setUint32(buffer.sampleRate); setUint32(buffer.sampleRate * 2 * numOfChan); setUint16(numOfChan * 2); setUint16(16); setUint32(0x61746164); setUint32(length - pos - 4);
    for (i = 0; i < buffer.numberOfChannels; i++) channels.push(buffer.getChannelData(i));
    while (pos < length) {
        for (i = 0; i < numOfChan; i++) {
            sample = Math.max(-1, Math.min(1, channels[i][offset]));
            sample = (sample < 0 ? sample * 0x8000 : sample * 0x7FFF);
            view.setInt16(pos, sample, true);
            pos += 2;
        }
        offset++;
    }
    return new Blob([bufferArr], { type: 'audio/wav' });
}

/* --- SUDOKU ENGINE UTILS --- */
function isValid(b, r, c, n) {
    for (let i = 0; i < 9; i++) {
        if (b[r][i] === n || b[i][c] === n ||
            b[3 * Math.floor(r / 3) + Math.floor(i / 3)][3 * Math.floor(c / 3) + i % 3] === n) return false;
    }
    return true;
}

function solve(b) {
    for (let i = 0; i < 81; i++) {
        const r = Math.floor(i / 9), c = i % 9;
        if (b[r][c] === 0) {
            for (let n = 1; n <= 9; n++) {
                if (isValid(b, r, c, n)) {
                    b[r][c] = n;
                    if (solve(b)) return true;
                    b[r][c] = 0;
                }
            }
            return false;
        }
    }
    return true;
}

function countSolutions(b) {
    let count = 0;
    function backtrack() {
        for (let i = 0; i < 81; i++) {
            const r = Math.floor(i / 9), c = i % 9;
            if (b[r][c] === 0) {
                for (let n = 1; n <= 9; n++) {
                    if (isValid(b, r, c, n)) {
                        b[r][c] = n;
                        backtrack();
                        b[r][c] = 0;
                        if (count > 1) return;
                    }
                }
                return;
            }
        }
        count++;
    }
    backtrack();
    return count;
}

// --- GAME LOGIC ---
let notesGrid = [];

function createGrid() {
    elements.grid.innerHTML = '';
    grid = Array(9).fill().map(() => Array(9).fill(0));
    notesGrid = Array(9).fill().map(() => Array(9).fill().map(() => new Set()));
    givenCells.clear();
    for (let i = 0; i < 81; i++) {
        const d = document.createElement('div');
        d.className = 'cell';

        const notes = document.createElement('div');
        notes.className = 'notes-grid';
        for (let n = 1; n <= 9; n++) {
            const digit = document.createElement('div');
            digit.className = 'note-digit';
            digit.textContent = n;
            notes.appendChild(digit);
        }
        d.appendChild(notes);

        const span = document.createElement('span');
        span.className = 'cell-content';
        d.appendChild(span);
        d.addEventListener('click', (e) => { e.stopPropagation(); handleCellClick(Math.floor(i / 9), i % 9); });
        elements.grid.appendChild(d);
    }
}

function createKeypad() {
    elements.numberRow.innerHTML = '';
    for (let i = 1; i <= 9; i++) {
        const btn = document.createElement('button');
        btn.className = 'num-btn glass-button';
        btn.textContent = i;
        btn.dataset.val = i;
        btn.onclick = () => { playSound(); selectTool(i); };
        elements.numberRow.appendChild(btn);
    }
    const eraseBtn = document.createElement('button');
    eraseBtn.className = 'num-btn glass-button';
    eraseBtn.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 4H8l-7 8 7 8h13v-16z"/><line x1="18" y1="9" x2="12" y2="15"/><line x1="12" y1="9" x2="18" y2="15"/></svg>';
    eraseBtn.dataset.val = 'erase';
    eraseBtn.onclick = () => { playSound(); selectTool('erase'); };
    elements.numberRow.appendChild(eraseBtn);
}

function handleCellClick(r, c) {
    playSound();
    haptic.selection();
    if (isGameFinished) return;
    if (activeTool) {
        if (givenCells.has(`${r},${c}`)) {
            haptic.notification('error');
            return;
        }
        if (activeTool === 'erase') performAction(0, r, c);
        else performAction(activeTool, r, c);
    } else {
        selectCell(r, c);
    }
}

function selectCell(r, c) {
    if (isGameFinished) return;
    clearHighlights();
    activeCell = [r, c];
    const cells = document.querySelectorAll('.cell');
    cells.forEach((cell, idx) => {
        const cr = Math.floor(idx / 9), cc = idx % 9;
        const sameRow = cr === r;
        const sameCol = cc === c;
        const sameBox = Math.floor(cr / 3) === Math.floor(r / 3) && Math.floor(cc / 3) === Math.floor(c / 3);
        if (sameRow || sameCol || sameBox) cell.classList.add('area-highlight');
    });
    cells[r * 9 + c].classList.add('active-cell');
    const val = grid[r][c];
    if (val !== 0 && highlightEnabled) highlightSimilar(val);
}

function selectTool(val) {
    if (isGameFinished) return;
    haptic.impact('light');
    if (activeTool === val) activeTool = null;
    else activeTool = val;
    document.querySelectorAll('.num-btn').forEach(b => b.classList.toggle('selected', b.dataset.val == activeTool));
    activeCell = null;
    clearHighlights();
    if (activeTool && activeTool !== 'erase' && highlightEnabled) highlightSimilar(activeTool);
}

function highlightSimilar(val) {
    document.querySelectorAll('.cell').forEach((c, idx) => {
        const r = Math.floor(idx / 9), col = idx % 9;
        if (grid[r][col] === val) c.classList.add('highlight');
    });
}

function clearHighlights() {
    document.querySelectorAll('.cell').forEach(c => c.classList.remove('active-cell', 'area-highlight', 'highlight'));
}

function performAction(val, r, c) {
    if (isPencilMode && val !== 0) {
        const cell = document.querySelectorAll('.cell')[r * 9 + c];
        const notes = notesGrid[r][c];
        if (notes.has(val)) notes.delete(val);
        else notes.add(val);

        const noteDigits = cell.querySelectorAll('.note-digit');
        noteDigits.forEach((nd, idx) => {
            nd.classList.toggle('active', notes.has(idx + 1));
        });

        // Clear main value if setting notes
        if (grid[r][c] !== 0) {
            grid[r][c] = 0;
            cell.querySelector('.cell-content').textContent = '';
            cell.classList.remove('error', 'user-input');
        }
        return;
    }

    const prev = grid[r][c];
    const notes = notesGrid[r][c];
    if (prev === val && (val !== 0 || notes.size === 0)) return;
    
    // Add haptic for input
    if (val !== 0) haptic.impact('medium');
    else haptic.impact('light');

    undoStack.push({ r, c, prev, val });
    grid[r][c] = val;
    const cell = document.querySelectorAll('.cell')[r * 9 + c];
    cell.querySelector('.cell-content').textContent = val === 0 ? '' : val;
    cell.classList.remove('error', 'hinted');
    cell.classList.toggle('user-input', val !== 0);

    notesGrid[r][c].clear();
    cell.querySelectorAll('.note-digit').forEach(nd => nd.classList.remove('active'));

    // Trigger pop animation
    cell.classList.remove('cell-pop');
    void cell.offsetWidth; // Force reflow
    cell.classList.add('cell-pop');
    setTimeout(() => cell.classList.remove('cell-pop'), 300);

    updateUI();
    if (highlightEnabled) { clearHighlights(); if (val !== 0) highlightSimilar(val); }
}

function updateUI() {
    elements.undoBtn.disabled = undoStack.length === 0;
    el('hint-count-display').textContent = `${3 - hintCount}/3`;
    el('hint-button').disabled = hintCount >= 3;
    const counts = Array(10).fill(0);
    grid.flat().forEach(v => counts[v]++);
    document.querySelectorAll('.num-btn').forEach(btn => {
        const val = parseInt(btn.dataset.val);
        if (val && counts[val] >= 9) { btn.classList.add('disabled'); if (activeTool === val) selectTool(null); }
        else btn.classList.remove('disabled');
    });
    
    // Save state after every UI update
    saveGameState();
}

function undo() {
    playSound();
    haptic.impact('light');
    if (!undoStack.length) return;
    const last = undoStack.pop();
    grid[last.r][last.c] = last.prev;
    const cell = document.querySelectorAll('.cell')[last.r * 9 + last.c];
    cell.querySelector('.cell-content').textContent = last.prev || '';
    cell.classList.remove('error');
    cell.classList.toggle('user-input', last.prev !== 0);
    updateUI();
    selectCell(last.r, last.c);
}

function generatePuzzle(diff) {
    const base = Array(9).fill().map(() => Array(9).fill(0));
    const firstRow = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    for (let i = 8; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [firstRow[i], firstRow[j]] = [firstRow[j], firstRow[i]];
    }
    base[0] = firstRow;
    solve(base);
    solution = base.map(r => [...r]);
    grid = base.map(r => [...r]);

    const targetRemoved = { easy: 35, medium: 45, hard: 54 }[diff] || 35;
    let cells = Array.from({ length: 81 }, (_, i) => i);
    for (let i = 80; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [cells[i], cells[j]] = [cells[j], cells[i]];
    }

    let removed = 0;
    for (let i = 0; i < 81; i++) {
        const r = Math.floor(cells[i] / 9), c = cells[i] % 9;
        const temp = grid[r][c];
        grid[r][c] = 0;

        // Check uniqueness correctly with a copy
        const gridCopy = grid.map(row => [...row]);
        if (countSolutions(gridCopy) === 1) {
            removed++;
            if (removed >= targetRemoved) break;
        } else {
            grid[r][c] = temp;
        }
    }

    const cellElements = document.querySelectorAll('.cell');
    givenCells.clear();
    for (let i = 0; i < 81; i++) {
        const val = grid[Math.floor(i / 9)][i % 9];
        const cell = cellElements[i];
        cell.className = 'cell';
        cell.querySelector('.cell-content').textContent = val || '';
        if (val !== 0) {
            givenCells.add(`${Math.floor(i / 9)},${i % 9}`);
            cell.classList.add('given');
        }
    }
    updateUI();
}

/* --- AUTO SAVE SYSTEM --- */
const SAVE_VERSION = 2;

function saveGameState() {
    if (isGameFinished || startTime === 0) {
        return;
    }
    const state = {
        v: SAVE_VERSION,
        grid,
        solution,
        givenCells: Array.from(givenCells),
        notesGrid: notesGrid.map(row => row.map(notes => Array.from(notes))),
        undoStack,
        hintCount,
        startTime,
        elapsedSecondsBeforeLoad: Math.floor((Date.now() - startTime) / 1000),
        difficulty: elements.difficulty.value
    };
    localStorage.setItem('sudoku_saved_game', JSON.stringify(state));
}

function loadGameState() {
    try {
        const saved = localStorage.getItem('sudoku_saved_game');
        if (!saved) return false;
        
        const state = JSON.parse(saved);
        if (!state.grid || !state.solution || !state.givenCells) return false;

        // Discard saves from older versions
        if (state.v !== SAVE_VERSION) {
            console.warn(`Save version mismatch (got ${state.v}, expected ${SAVE_VERSION}), discarding.`);
            localStorage.removeItem('sudoku_saved_game');
            return false;
        }

        // Restore diff
        elements.difficulty.value = state.difficulty || 'easy';

        // Validate time
        const prevElapsed = state.elapsedSecondsBeforeLoad || 0;
        if (prevElapsed < 0 || prevElapsed > 86400 || state.startTime === 0) {
            console.warn("Corrupted save detected, clearing...");
            localStorage.removeItem('sudoku_saved_game');
            return false;
        }
        
        startTime = Date.now() - (prevElapsed * 1000);

        // Build DOM first — createGrid() resets grid/givenCells, so call BEFORE restoring state
        createGrid();
        createKeypad();

        // Restore state AFTER createGrid() so it doesn't wipe our data
        grid = state.grid;
        solution = state.solution;
        givenCells = new Set(state.givenCells);
        undoStack = state.undoStack || [];
        hintCount = state.hintCount || 0;

        // Restore notes
        if (state.notesGrid) {
            notesGrid = state.notesGrid.map(row => row.map(arr => new Set(arr)));
        } else {
            notesGrid = Array(9).fill().map(() => Array(9).fill().map(() => new Set()));
        }
        
        const cellElements = document.querySelectorAll('.cell');
        for (let r = 0; r < 9; r++) {
            for (let c = 0; c < 9; c++) {
                const val = grid[r][c];
                const cell = cellElements[r * 9 + c];
                const isGiven = givenCells.has(`${r},${c}`);
                
                cell.querySelector('.cell-content').textContent = val || '';
                
                if (isGiven) cell.classList.add('given');
                else if (val !== 0) cell.classList.add('user-input');
                
                // Restore notes UI
                const notes = notesGrid[r][c];
                cell.querySelectorAll('.note-digit').forEach((nd, idx) => {
                    nd.classList.toggle('active', notes.has(idx + 1));
                });
            }
        }
        
        updateUI();
        return true;
    } catch (e) {
        console.error("Failed to load game state", e);
        localStorage.removeItem('sudoku_saved_game');
        return false;
    }
}

function initGameAssets() {
    createGrid();
    createKeypad();
    generatePuzzle(elements.difficulty.value);
}

function startGame(needsInit = true, tryLoad = true) {
    console.log("startGame called, needsInit:", needsInit, "tryLoad:", tryLoad);
    isGameFinished = false;
    undoStack = [];
    hintCount = 0;
    clearInterval(timerInterval);

    if (needsInit) {
        if (tryLoad && loadGameState()) {
            console.log("Game state loaded successfully.");
            // If loaded, startTime is already calculated by loadGameState
        } else {
            console.log("Starting fresh game.");
            startTime = Date.now(); // SET THIS BEFORE GENERATING PUZZLE TO PREVENT 0 TIME SAVES
            initGameAssets();
        }
    } else {
        if (startTime === 0) startTime = Date.now();
    }
    
    // Initial manual save for a fresh game
    saveGameState();

    timerInterval = setInterval(() => {
        elements.timer.textContent = formatTime(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    elements.checkBtn.disabled = false;
    elements.checkBtn.textContent = 'Готово';
    elements.message.textContent = '';

    elements.appContainer.style.opacity = '1';
    elements.appContainer.style.visibility = 'visible';
    elements.appContainer.style.pointerEvents = 'auto';
    toggleModal('settings-modal', false);
}

function checkGame() {
    playSound();
    haptic.impact('medium');
    if (isGameFinished) return;
    let error = false, full = true;
    const cells = document.querySelectorAll('.cell');
    cells.forEach((c, idx) => {
        const r = Math.floor(idx / 9), col = idx % 9, val = grid[r][col];
        if (val === 0) full = false;
        else if (val !== solution[r][col]) { c.classList.add('error'); error = true; }
    });
    if (error) {
        haptic.notification('error');
        elements.message.textContent = "Упс! Найдены ошибки.";
    } else if (!full) {
        haptic.notification('warning');
        elements.message.textContent = "Поле заполнено не полностью.";
    }     else {
        haptic.notification('success');
        isGameFinished = true;
        clearInterval(timerInterval);
        localStorage.removeItem('sudoku_saved_game'); // Clear save explicitly when winning
        const time = Math.floor((Date.now() - startTime) / 1000);
        const pts = calculatePoints(time, hintCount);
        
        // Victory particles
        for (let i = 0; i < 30; i++) {
            setTimeout(() => {
                spawnParticle(elements.grid);
            }, i * 50);
        }

        saveWin(time, pts);
    }
}

function getHint() {
    playSound();
    haptic.impact('rigid');
    if (hintCount >= 3 || isGameFinished) return;
    const candidates = [];
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) if (!givenCells.has(`${r},${c}`) && grid[r][c] !== solution[r][c]) candidates.push([r, c]);
    if (!candidates.length) return;
    hintCount++;
    const [r, c] = candidates[Math.floor(Math.random() * candidates.length)];
    performAction(solution[r][c], r, c);
    const cell = document.querySelectorAll('.cell')[r * 9 + c];
    cell.classList.add('hinted');
    updateUI();
}

function calculatePoints(time, hints) {
    const base = { easy: 100, medium: 250, hard: 500 }[elements.difficulty.value];
    return Math.max(10, base - (time / 2) - (hints * 50));
}
/* --- MAIN INITIALIZATION & EVENTS --- */

document.addEventListener('DOMContentLoaded', () => {
    // UI Ready for Telegram
    if (window.Telegram?.WebApp) {
        const tg = window.Telegram.WebApp;
        tg.ready();
        tg.expand();
        // Force height for CSS
        const updateHeight = () => {
            document.documentElement.style.setProperty('--tg-viewport-height', tg.viewportHeight + 'px');
            window.dispatchEvent(new Event('resize'));
        };
        tg.onEvent('viewportChanged', updateHeight);
        updateHeight();

        // Final force expand and refresh
        setTimeout(() => {
            tg.expand();
            updateHeight();
        }, 500);

        if (typeof tg.disableVerticalSwiping === 'function') {
            tg.disableVerticalSwiping();
        }
        // Match header to theme
        if (typeof tg.setHeaderColor === 'function') {
            tg.setHeaderColor('secondary_bg_color');
        }
    }

    // Basic UI Events
    elements.newGameBtn.onclick = () => {
        haptic.impact('heavy');
        console.log("New Game requested");
        localStorage.removeItem('sudoku_saved_game'); // Clear old save
        startGame(true, false);
    };
    elements.difficulty.onchange = () => {
        haptic.selection();
        console.log("Difficulty change requested:", elements.difficulty.value);
        localStorage.removeItem('sudoku_saved_game'); // Difficulty changed, start fresh
        startGame(true, false);
    };
    elements.checkBtn.onclick = checkGame;
    elements.hintBtn.onclick = getHint;
    elements.undoBtn.onclick = undo;
    elements.pencilBtn.onclick = () => {
        haptic.impact('light');
        isPencilMode = !isPencilMode;
        elements.pencilBtn.classList.toggle('selected', isPencilMode);
        playSound();
    };
    el('settings-button').onclick = () => { haptic.impact('light'); toggleModal('settings-modal', true); };
    el('rating-button').onclick = () => { haptic.impact('light'); toggleModal('rating-modal', true); loadLeaderboard(); };
    el('win-modal-close-btn').onclick = () => { haptic.impact('light'); toggleModal('win-modal', false); };

    document.querySelectorAll('.close-btn').forEach(b => {
        b.onclick = () => toggleModal(b.dataset.target, false);
    });
    document.querySelectorAll('.modal-overlay').forEach(o => {
        o.onclick = (e) => { if (e.target === o) toggleModal(o.id, false); };
    });

    el('sound-toggle').onclick = (e) => {
        isSoundEnabled = !isSoundEnabled;
        e.target.textContent = isSoundEnabled ? "ВКЛ" : "ВЫКЛ";
    };
    el('highlightToggle').onclick = (e) => {
        highlightEnabled = !highlightEnabled;
        e.target.textContent = highlightEnabled ? "ВКЛ" : "ВЫКЛ";
        if (!highlightEnabled) clearHighlights();
    };

    // Theme System
    let savedTheme = localStorage.getItem('sudoku_theme') || 'sky';
    if (savedTheme === 'solar') savedTheme = 'sky';
    applyTheme(savedTheme);
    elements.themeSelector.value = savedTheme;

    elements.themeSelector.onchange = (e) => {
        const theme = e.target.value;
        applyTheme(theme);
        localStorage.setItem('sudoku_theme', theme);
        playSound();
    };

    function applyTheme(t) {
        document.body.classList.remove('theme-sky', 'theme-solar', 'theme-midnight', 'theme-light');
        if (t !== 'sky') document.body.classList.add(`theme-${t}`);
    }

    // Sound System Events
    el('record-sound-btn').onclick = startRecording;
    el('upload-sound-btn').onclick = () => el('audio-upload').click();
    el('audio-upload').onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
            showTrimEditor(file);
            el('recording-status').textContent = 'Файл загружен. Обрежьте его ниже:';
            if (!isSoundEnabled) {
                isSoundEnabled = true;
                el('sound-toggle').textContent = "ВКЛ";
            }
        }
    };
    el('clear-sound-btn').onclick = clearCustomSound;
    el('save-trim-btn').onclick = saveTrimmedAudio;

    const sSlider = el('trim-start');
    const eSlider = el('trim-end');
    sSlider.oninput = () => {
        if (parseInt(sSlider.value) >= parseInt(eSlider.value)) sSlider.value = eSlider.value - 1;
        drawWaveform(originalAudioBuffer);
    };
    eSlider.oninput = () => {
        if (parseInt(eSlider.value) <= parseInt(sSlider.value)) eSlider.value = parseInt(sSlider.value) + 1;
        drawWaveform(originalAudioBuffer);
    };

    el('cancel-trim-btn').onclick = () => {
        if (previewSource) { try { previewSource.stop(); } catch (e) { } previewSource = null; }
        el('trim-editor').classList.add('hidden');
        el('recording-status').textContent = 'Обрезка отменена.';
    };
    el('test-sound-btn').onclick = () => {
        clickSound.currentTime = 0;
        clickSound.play().catch(() => { });
    };

    el('preview-trim-btn').onclick = () => {
        if (!originalAudioBuffer) return;
        if (previewSource) { try { previewSource.stop(); } catch (e) { } }
        const startPct = parseInt(el('trim-start').value) / 1000;
        const endPct = parseInt(el('trim-end').value) / 1000;
        const duration = originalAudioBuffer.duration;
        previewSource = audioContext.createBufferSource();
        previewSource.buffer = originalAudioBuffer;
        previewSource.connect(audioContext.destination);
        previewSource.start(0, startPct * duration, (endPct - startPct) * duration);
        previewSource.onended = () => { previewSource = null; };
    };

    // Leaderboard Tabs
    document.querySelectorAll('.rating-tab').forEach(t => {
        t.onclick = () => {
            currentRatingType = t.dataset.type;
            document.querySelectorAll('.rating-tab').forEach(x => {
                x.classList.remove('active');
                x.style.background = 'transparent';
                x.style.color = 'var(--text-muted)';
            });
            t.classList.add('active');
            t.style.background = 'rgba(255,255,255,0.1)';
            t.style.color = 'white';
            el('difficulty-tabs').classList.toggle('hidden', currentRatingType !== 'time');
            loadLeaderboard();
        }
    });
    document.querySelectorAll('.diff-tab').forEach(t => {
        t.onclick = () => {
            currentRatingDifficulty = t.dataset.d;
            document.querySelectorAll('.diff-tab').forEach(x => {
                x.classList.remove('active');
                x.style.background = 'rgba(255,255,255,0.05)';
            });
            t.classList.add('active');
            t.style.background = 'var(--accent-color)';
            loadLeaderboard();
        }
    });

    // Default styles for active tab
    const activeTab = document.querySelector('.rating-tab.active');
    if (activeTab) {
        activeTab.style.background = 'rgba(255,255,255,0.1)';
        activeTab.style.color = 'white';
    }

    // Interactive Logo with Throttling
    let mouseX = 0, mouseY = 0, ticking = false;
    document.addEventListener('mousemove', (e) => {
        if (isLoaded) return;
        mouseX = e.clientX;
        mouseY = e.clientY;
        if (!ticking) {
            requestAnimationFrame(() => {
                const x = (window.innerWidth / 2 - mouseX) / 140;
                const y = (window.innerHeight / 2 - mouseY) / 140;
                elements.logoWrapper.style.transform = `rotateY(${x}deg) rotateX(${-y}deg)`;
                ticking = false;
            });
            ticking = true;
        }
    });

    elements.loginBtn.addEventListener('mousemove', (e) => {
        const rect = elements.loginBtn.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        elements.loginBtn.style.setProperty('--x', x + 'px');
        elements.loginBtn.style.setProperty('--y', y + 'px');
    });

    elements.loginBtn.addEventListener('click', () => {
        const btnText = el('btn-text');
        const btnIcon = el('btn-icon');
        btnText.innerText = "Authenticating...";
        btnIcon.style.display = 'none';
        const spinner = document.createElement('div');
        spinner.innerHTML = `<svg class="animate-spin h-4 w-4 text-white mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>`;
        spinner.style.display = 'inline-block';
        elements.loginBtn.insertBefore(spinner, btnText);
        setTimeout(() => {
            elements.loadingScreen.style.opacity = '0';
            elements.loadingScreen.style.transform = 'scale(1.1)';
            elements.loadingScreen.style.filter = 'blur(20px)';
            setTimeout(() => {
                elements.loadingScreen.style.display = 'none';
                startGame(true, true); // Start game AFTER loading screen is hidden
            }, 1200);
        }, 1500);
    });

    // Keyboard Support
    document.addEventListener('keydown', (e) => {
        const isModalOpen = document.querySelectorAll('.modal-overlay.active').length > 0;
        const isLoading = elements.loadingScreen.style.display !== 'none';
        if (isGameFinished || isModalOpen || isLoading) return;

        // Navigation
        if (activeCell) {
            let [r, c] = activeCell;
            if (e.key === 'ArrowUp') r = (r > 0) ? r - 1 : 8;
            else if (e.key === 'ArrowDown') r = (r < 8) ? r + 1 : 0;
            else if (e.key === 'ArrowLeft') c = (c > 0) ? c - 1 : 8;
            else if (e.key === 'ArrowRight') c = (c < 8) ? c + 1 : 0;

            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
                e.preventDefault();
                selectCell(r, c);
                return;
            }
        } else if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
            selectCell(0, 0);
            return;
        }

        // Numbers 1-9
        if (e.key >= '1' && e.key <= '9') {
            const val = parseInt(e.key);
            if (activeCell) {
                const [r, c] = activeCell;
                if (!givenCells.has(`${r},${c}`)) performAction(val, r, c);
            } else {
                selectTool(val);
                playSound();
            }
        }

        // Erase
        if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') {
            if (activeCell) {
                const [r, c] = activeCell;
                if (!givenCells.has(`${r},${c}`)) performAction(0, r, c);
            } else {
                selectTool('erase');
                playSound();
            }
        }

        // Shortcuts
        if (e.key.toLowerCase() === 'u') undo();
        if (e.key.toLowerCase() === 'h') getHint();
        if (e.key.toLowerCase() === 'c') checkGame();
        if (e.key.toLowerCase() === 'n') startGame();
        if (e.key.toLowerCase() === 'p') elements.pencilBtn.click();
    });

    // Startup Sequence - UI First
    loadCustomSound();

    // Start UI Loading animation (Parallel to Auth)
    console.log("Starting UI Loading sequence...");
    initLoadingGrid();
    animateLoadingGrid();
    startLoadingSequence();

    // Auth starts in background
    console.log("Initiating Background Auth...");
    initUser();

    // Guaranteed Finish: Force 100% after 4 seconds regardless of anything
    setTimeout(() => {
        if (!isLoaded) {
            console.log("UI Force-Completion triggered.");
            updateLoadingProgress(100, "Готово");
        }
    }, 4500);
});
