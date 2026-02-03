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
    // Start loading visual immediately
    initLoadingGrid();
    animateLoadingGrid();
    setTimeout(startLoadingSequence, 300);

    // Watchdog: If stuck for more than 5s, force finish
    const watchdog = setTimeout(() => {
        if (!isLoaded) {
            console.warn("Watchdog triggered: Initialization taking too long.");
            updateLoadingProgress(100, "Готово (авто)");
        }
    }, 6000);

    const isFirebaseOK = initFirebase();

    try {
        if (!isFirebaseOK) throw new Error("Firebase unavailable");

        updateLoadingProgress(30, "Вход в систему...");
        console.log("Signing in anonymously...");
        await auth.signInAnonymously();
        let uid = auth.currentUser.uid;
        let userData = { username: 'Гость', avatar: 'https://cdn-icons-png.flaticon.com/512/847/847969.png' };

        updateLoadingProgress(50, "Проверка Telegram...");
        console.log("Checking Telegram user...");
        if (window.Telegram?.WebApp?.initDataUnsafe?.user) {
            const tgUser = window.Telegram.WebApp.initDataUnsafe.user;
            uid = String(tgUser.id);
            userData.username = tgUser.username || tgUser.first_name;
            if (tgUser.photo_url) userData.avatar = tgUser.photo_url;
        }

        currentUser.id = uid;
        currentUser.username = userData.username;
        currentUser.avatar = userData.avatar;

        elements.username.textContent = currentUser.username;
        elements.userAvatar.src = currentUser.avatar;

        updateLoadingProgress(70, "Загрузка профиля...");
        console.log("Fetching user profile...");
        const doc = await usersCollection.doc(uid).get();
        if (doc.exists) {
            const data = doc.data();
            currentUser.score = data.score || 0;
            currentUser.bestTimes = data.bestTimes || { easy: null, medium: null, hard: null };
        }
        // Note: New users use defaults from core.js

        updateLoadingProgress(90, "Подготовка неба...");
        try {
            elements.userScore.textContent = Math.floor(currentUser.score || 0);
            updateRecordDisplay();
        } catch (err) { console.error("UI Update Error:", err); }

        clearTimeout(watchdog);
        updateLoadingProgress(100, "Готово!");
    } catch (e) {
        console.warn("Init in Guest Mode:", e.message);
        clearTimeout(watchdog);
        // Fallback for Guest mode
        if (window.Telegram?.WebApp?.initDataUnsafe?.user) {
            const tgUser = window.Telegram.WebApp.initDataUnsafe.user;
            currentUser.username = tgUser.username || tgUser.first_name;
            if (tgUser.photo_url) currentUser.avatar = tgUser.photo_url;
            elements.username.textContent = currentUser.username;
            elements.userAvatar.src = currentUser.avatar;
        }
        updateLoadingProgress(100, "Готово (Гостевой режим)");
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
