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
        startGame(true);
    };
    elements.difficulty.onchange = () => {
        haptic.selection();
        console.log("Difficulty change requested:", elements.difficulty.value);
        startGame(true);
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
                startGame();
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
