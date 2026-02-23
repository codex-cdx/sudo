/* --- SHARED STATE & UTILS --- */
const el = (id) => document.getElementById(id);

// --- TWA HAPTIC FEEDBACK WRAPPER ---
const haptic = {
  impact: (style = 'light') => {
    if (window.Telegram?.WebApp?.HapticFeedback) {
      window.Telegram.WebApp.HapticFeedback.impactOccurred(style);
    }
  },
  notification: (type = 'success') => {
    if (window.Telegram?.WebApp?.HapticFeedback) {
      window.Telegram.WebApp.HapticFeedback.notificationOccurred(type);
    }
  },
  selection: () => {
    if (window.Telegram?.WebApp?.HapticFeedback) {
      window.Telegram.WebApp.HapticFeedback.selectionChanged();
    }
  }
};

let grid = [], solution = [], givenCells = new Set(), timerInterval, startTime = 0;
let activeCell = null, activeTool = null, highlightEnabled = true, undoStack = [];
let isPencilMode = false;
let hintCount = 0, isGameFinished = false, isSoundEnabled = false;
let currentUser = { id: null, username: 'Гость', avatar: 'https://t.me/i/userpic/320/default.jpg', score: 0, bestTimes: { easy: null, medium: null, hard: null } };
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
    requestAnimationFrame(() => m.classList.add('active'));
  } else {
    m.classList.remove('active');
    setTimeout(() => m.classList.add('hidden'), 300);
  }
}
