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
        const progress = Math.min(elapsed / duration, 1);
        const currentVal = start + (target - start) * progress;

        // Only update global if it's an increase (poor man's concurrency control)
        if (currentVal > loadingProgress) {
            loadingProgress = currentVal;
            elements.loaderBar.style.width = `${loadingProgress}%`;
            elements.percentageText.innerText = `${Math.floor(loadingProgress)}%`;
        }

        if (progress < 1) {
            requestAnimationFrame(animate);
        } else if (target >= 100 && !isLoaded) {
            // Force 100% and finish if this specific anim was targeting 100
            loadingProgress = 100;
            elements.loaderBar.style.width = `100%`;
            elements.percentageText.innerText = `100%`;
            completeLoading();
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
    isLoaded = true;
    if (gridAnimationInterval) clearInterval(gridAnimationInterval);
    elements.flashOverlay.classList.add('flash-active');
    elements.loadingText.innerText = "Ready.";

    // Auto-skip login screen for Telegram or fast-play
    const shouldAutoStart = !!(window.Telegram?.WebApp);

    setTimeout(() => {
        if (shouldAutoStart) {
            elements.loadingScreen.style.opacity = '0';
            elements.loadingScreen.style.transition = 'all 0.8s ease';
            // Pre-render the game in the background before fading out the loader
            initGameAssets();

            setTimeout(() => {
                elements.loadingScreen.style.display = 'none';
                startGame(false);
            }, 800);
        } else {
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
        }
    }, 300);
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

function initGameAssets() {
    createGrid();
    createKeypad();
    generatePuzzle(elements.difficulty.value);
}

function startGame(needsInit = true) {
    console.log("startGame called, needsInit:", needsInit);
    isGameFinished = false;
    undoStack = [];
    hintCount = 0;
    clearInterval(timerInterval);

    if (needsInit) {
        initGameAssets();
    }

    startTime = Date.now();
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
