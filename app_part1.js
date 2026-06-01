// ==========================================
// 1. DATA INITIALIZATION & CONSTANT STORE
// ==========================================
// Global unhandled rejection handler
window.addEventListener('unhandledrejection', event => {
    console.warn('Unhandled promise rejection:', event.reason?.message || event.reason);
    event.preventDefault();
});

// Cross-browser compatible localStorage access
function getLocalStorage() {
    try {
        return window.localStorage;
    } catch (e) {
        console.warn('localStorage not available:', e);
        return null;
    }
}

function safeLocalStorageGet(key, defaultValue = null) {
    try {
        const storage = getLocalStorage();
        if (!storage) return defaultValue;
        const item = storage.getItem(key);
        return item ? JSON.parse(item) : defaultValue;
    } catch (e) {
        console.warn(`Failed to parse localStorage item ${key}:`, e);
        return defaultValue;
    }
}

function safeLocalStorageSet(key, value) {
    try {
        const storage = getLocalStorage();
        if (!storage) return false;
        storage.setItem(key, JSON.stringify(value));
        return true;
    } catch (e) {
        console.warn(`Failed to set localStorage item ${key}:`, e);
        return false;
    }
}

let db = safeLocalStorageGet('appHubInvestDb', {});

if (!db.userProfile) db.userProfile = { salary: 0, regime: 'new', monthlyExpense: 0, dob: '' };
if (typeof db.monthlyInvestmentTarget === 'undefined') db.monthlyInvestmentTarget = 0;
if (!db.userProfile.dob) db.userProfile.dob = '';
if (!db.userProfile.monthlyExpense) db.userProfile.monthlyExpense = 0;
if (!db.settingsTable) db.settingsTable = { lastResetMonth: '' };
if (!db.investments) db.investments = [];
if (!db.goals) db.goals = [];
if (!db.recurring) db.recurring = [];
if (!db.milestones) db.milestones = [];
// Migrate old milestone format (array of numbers) to objects with dates
if (db.milestones.length > 0 && typeof db.milestones[0] === 'number') {
    db.milestones = db.milestones.map(v => ({ val: v, date: null }));
}
function isMilestoneUnlocked(val) {
    return db.milestones.some(m => (typeof m === 'object' ? m.val : m) === val);
}
if (!db.projectionNextMonth) db.projectionNextMonth = 0;
if (!db.categoryDetails) db.categoryDetails = {};
if (!db.currentMarketValues) db.currentMarketValues = {};
if (!db.allocTargets) db.allocTargets = {};
if (!db.accounts) db.accounts = ['Main Portfolio'];
if (!db.activeAccountFilter) db.activeAccountFilter = 'All';
if (!db.fireTargetMonthly) db.fireTargetMonthly = 0;
if (!db.templates) db.templates = [];
if (typeof db.privacyMode === 'undefined') db.privacyMode = false;
if (!db.theme) db.theme = 'indigo';
// Migrate any existing accountOverview data to separate private key (never shared with AI)
if (db.accountOverview) {
    try {
        const existing = JSON.parse(localStorage.getItem('appHubInvestDb_ao')) || {};
        if (!existing.cards && db.accountOverview.cards) existing.cards = db.accountOverview.cards;
        if (!existing.banks && db.accountOverview.banks) existing.banks = db.accountOverview.banks;
        if (!existing.pf && db.accountOverview.pf) existing.pf = db.accountOverview.pf;
        localStorage.setItem('appHubInvestDb_ao', JSON.stringify(existing));
    } catch(e) {}
    delete db.accountOverview;
}
if (!db.geminiKey) db.geminiKey = '';
if (!db.groqKey) db.groqKey = '';
if (!db.openrouterKey) db.openrouterKey = '';
if (!db.cerebrasKey) db.cerebrasKey = '';
if (!db.githubKey) db.githubKey = '';

if (db.geminiKey) db.geminiKey = _decodeKey(db.geminiKey);
if (db.groqKey) db.groqKey = _decodeKey(db.groqKey);
if (db.openrouterKey) db.openrouterKey = _decodeKey(db.openrouterKey);
if (db.cerebrasKey) db.cerebrasKey = _decodeKey(db.cerebrasKey);
if (db.githubKey) db.githubKey = _decodeKey(db.githubKey);

// Decrypt encrypted API keys if present
if (db._ek && db.appPin) {
    const parts = db._ek.split('|');
    const keyNames = ['geminiKey', 'groqKey', 'openrouterKey', 'cerebrasKey', 'githubKey'];
    keyNames.forEach((key, i) => { if (!db[key]) db[key] = _decryptKey(parts[i] || '', db.appPin) || ''; });
    delete db._ek;
}
if (!db.appPin) db.appPin = '';
if (!db.chatHistory) db.chatHistory = [];
if (!db.chatSessions) db.chatSessions = [];
if (!db.lastBackupPrompt) db.lastBackupPrompt = '';
if (!db.navCache) db.navCache = {};
if (typeof db.fyStartMonth === 'undefined') db.fyStartMonth = 3; // Default: April (month index 3) for India FY
if (typeof db.firstTimeTipsShown === 'undefined') db.firstTimeTipsShown = false;


// NEW: Default state for Monthly Planner visibility
if (typeof db.enableMonthlyPlanner === 'undefined') db.enableMonthlyPlanner = true;

// NEW: Spend Tracker
if (typeof db.enableSpendTracker === 'undefined') db.enableSpendTracker = false;
if (typeof db.aiEnabled === 'undefined') db.aiEnabled = true;
if (typeof db.webEnabled === 'undefined') db.webEnabled = true;

// Global feature toggles — check these before AI/web calls
window.__aiEnabled = db.aiEnabled;
window.__webEnabled = db.webEnabled;

// Update body classes when toggles change
function updateFeatureVisibility() {
  document.body.classList.toggle('ai-disabled', !window.__aiEnabled);
  document.body.classList.toggle('web-disabled', !window.__webEnabled);
}
updateFeatureVisibility();

// Monkey-patch fetch for web connectivity toggle
const _origFetch = window.fetch;
window.fetch = function(input, init) {
  const url = typeof input === 'string' ? input : (input instanceof Request ? input.url : '');
  try {
    const u = new URL(url, self.location.origin);
    if (!window.__webEnabled && u.origin !== self.location.origin && !url.startsWith('data:') && !url.startsWith('blob:') && u.protocol !== 'chrome-extension:') {
      return Promise.reject(new Error('Web connectivity disabled in Settings'));
    }
  } catch (_) {}
  return _origFetch.call(this, input, init);
};

if (!db.spendTracker) db.spendTracker = { entries: [], aiCategoryCache: {} };

// Extended user profile with smart defaults (all optional, progressive disclosure)
if (!db.userProfileExtended) db.userProfileExtended = {
    // Layer 1: Basics (auto-detected or simple)
    ageGroup: null, // '20s', '30s', '40s', '50s', '60+'
    employmentType: null, // 'salaried', 'business', 'freelance', 'retired'
    location: null, // 'india', 'nri', 'other'

    // Layer 2: Financial Context (asked contextually)
    riskTolerance: null, // 'conservative', 'moderate', 'aggressive'
    investmentHorizon: null, // 'short', 'medium', 'long'
    emergencyFundMonths: null, // number of months expenses saved

    // Layer 3: Advanced (optional health check)
    hasHealthInsurance: null,
    hasLifeInsurance: null,
    hasHomeLoan: null,
    hasCarLoan: null,
    creditScoreRange: null, // 'poor', 'fair', 'good', 'excellent'

    // Smart tracking (auto-calculated from data)
    profileCompleteness: 0, // 0-100%
    lastProfilePrompt: null, // timestamp to avoid nagging
};

// Expense categories (simplified - just 4 essential ones)
if (!db.expenseCategories) db.expenseCategories = {
    fixed: 0, // rent, emi, utilities
    essentials: 0, // groceries, transport, healthcare
    lifestyle: 0, // dining, entertainment, shopping
    savings: 0 // already tracked from investments
};

// Smart suggestions system (what to ask next)
if (!db.smartSuggestions) db.smartSuggestions = [];

// User preferences for notifications
if (!db.userPreferences) db.userPreferences = {
    sipReminders: true,
    maturityAlerts: true,
    goalProgressUpdates: true,
    weeklyDigest: false,
    priceAlerts: false,
    dailySpendSummary: false,
    spendConfirmations: true
};

const defaultCategories = ['FD', 'PPF', 'PF', 'SIP', 'Liquid', 'Home', 'Cash', 'Stocks'];

if (!db.categories || Object.keys(db.categories).length === 0) {
    db.categories = {
        'FD': { icon: 'account_balance', color: '#006874', is80c: false },
        'PPF': { icon: 'savings', color: '#B3261E', is80c: true },
        'PF': { icon: 'account_balance_wallet', color: '#D96200', is80c: true },
        'SIP': { icon: 'trending_up', color: '#6750A4', is80c: false },
        'Liquid': { icon: 'water_drop', color: '#0288D1', is80c: false },
        'Home': { icon: 'real_estate_agent', color: '#388E3C', is80c: false },
        'Cash': { icon: 'payments', color: '#795548', is80c: false },
        'Stocks': { icon: 'candlestick_chart', color: '#186D33', is80c: false }
    };
}

const milestoneThresholds = [
    { val: 100000, label: '1 Lakh' }, { val: 500000, label: '5 Lakh' }, { val: 1000000, label: '10 Lakh' },
    { val: 5000000, label: '50 Lakh' }, { val: 10000000, label: '1 Crore' }
];

const milestoneFacts = {
    100000: {
        name: 'First Lakh',
        description: 'Achieve a net worth of ₹1,00,000',
        fact: 'Saving your first ₹1 lakh is the hardest — it builds the habit of wealth creation. Most people never reach this milestone.'
    },
    500000: {
        name: 'Five Lakh',
        description: 'Achieve a net worth of ₹5,00,000',
        fact: 'At this stage you\'re a disciplined saver. Consider diversifying into mutual funds, stocks, and fixed-income assets.'
    },
    1000000: {
        name: 'Ten Lakh',
        description: 'Achieve a net worth of ₹10,00,000',
        fact: 'Welcome to the Lakhpati club! With ₹10 lakh, compound interest starts working in your favour — your money earns money.'
    },
    5000000: {
        name: 'Fifty Lakh',
        description: 'Achieve a net worth of ₹50,00,000',
        fact: 'Half a crore! At this wealth level, asset allocation and tax-efficient investing become crucial to protect your gains.'
    },
    10000000: {
        name: 'One Crore',
        description: 'Achieve a net worth of ₹1,00,00,000',
        fact: 'The Crorepati club! At 8% annual returns, your money now earns ₹8 lakh/year — more than many salaried professionals.'
    }
};

window.editInvId = null, window.editGoalId = null, window.editRecurringId = null, window.currentInvType = Object.keys(db.categories)[0] || 'Cash';
// Default field configurations for standard categories if not exists
const standardFieldConfigs = {
    'FD': { interest: true, payout: true, maturity: true, broker: true, subcat: true },
    'PPF': { interest: true, maturity: true, monthly: true, subcat: true },
    'PF': { interest: true, monthly: true, subcat: true },
    'SIP': { mf: true, sipday: true, monthly: true, broker: true, subcat: true },
    'Stocks': { mf: true, qty: true, broker: true, subcat: true },
    'Gold': { growth: true },
    'Real Estate': { growth: true },
    'Cash': { simple: true },
    'Liquid': { simple: true }
};
Object.keys(db.categories).forEach(cat => {
    if (!db.categoryDetails[cat]) db.categoryDetails[cat] = {};
    if (!db.categoryDetails[cat].fields && standardFieldConfigs[cat]) {
        db.categoryDetails[cat].fields = standardFieldConfigs[cat];
    }
});
window.activeCategory = null, window.activeAccountFilter = 'All';
// Tracks which sheet (and sub-sheet) is currently open so closeSubSheet can
// restore the underlying main sheet to sessionStorage. Previously these were
// implicit globals, which (a) tripped strict mode and (b) meant that early
// reads (e.g. from initUI on reload) returned `undefined` instead of `null`.
let activeMain = null, activeSub = null;
let currentTotalNW = 0, currentAvgMonthly = 0, currentTypeTotals = {};
let currentTax80c = 0;
let chartMonthsRange = 3;
let chartDataPoints = [];
let portfolioChartInstance = null, rollingChartInstance = null, categoryChartInstance = null;
let aiReportCharts = { pie: null, bar: null };

// Chart data cache to prevent unnecessary re-renders
let chartDataCache = {
    donut: { key: null, data: null, labels: null, colors: null },
    rolling: { key: null, data: null, labels: null },
    category: { key: null, data: null, labels: null, category: null }
};

// Loading state management
function setLoading(elementId, isLoading, message = '') {
    const el = document.getElementById(elementId);
    if (!el) return;

    if (isLoading) {
        const guard = parseInt(el.dataset.loadGuard || '0', 10) + 1;
        el.dataset.loadGuard = String(guard);
        if (el.dataset.originalContent === undefined) {
            el.dataset.originalContent = el.innerHTML;
        }
        el.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;gap:8px;padding:16px;color:var(--md-outline);">
            <span class="material-symbols-rounded" style="animation:spin 1s linear infinite;">progress_activity</span>
            ${escapeHtml(message) || 'Loading...'}
        </div>`;
        el.disabled = true;
    } else {
        const guard = parseInt(el.dataset.loadGuard || '0', 10);
        if (guard <= 0) return;
        const newGuard = guard - 1;
        el.dataset.loadGuard = String(newGuard);
        if (newGuard > 0) return;
        delete el.dataset.loadGuard;
        if (el.dataset.originalContent) {
            el.innerHTML = el.dataset.originalContent;
            delete el.dataset.originalContent;
        }
        el.disabled = false;
    }
}

function setButtonLoading(buttonOrId, isLoading) {
    const btn = typeof buttonOrId === 'string' ? document.getElementById(buttonOrId) : buttonOrId;
    if (!btn) return;

    if (isLoading) {
        btn.dataset.originalText = btn.innerHTML;
        btn.innerHTML = `<span class="material-symbols-rounded" style="animation:spin 1s linear infinite;font-size:18px;">progress_activity</span>`;
        btn.disabled = true;
        btn.style.opacity = '0.7';
    } else {
        if (btn.dataset.originalText) {
            btn.innerHTML = btn.dataset.originalText;
            delete btn.dataset.originalText;
        }
        btn.disabled = false;
        btn.style.opacity = '1';
    }
}

// Add CSS animation for spinner and skeleton screens
const style = document.createElement('style');
style.textContent = `
    @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes scaleIn { from { opacity: 0; transform: scale(0.9); } to { opacity: 1; transform: scale(1); } }
    
    .loading-overlay {
        position: absolute; top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(var(--md-surface-rgb, 255,255,255), 0.8);
        display: flex; align-items: center; justify-content: center;
        z-index: 100; border-radius: inherit;
        backdrop-filter: blur(2px);
    }
    
    @keyframes skeleton-pulse {
        0% { opacity: 1; }
        50% { opacity: 0.4; }
        100% { opacity: 1; }
    }
    
    .skeleton {
        background: var(--md-surface-container-highest);
        border-radius: 8px;
        animation: skeleton-pulse 1.5s ease-in-out infinite;
        position: relative;
        overflow: hidden;
    }
    
    .skeleton::after {
        content: '';
        position: absolute;
        top: 0; right: 0; bottom: 0; left: 0;
        background: linear-gradient(
            90deg,
            transparent,
            rgba(255, 255, 255, 0.3),
            transparent
        );
        animation: skeleton-shimmer 2s infinite;
    }
    
    @keyframes skeleton-shimmer {
        0% { transform: translateX(-100%); }
        100% { transform: translateX(100%); }
    }
    
    .skeleton-text { height: 16px; margin: 8px 0; }
    .skeleton-title { height: 24px; width: 60%; margin: 12px 0; }
    .skeleton-circle { border-radius: 50%; }
    .skeleton-card {
        background: var(--md-surface-container-low);
        border-radius: 16px;
        padding: 16px;
        margin: 12px 0;
        animation: fadeIn 0.3s ease-out;
    }
    
    .chart-skeleton {
        height: 200px;
        border-radius: 16px;
        background: var(--md-surface-container-highest);
        animation: skeleton-pulse 1.5s ease-in-out infinite;
    }
    
    .fade-in {
        animation: fadeIn 0.3s ease-out;
    }
    
    .slide-up {
        animation: slideUp 0.4s ease-out;
    }
    
    .scale-in {
        animation: scaleIn 0.2s ease-out;
    }
    
    .hover-lift {
        transition: transform 0.2s ease-out, box-shadow 0.2s ease-out;
    }
    
    .hover-lift:hover {
        transform: translateY(-2px);
        box-shadow: 0 8px 24px rgba(0,0,0,0.1);
    }
    
    .btn-ripple {
        position: relative;
        overflow: hidden;
    }
    
    .btn-ripple::after {
        content: '';
        position: absolute;
        top: 50%; left: 50%;
        width: 0; height: 0;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.5);
        transform: translate(-50%, -50%);
        transition: width 0.6s, height 0.6s;
    }
    
    .btn-ripple:active::after {
        width: 300px; height: 300px;
    }
    
    /* Mobile-specific optimizations */
    @media (max-width: 768px) {
        .sheet {
            max-width: 95vw;
            margin: 0 auto;
        }
        
        .sheet-content {
            padding: 16px;
            max-height: 80vh;
            overflow-y: auto;
        }
        
        .mobile-context-menu {
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            background: var(--md-surface-container);
            border-radius: 16px 16px 0 0;
            box-shadow: 0 4px 20px rgba(0,0,0,0.2);
            z-index: 2000;
            max-width: 100%;
            max-height: 100dvh;
            overflow-y: auto;
        }
        
        .mobile-context-item {
            padding: 16px 20px;
            border-bottom: 1px solid var(--md-outline-variant);
            display: flex;
            align-items: center;
            gap: 12px;
            font-size: 16px;
            min-height: 56px;
        }
        
        .mobile-context-item:last-child {
            border-bottom: none;
        }
        
        .mobile-context-cancel {
            background: var(--md-surface-container-highest);
            font-weight: 500;
            border-top: 1px solid var(--md-outline-variant);
        }
    }
    
    /* Touch-friendly targets */
    @media (hover: none) and (pointer: coarse) {
        .swipe-wrapper .unified-item {
            min-height: 60px;
            padding: 16px;
        }
        
        button, .btn-primary, .btn-secondary {
            min-height: 48px;
            min-width: 48px;
            padding: 12px 20px;
        }
        
        .chip, .sort-chip {
            min-height: 40px;
            padding: 8px 16px;
            font-size: 14px;
        }
    }
    
    .input-error {
        border-color: var(--md-error) !important;
        box-shadow: 0 0 0 2px rgba(186, 26, 26, 0.2) !important;
        animation: shake 0.3s ease-in-out;
    }
    
    @keyframes shake {
        0%, 100% { transform: translateX(0); }
        25% { transform: translateX(-5px); }
        75% { transform: translateX(5px); }
    }
    
    .input-focused {
        border-color: var(--md-primary) !important;
        box-shadow: 0 0 0 2px rgba(65, 95, 145, 0.2) !important;
        transition: border-color 0.2s ease-out, box-shadow 0.2s ease-out;
    }
    
    .error-message {
        animation: fadeIn 0.2s ease-out;
    }
    
    .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
    }
    
    .fade-out {
        animation: fadeOut 0.2s ease-out forwards;
    }
    
    @keyframes fadeOut {
        from { opacity: 1; }
        to { opacity: 0; }
    }
`;
document.head.appendChild(style);

// Mobile performance optimizations
function optimizeForMobile() {
    // Optimize scrolling performance
    if ('scrollBehavior' in document.documentElement.style) {
        document.documentElement.style.scrollBehavior = 'smooth';
    }

    // Reduce motion for users who prefer it
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        document.documentElement.style.setProperty('--animation-duration', '0.01ms');
    }

    // Preload critical resources
    if ('requestIdleCallback' in window) {
        requestIdleCallback(() => {
            // Preload commonly used components
            const preloadSheets = ['invest-sheet', 'settings-sheet'];
            preloadSheets.forEach(sheetId => {
                const sheet = document.getElementById(sheetId);
                if (sheet) {
                    sheet.style.display = 'none';
                    sheet.style.display = '';
                }
            });
        });
    }

    // Optimize images for mobile
    const images = document.querySelectorAll('img');
    images.forEach(img => {
        if (img.loading === 'lazy') return;
        img.loading = 'lazy';
        img.decoding = 'async';
    });
}

// PWA features
function installPWA() {
    // Check if running as PWA
    if (window.matchMedia('(display-mode: standalone)').matches) {
        document.body.classList.add('pwa-standalone');
    }



    window.dismissPWAInstall = () => {
        const banner = document.querySelector('.pwa-install-banner');
        if (banner) {
            banner.classList.add('fade-out');
            setTimeout(() => banner.remove(), 300);
        }
    };
}

// Initialize mobile optimizations and PWA features
document.addEventListener('DOMContentLoaded', () => {
    optimizeForMobile();
    installPWA();
    initScrollToTop();
});

// Generate cache key from relevant data
function generateChartCacheKey(type) {
    if (type === 'donut') {
        return `${activeAccountFilter}|${currentTotalNW}|${Object.entries(currentTypeTotals).sort().map(([k, v]) => k + ':' + v.toFixed(0)).join(',')}|${db.privacyMode}`;
    } else if (type === 'rolling') {
        let now = new Date();
        let currentMonthKey = `${now.getFullYear()}-${now.getMonth()}`;
        return `${window.activeAccountFilter}|${currentMonthKey}|${db.privacyMode}|${db.investments.length}`;
    } else if (type === 'category') {
        return `${window.activeCategory}|${db.investments.filter(i => i.type === window.activeCategory).length}|${db.privacyMode}`;
    }
    return Date.now().toString();
}

Chart.defaults.font.family = "'Roboto', sans-serif";
Chart.defaults.color = "#767680";
Chart.defaults.plugins.tooltip.backgroundColor = "#1B1B1F";
Chart.defaults.plugins.tooltip.titleFont = { size: 13, weight: 'bold' };
Chart.defaults.plugins.tooltip.padding = 10;
Chart.defaults.plugins.tooltip.cornerRadius = 8;
Chart.defaults.plugins.tooltip.callbacks.label = function (c) { return '₹' + Number(c.raw).toLocaleString('en-IN'); };
Chart.defaults.animation = { duration: 200, easing: 'easeOutQuart' };

// Utility: Debounce function
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// ==========================================
// 2. GLOBAL HELPER FUNCTIONS
// ==========================================
document.addEventListener('mousedown', () => window.userInteracted = true, { once: true });
document.addEventListener('touchstart', () => window.userInteracted = true, { once: true });

// ── UNIQUE ID GENERATOR ────────────────────────
// Measure scrollbar width to prevent layout shift when lock-scroll is applied
(function() {
    const el = document.createElement('div');
    el.style.cssText = 'width:50px;height:50px;overflow-y:scroll;visibility:hidden;position:absolute;top:-9999px';
    document.body.appendChild(el);
    const sw = el.offsetWidth - el.clientWidth;
    document.body.removeChild(el);
    document.documentElement.style.setProperty('--scrollbar-width', sw + 'px');
})();

let _idCounter = (() => { try { return parseInt(sessionStorage.getItem('_idCounter') || '0', 10); } catch(e) { return 0; } })();
function generateUniqueId() {
    const ts = Date.now();
    const counter = ++_idCounter % 10000;
    const random = Math.floor(Math.random() * 1000);
    try { sessionStorage.setItem('_idCounter', String(_idCounter)); } catch(e) {}
    return `${ts}${counter}${random}`;
}

// ── HISTORY & SESSION HELPERS ──────────────────
function pushSheetState(sheetId) {
    history.pushState({ sheetId: sheetId }, "");
}

function handlePopState(event) {
    const state = event.state;
    const subSheet = document.querySelector('.sheet.sub-sheet.active');
    const mainSheet = document.querySelector('.sheet.active:not(.sub-sheet)');

    if (subSheet) {
        closeSubSheet(true);
    } else if (mainSheet) {
        closeOverlays(true);
    } else if (state && state.tabId) {
        performTabSwitch(state.tabId, true);
    } else {
        closeOverlays(true);
    }
}

function getLocalYYYYMMDD(d) {
    const tzOffset = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - tzOffset).toISOString().split('T')[0];
}

function parseDate(dateStr) {
    if (!dateStr) return new Date();
    const p = dateStr.split('-');
    if (p.length !== 3 || isNaN(p[0]) || isNaN(p[1]) || isNaN(p[2])) return new Date();
    const d = new Date(p[0], p[1] - 1, p[2]);
    return isNaN(d.getTime()) ? new Date() : d;
}

/**
 * Formats a number as Indian Rupees
 * @param {number} num - The number to format
 * @returns {string} Formatted currency string
 */
/**
 * Formats a number to Indian-locale string with privacy mode check
 * @param {number} num - The number to format
 * @returns {string} Formatted number string (no currency symbol)
 */
function fmtNum(num) {
    if (db.privacyMode) return '•••••';
    return Number(num).toLocaleString('en-IN');
}

function formatMoney(num) {
    if (db.privacyMode) return '•••••';
    const sym = db.currency && db.currency !== 'INR' ? (db.currencySymbol || db.currency + ' ') : '₹';
    return sym + fmtNum(num);
}

/**
 * Shows a snackbar notification with optional icon and accessibility support
 * @param {string} msg - Message to display
 * @param {string} icon - Material icon name (default: "info")
 * @param {string} type - Notification type for accessibility (default: "info")
 */
function showSnackbar(msg, icon = "info", type = "info") {
    let sb = document.getElementById("snackbar");
    if (!sb) {
        sb = document.createElement('div');
        sb.id = 'snackbar';
        sb.className = 'snackbar';
        document.body.appendChild(sb);
    }

    const iconText = icon === "check_circle" ? "Success" :
        icon === "error" ? "Error" :
            icon === "warning" ? "Warning" : "Information";

    sb.innerHTML = `
        <span class="material-symbols-rounded" style="font-size:20px;" aria-hidden="true">${escapeHtml(icon)}</span>
        <span class="snackbar-message" role="status" aria-live="polite" aria-atomic="true">
            ${escapeHtml(msg)}
        </span>
    `;
    sb.setAttribute("role", "alert");
    sb.setAttribute("aria-label", `${iconText}: ${msg}`);
    sb.classList.add("show");

    // Auto-focus for screen readers
    sb.setAttribute("tabindex", "0");
    sb.focus();

    setTimeout(() => {
        sb.classList.remove("show");
        sb.removeAttribute("tabindex");
    }, 3000);
}

/**
 * Closes all overlays and resets edit states
 * @param {boolean} fromPopState - Whether called from popstate event
 */
let _overlayBusy = false;

function closeOverlays(fromPopState = false) {
    if (_overlayBusy) return;
    _overlayBusy = true;
    try {
    if (fromPopState) {
        // History back: close only the topmost sheet
        const subSheet = document.querySelector('.sheet.sub-sheet.active');
        const mainSheet = document.querySelector('.sheet.active:not(.sub-sheet)');
        const target = subSheet || mainSheet;
        if (target) target.classList.remove('active');

        const subScrim = document.getElementById('scrim-sub');
        if (subScrim && subScrim.classList.contains('active')) {
            subScrim.classList.remove('active');
        }
        if (!subSheet) {
            const mainScrim = document.getElementById('scrim');
            if (mainScrim && mainScrim.classList.contains('active')) {
                mainScrim.classList.remove('active');
            }
            document.body.classList.remove('lock-scroll');
        }
        activeSub = null;
        if (!subSheet) activeMain = null;
    } else {
        // Save/close: close ALL sheets and scrims
        document.querySelectorAll('.sheet.active').forEach(el => el.classList.remove('active'));
        const mainScrim = document.getElementById('scrim');
        if (mainScrim && mainScrim.classList.contains('active')) mainScrim.classList.remove('active');
        const subScrim = document.getElementById('scrim-sub');
        if (subScrim && subScrim.classList.contains('active')) subScrim.classList.remove('active');
        document.body.classList.remove('lock-scroll');

        // Close AI bubble popup if visible (preserve chat session, not destroy it)
        const aiPopup = document.getElementById('ai-chat-popup');
        if (aiPopup && aiPopup.classList.contains('visible')) {
            aiPopup.classList.remove('visible');
            setTimeout(() => aiPopup.classList.add('hidden'), 400);
        }

        try { sessionStorage.removeItem('currentSheet'); } catch (e) { console.warn('[sessionStorage]', e.message); }

        if (history && history.state && history.state.sheetId) {
            try { history.back(); } catch (e) { console.warn('[history]', e.message); }
        }

        activeSub = null;
        activeMain = null;
    }
    } finally { _overlayBusy = false; }
}

function openSettings() {
    haptic(40);
    if (document.getElementById('settings-sheet')) { openSheet('settings-sheet'); }
}

// Sub-sheets open ON TOP of an existing sheet (e.g. calculators from Settings)
const SUB_SHEET_IDS = new Set([
    'ai-predict-sheet', 'history-sync-sheet',
    'chat-history-sheet', 'wealth-blueprint-sheet', 'ai-sheet',
    'maturity-calendar-sheet', 'ai-chat-sheet', 'monthly-target-sheet',
    'projection-sheet', 'month-sheet', 'notif-sheet',
    'note-month-sheet'
]);

function openSubSheet(sheetId) {
    if (!SUB_SHEET_IDS.has(sheetId)) {
        SUB_SHEET_IDS.add(sheetId);
    }
    openSheet(sheetId);
}
window.openSubSheet = openSubSheet;

let _sheetOpening = false;

function openSheet(sheetId, fromRestore = false) {
    if (_sheetOpening) return;
    _sheetOpening = true;
    haptic(20);
    try {
    const isSubSheet = SUB_SHEET_IDS.has(sheetId);
    const targetSheet = document.getElementById(sheetId);

    if (!targetSheet) {
        console.warn(`Sheet with ID "${sheetId}" not found`);
        return;
    }

    // Guard: if already open, do nothing
    if (targetSheet.classList.contains('active')) {
        return;
    }

    if (isSubSheet) {
        document.querySelectorAll('.sheet.sub-sheet.active').forEach(el => {
            el.classList.remove('active');
        });

        document.getElementById('scrim')?.classList.add('active');
        document.getElementById('scrim-sub')?.classList.add('active');

        setTimeout(() => {
            targetSheet.classList.add('active');
        }, 50);

        activeSub = sheetId;
    } else {
        // Close any existing sheet without race
        const existingSheets = document.querySelectorAll('.sheet.active');
        existingSheets.forEach(el => el.classList.remove('active'));
        const mainScrim = document.getElementById('scrim');
        if (mainScrim) mainScrim.classList.remove('active');
        const subScrim = document.getElementById('scrim-sub');
        if (subScrim) subScrim.classList.remove('active');

        document.getElementById('scrim')?.classList.add('active');

        setTimeout(() => {
            targetSheet.classList.add('active');
        }, 50);

        activeMain = sheetId;
        activeSub = null;
    }

    document.body.classList.add('lock-scroll');

    try { sessionStorage.setItem('currentSheet', sheetId); } catch (e) {}

    if (sheetId === 'history-sync-sheet') populateSyncDropdown();

    if (!fromRestore) pushSheetState(sheetId);
    } finally { _sheetOpening = false; }
}

function closeSubSheet(fromPopState = false) {
    // Save main sheet scroll position before closing sub-sheet
    const mainSheetEl = activeMain ? document.getElementById(activeMain) : null;
    const savedScrollTop = mainSheetEl ? mainSheetEl.scrollTop : 0;

    document.getElementById('scrim-sub')?.classList.remove('active');
    document.querySelectorAll('.sheet.sub-sheet').forEach(el => el.classList.remove('active'));
    activeSub = null;

    // If no main sheet remains, clean up main scrim + scroll lock too
    const mainSheet = document.querySelector('.sheet.active:not(.sub-sheet)');
    if (!mainSheet) {
        document.getElementById('scrim')?.classList.remove('active');
        document.body.classList.remove('lock-scroll');
        try { sessionStorage.removeItem('currentSheet'); } catch (e) {}
        activeMain = null;
    } else {
        // Restore parent sheet scroll position
        if (mainSheetEl) {
            requestAnimationFrame(() => { mainSheetEl.scrollTop = savedScrollTop; });
        }
        if (activeMain) sessionStorage.setItem('currentSheet', activeMain);
    }

    if (!fromPopState && history.state && history.state.sheetId) {
        history.back();
    }
}

// ── COPY NET WORTH ──────────────────────────────
function copyNetWorth() {
    const text = `Net Worth: ₹${fmtNum(currentTotalNW)} (as of ${new Date().toLocaleDateString('en-IN')})`;
    navigator.clipboard.writeText(text).then(() => showSnackbar('Copied to clipboard', 'content_copy')).catch(() => showSnackbar('Copy failed', 'error'));
}

// ── CSV EXPORT ──────────────────────────────────
function exportToCSV() {
    haptic(30);
    let rows = [['Date', 'Type', 'Amount', 'Account', 'Note', 'Tags']];
    [...db.investments].sort((a, b) => parseDate(b.date) - parseDate(a.date)).forEach(inv => {
        rows.push([inv.date, inv.type, inv.amount, inv.account || '', inv.note || '', inv.tags || '']);
    });
    let csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    let blob = new Blob([csv], { type: 'text/csv' });
    let a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `InvestPro_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    showSnackbar('CSV exported!', 'download');
}

// ── LEDGER SORT & FILTER ────────────────────────
window.escapeHtml = escapeHtml;
window.saveSmartDefault = saveSmartDefault;
window.getSmartDefault = getSmartDefault;
window.debounce = debounce;
function setLedgerSort(field, btn) {
    window.ledgerSort = field;
    document.querySelectorAll('.sort-chip[id^="sort-"]').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    if (window.renderHistory) renderHistory();
}
function toggleLedgerOrder(btn) {
    window.ledgerAsc = !window.ledgerAsc;
    document.getElementById('sort-order-icon').textContent = window.ledgerAsc ? 'arrow_upward' : 'arrow_downward';
    if (window.renderHistory) renderHistory();
}
function clearLedgerDates() {
    document.getElementById('ledger-date-from').value = '';
    document.getElementById('ledger-date-to').value = '';
    renderHistory();
}

// ── ENHANCE DATE INPUT MOBILE UX ────────────────────────
function initLedgerDateInputs() {
    const dateFromEl = document.getElementById('ledger-date-from');
    const dateToEl = document.getElementById('ledger-date-to');
    
    if (!dateFromEl || !dateToEl) return;
    
    const updateDateDisplay = (input) => {
        if (input.value) {
            const date = new Date(input.value);
            const formatted = date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
            input.title = `${input.id === 'ledger-date-from' ? 'From' : 'To'}: ${formatted}`;
        } else {
            input.title = input.id === 'ledger-date-from' ? 'From date' : 'To date';
        }
    };
    
    dateFromEl.addEventListener('change', () => updateDateDisplay(dateFromEl));
    dateToEl.addEventListener('change', () => updateDateDisplay(dateToEl));
    
    // Initialize on load
    updateDateDisplay(dateFromEl);
    updateDateDisplay(dateToEl);
}

// Call on page load
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(initLedgerDateInputs, 100);
});

// ── RECURRING SIP MANAGER ───────────────────────
function renderRecurringSheet() {
    let total = db.recurring.reduce((s, r) => s + r.amount, 0);
    let totalEl = document.getElementById('recurring-total-val');
    if (totalEl) totalEl.textContent = formatMoney(total);
    let list = document.getElementById('recurring-list');
    if (!list) return;
    if (db.recurring.length === 0) {
        // Use context-aware empty state or fallback to local implementation
        if (typeof getEmptyStateHTML === 'function') {
            list.innerHTML = getEmptyStateHTML('recurring');
        } else {
            list.innerHTML = `<div class="empty-state-premium" style="padding:40px 24px; text-align:center;">
                <span class="material-symbols-rounded" style="font-size:48px; color:var(--md-outline); margin-bottom:16px;">autorenew</span>
                <div style="font-size:18px; font-weight:600; margin-bottom:8px;">No Recurring SIPs</div>
                <div style="font-size:14px; color:var(--md-on-surface-variant); margin-bottom:24px;">Set up automatic monthly investments to build wealth consistently</div>
                <button class="btn-primary" style="display:inline-flex; align-items:center; gap:8px;" onclick="openRecurringSheet(); setTimeout(()=>{document.getElementById('inv-is-monthly').checked=true;}, 200)">
                    <span class="material-symbols-rounded">schedule</span> Add SIP
                </button>
            </div>`;
        }
        return;
    }
    list.innerHTML = db.recurring.map((r, idx) => {
        let meta = db.categories[r.type] || { color: '#8D6E63', icon: 'savings' };
        let next = new Date(r.nextRun).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
        return `<div class="sip-item">
                    <div class="sip-item-icon" style="background:${escapeHtml(meta.color)};"><span class="material-symbols-rounded" style="font-size:18px;">${escapeHtml(meta.icon)}</span></div>
                    <div class="sip-item-info">
                        <div class="sip-item-name">${escapeHtml(r.note || r.type)}</div>
                        <div class="sip-item-meta">${escapeHtml(r.type)} · Next: ${next} · ${escapeHtml(r.account || 'Default')}</div>
                    </div>
                    <div class="sip-item-amt">${formatMoney(r.amount)}</div>
                    <button class="icon-btn" onclick="deleteRecurring('${r.id}')" style="width:36px;height:36px;color:var(--md-error);"><span class="material-symbols-rounded" style="font-size:18px;">delete</span></button>
                </div>`;
    }).join('');
}

function openRecurringSheet() {
    haptic(30);
    renderRecurringSheet();
    openSheet('recurring-sheet');
}
window.openRecurringSheet = openRecurringSheet;
function deleteRecurring(id) {
    haptic(30);
    Swal.fire({
        title: 'Delete SIP?',
        text: 'This will permanently remove this recurring SIP.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: 'var(--md-error)',
        confirmButtonText: 'Yes, delete it',
        customClass: { popup: 'swal2-popup', confirmButton: 'swal2-confirm', cancelButton: 'swal2-cancel' }
    }).then(r => {
        if (r.isConfirmed) {
            db.recurring = db.recurring.filter(r => String(r.id) !== String(id));
            saveData();
            renderRecurringSheet();
            showSnackbar('SIP removed', 'check_circle');
            window.editRecurringId = null;
        } else {
            window.editRecurringId = null;
        }
    });
}

// ── STAT CHIPS UPDATE ───────────────────────────
function updateStatChips(totalInvested, totalMarketValue, yearTotal, thisMonthTotal) {
    let sal = db.userProfile.salary || 0;
    let pnl = totalMarketValue - totalInvested;
    let roi = totalInvested > 0 ? ((pnl / totalInvested) * 100) : 0;

    // Savings rate: use this month's total if it's the current performance we are tracking
    let savRate = sal > 0 ? Math.round((thisMonthTotal / (sal / 12)) * 100) : 0;

    // Best month
    let monthMap = {};
    db.investments.forEach(i => {
        let k = i.date.substring(0, 7);
        monthMap[k] = (monthMap[k] || 0) + i.amount;
    });
    let bestMonth = '—'; let bestAmt = 0;
    Object.entries(monthMap).forEach(([k, v]) => { if (v > bestAmt) { bestAmt = v; bestMonth = k; } });
    if (bestMonth !== '—') { let d = parseDate(bestMonth + '-01'); bestMonth = d.toLocaleString('default', { month: 'short', year: '2-digit' }); }

    // Investment streak (consecutive months)
    let now = new Date(); let streak = 0;
    let startOffset = 0;
    let currentK = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    if (!(monthMap[currentK] > 0)) {
        startOffset = 1;
    }
    for (let i = startOffset; i < 24 + startOffset; i++) {
        let m = now.getMonth() - i; let y = now.getFullYear();
        while (m < 0) { m += 12; y--; }
        let k = `${y}-${String(m + 1).padStart(2, '0')}`;
        if (monthMap[k] > 0) streak++; else break;
    }

    let invested = document.getElementById('sc-invested'); if (invested) invested.textContent = formatMoney(totalInvested);
    let pnlEl = document.getElementById('sc-pnl'); if (pnlEl) { pnlEl.textContent = (pnl >= 0 ? '+' : '') + formatMoney(pnl); pnlEl.style.color = pnl >= 0 ? '#00c853' : '#ff5252'; }
    let srEl = document.getElementById('sc-savings-rate'); if (srEl) { srEl.textContent = savRate + '%'; srEl.style.color = savRate >= 20 ? '#00c853' : savRate >= 10 ? 'var(--md-on-surface)' : '#ff5252'; }
    let bmEl = document.getElementById('sc-best-month'); if (bmEl) bmEl.textContent = bestMonth;
    let stEl = document.getElementById('sc-streak'); if (stEl) stEl.textContent = streak + ' mo';

    // Hero ROI badge
    let badge = document.getElementById('hero-roi-badge');
    if (badge) {
        let sign = roi >= 0 ? '+' : '';
        badge.textContent = `${sign}${roi.toFixed(1)}% ROI`;
        badge.className = `badge-pill ${roi >= 0 ? 'badge-positive' : 'badge-negative'}`;
    }
}

// ── ACCESSIBLE KEYBOARD SHORTCUTS ──────────────────────
document.addEventListener('keydown', e => {
    // Allow ? to show shortcuts help from anywhere
    if (e.key === '?' && !e.shiftKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        showShortcutsHelp();
        return;
    }

    // Skip shortcuts when user is typing in forms
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT' || e.target.isContentEditable) return;

    let actionTaken = false;
    let actionDescription = '';

    // Map shortcuts to actions with descriptions
    const shortcuts = {
        'n|N': { action: () => openInvestSheet(), desc: 'New Investment' },
        'Escape': { action: () => { closeOverlays(); closeSubSheet(); }, desc: 'Close/Go Back' },
        '1': { action: () => switchTab('dashboard'), desc: 'Dashboard Tab' },
        '2': { action: () => switchTab('portfolio'), desc: 'Portfolio Tab' },
        '3': { action: () => switchTab('ledger'), desc: 'Ledger Tab' },
        'p|P': { action: () => togglePrivacy(), desc: 'Toggle Privacy' },
        's|S': { action: () => openSettings(), desc: 'Settings' },
        'g|G': { action: () => { if (db.goals.length > 0) openGoalSheet(db.goals[0].id); }, desc: 'Edit First Goal' },
        'r|R': { action: () => { renderAll(); showSnackbar('Refreshed', 'refresh'); }, desc: 'Refresh Data' },
        'a|A': { action: () => { if (window.__aiEnabled !== false) openAIHub(); }, desc: 'AI Hub' }
    };

    // Check which shortcut matches
    Object.keys(shortcuts).forEach(key => {
        const keys = key.split('|');
        const matches = keys.some(k => e.key === k);
        const modifierMatch = key.includes('|') ?
            (e.key === key.split('|')[0] && !e.shiftKey && !e.ctrlKey && !e.altKey) ||
            (e.key === key.split('|')[1] && e.shiftKey && !e.ctrlKey && !e.altKey) :
            e.key === key && !e.shiftKey && !e.ctrlKey && !e.altKey;

        if (matches && modifierMatch) {
            e.preventDefault();
            shortcuts[key].action();
            actionTaken = true;
            actionDescription = shortcuts[key].desc;
        }
    });

    // Announce action to screen readers
    if (actionTaken) {
        announceToScreenReader(`Action performed: ${actionDescription}`);
    }
});

// Screen reader announcement utility
function announceToScreenReader(message) {
    const announcement = document.createElement('div');
    announcement.setAttribute('role', 'status');
    announcement.setAttribute('aria-live', 'polite');
    announcement.setAttribute('aria-atomic', 'true');
    announcement.className = 'sr-only';
    announcement.textContent = message;
    announcement.style.cssText = 'position: absolute; left: -10000px; width: 1px; height: 1px; overflow: hidden;';

    document.body.appendChild(announcement);
    setTimeout(() => document.body.removeChild(announcement), 1000);
}

function showShortcutsHelp() {
    const shortcuts = [
        { key: 'N', action: 'New Investment', desc: 'Open investment form' },
        { key: 'A', action: 'AI Chat', desc: 'Toggle AI assistant' },
        { key: '1', action: 'Dashboard Tab', desc: 'Switch to dashboard' },
        { key: '2', action: 'Portfolio Tab', desc: 'Switch to portfolio' },
        { key: '3', action: 'Ledger Tab', desc: 'Switch to ledger' },
        { key: 'P', action: 'Toggle Privacy', desc: 'Hide/show amounts' },
        { key: 'S', action: 'Settings', desc: 'Open settings' },
        { key: 'G', action: 'Edit First Goal', desc: 'Edit first goal' },
        { key: 'R', action: 'Refresh Data', desc: 'Refresh all data' },
        { key: 'Esc', action: 'Close/Go Back', desc: 'Close current dialog' },
        { key: '?', action: 'Show This Help', desc: 'Show keyboard shortcuts' },
        { key: 'Ctrl+Enter', action: 'Save Form', desc: 'Save in any form' },
        { key: 'Tab/Shift+Tab', action: 'Navigate Fields', desc: 'Navigate between form fields' }
    ];

    let html = `<div style="display:grid; grid-template-columns: auto 1fr; gap: 12px 24px; max-width: 300px;">`;
    shortcuts.forEach(s => {
        html += `<div style="font-family: monospace; background: var(--md-surface-container-highest); padding: 4px 12px; border-radius: 6px; text-align: center; font-weight: 600;">${s.key}</div>
                  <div style="padding: 4px 0;">${s.action}</div>`;
    });
    html += `</div>
    <div style="margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--md-outline-variant); font-size: 12px; color: var(--md-outline); text-align: center;">
        Press any key to close
    </div>`;

    Swal.fire({
        title: 'Keyboard Shortcuts',
        html: html,
        showConfirmButton: false,
        showCloseButton: true,
        width: 'auto',
        customClass: { popup: 'shortcuts-popup' }
    });

    // Close on any key press
    const closeOnKey = () => {
        Swal.close();
        document.removeEventListener('keydown', closeOnKey);
    };
    setTimeout(() => document.addEventListener('keydown', closeOnKey), 100);
}
window.showShortcutsHelp = showShortcutsHelp;

let _saveDataPending = false;
let _dataGen = 0;
window.markDataDirty = function() { _dataGen++; window._dataGen = _dataGen; };
function saveData() {
    window.markDataDirty();
    if (_saveDataPending) return;
    _saveDataPending = true;
    // Coalesce rapid successive saves into one
    requestAnimationFrame(() => {
        _saveDataPending = false;
        db.lastUpdated = Date.now();

        const sanitizedDb = sanitizeDatabaseObject(db);

        // Encode API keys at rest. If PIN is set, encrypt them with the app PIN.
        if (db.appPin) {
            sanitizedDb._ek = _encryptKey(db.geminiKey || '', db.appPin) + '|' + _encryptKey(db.groqKey || '', db.appPin) + '|' + _encryptKey(db.openrouterKey || '', db.appPin) + '|' + _encryptKey(db.cerebrasKey || '', db.appPin) + '|' + _encryptKey(db.githubKey || '', db.appPin);
            delete sanitizedDb.geminiKey; delete sanitizedDb.groqKey; delete sanitizedDb.openrouterKey; delete sanitizedDb.cerebrasKey; delete sanitizedDb.githubKey;
        } else {
            sanitizedDb.geminiKey = _encodeKey(db.geminiKey || '');
            sanitizedDb.groqKey = _encodeKey(db.groqKey || '');
            sanitizedDb.openrouterKey = _encodeKey(db.openrouterKey || '');
            sanitizedDb.cerebrasKey = _encodeKey(db.cerebrasKey || '');
            sanitizedDb.githubKey = _encodeKey(db.githubKey || '');
        }

        // Save data first using cross-browser compatible function
        if (!safeLocalStorageSet('appHubInvestDb', sanitizedDb)) {
            handleStorageError(new Error('localStorage access denied'));
            return;
        }

        // Defer non-critical work (quota check, cross-tab sync) to next frame to avoid jank
        requestAnimationFrame(() => {
            checkStorageQuota(sanitizedDb);
            broadcastToTabs();
        });
    });
}

function handleStorageError(error) {
    let errorMessage = "Storage error occurred.";
    if (error.name === 'QuotaExceededError') {
        errorMessage = "Storage quota exceeded. Please backup and clean data.";
    } else if (error.name === 'NS_ERROR_DOM' || error.name === 'SecurityError') {
        errorMessage = "Storage access denied. Check browser settings.";
    } else if (error.name === 'TypeError') {
        errorMessage = "Data format error. Some data may be corrupted.";
    }

    showSnackbar(errorMessage, "error");

    // Attempt recovery actions
    attemptStorageRecovery().catch(error => {
        console.error('Recovery system failed:', error);
        showSnackbar('Recovery system failed', 'error');
    });
}

// COMPREHENSIVE ERROR HANDLING AND RECOVERY SYSTEM
async function attemptStorageRecovery() {
    const recoveryStrategies = [
        { name: 'Clear Chat History', action: clearChatHistory, priority: 1 },
        { name: 'Clear Navigation Cache', action: clearNavigationCache, priority: 2 },
        { name: 'Clear Image Cache', action: clearImageCache, priority: 3 },
        { name: 'Reset Settings', action: resetCorruptedSettings, priority: 4 },
        { name: 'Export Emergency Backup', action: createEmergencyBackup, priority: 0 }
    ];

    let recoverySuccessful = false;

    for (const strategy of recoveryStrategies) {
        try {
            const result = await strategy.action();

            if (result.success) {
                showSnackbar(`Recovery successful: ${strategy.name}`, 'check_circle');
                recoverySuccessful = true;
                break;
            } else {
                console.warn(`Recovery failed: ${strategy.name}`, result.error);
            }
        } catch (error) {
            console.error(`Recovery error: ${strategy.name}`, error);
        }
    }

    if (!recoverySuccessful) {
        showSnackbar("All recovery attempts failed. Please contact support.", "error");
        // Show manual recovery options
        showManualRecoveryDialog();
    }
}

async function clearChatHistory() {
    try {
        if (db.chatHistory && db.chatHistory.length > 50) {
            const originalLength = db.chatHistory.length;
            db.chatHistory = db.chatHistory.slice(-50);
            saveData();

            return {
                success: true,
                message: `Cleared ${originalLength - 50} old chat messages`,
                spaceFreed: estimateSpaceSaved(originalLength - 50)
            };
        }
        return { success: false, message: 'Chat history already within limits' };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function clearNavigationCache() {
    try {
        const cacheSize = db.navCache ? Object.keys(db.navCache).length : 0;

        if (cacheSize > 100) {
            db.navCache = {};
            saveData();

            return {
                success: true,
                message: `Cleared ${cacheSize} cache entries`,
                spaceFreed: estimateSpaceSaved(cacheSize * 100) // Rough estimate
            };
        }
        return { success: false, message: 'Navigation cache already within limits' };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function clearImageCache() {
    try {
        // Clear any cached images or blobs
        const images = document.querySelectorAll('img[data-cache]');
        let clearedCount = 0;

        images.forEach(img => {
            if (img.dataset.cache) {
                URL.revokeObjectURL(img.src);
                img.remove();
                clearedCount++;
            }
        });

        return {
            success: true,
            message: `Cleared ${clearedCount} cached images`,
            spaceFreed: estimateSpaceSaved(clearedCount * 50000) // Rough estimate
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function resetCorruptedSettings() {
    try {
        const corruptedKeys = Object.keys(db).filter(key => {
            const value = db[key];
            return typeof value === 'undefined' || value === null;
        });

        if (corruptedKeys.length > 0) {
            // Reset to default values
            const defaults = {
                userProfile: { salary: 0, regime: 'new', monthlyExpense: 0 },
                settingsTable: { lastResetMonth: '' },
                categories: {},
                allocTargets: {},
                navCache: {}
            };

            Object.keys(defaults).forEach(key => {
                if (corruptedKeys.includes(key)) {
                    db[key] = defaults[key];
                }
            });

            saveData();

            return {
                success: true,
                message: `Reset ${corruptedKeys.length} corrupted settings`,
                keys: corruptedKeys
            };
        }
        return { success: false, message: 'No corrupted settings found' };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function createEmergencyBackup() {
    try {
        const emergencyData = {
            version: '1.0-emergency',
            timestamp: new Date().toISOString(),
            data: db,
            checksum: await generateDataChecksum(db),
            metadata: {
                userAgent: navigator.userAgent,
                url: window.location.href,
                reason: 'storage_recovery'
            }
        };

        // Create multiple backup formats
        const jsonBlob = new Blob([JSON.stringify(emergencyData, null, 2)], { type: 'application/json' });
        const csvBlob = new Blob([convertToCSV(db.investments)], { type: 'text/csv' });

        // Download both formats
        downloadFile(jsonBlob, `TrackInvest_Emergency_Backup_${new Date().toISOString().split('T')[0]}.json`);
        setTimeout(() => {
            downloadFile(csvBlob, `TrackInvest_Emergency_Backup_${new Date().toISOString().split('T')[0]}.csv`);
        }, 500);

        return {
            success: true,
            message: 'Emergency backup created (JSON + CSV)',
            formats: ['json', 'csv']
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

function estimateSpaceSaved(items) {
    // Rough estimate: 1 item ≈ 100 bytes
    return `${(items / 1024).toFixed(1)} KB`;
}

function downloadFile(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

function convertToCSV(investments) {
    const headers = ['Date', 'Type', 'Amount', 'Account', 'Note', 'Tags'];
    const rows = investments.map(inv => [
        inv.date || '',
        inv.type || '',
        inv.amount || 0,
        inv.account || '',
        inv.note || '',
        inv.tags || ''
    ]);

    return [headers, ...rows].map(row =>
        row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
    ).join('\n');
}

function showManualRecoveryDialog() {
    const modal = document.createElement('div');
    modal.className = 'recovery-modal';
    modal.innerHTML = `
        <div class="recovery-content">
            <h3>⚠️ Automatic Recovery Failed</h3>
            <p>Please try these manual steps:</p>
            <div class="recovery-steps">
                <div class="recovery-step">
                    <span class="step-number">1</span>
                    <span>Export your data manually</span>
                </div>
                <div class="recovery-step">
                    <span class="step-number">2</span>
                    <span>Clear browser storage</span>
                </div>
                <div class="recovery-step">
                    <span class="step-number">3</span>
                    <span>Import your backup</span>
                </div>
            </div>
            <div class="recovery-actions">
                <button onclick="exportManualBackup()">Export Now</button>
                <button onclick="showStorageInstructions()">Storage Help</button>
                <button onclick="closeRecoveryDialog()">Close</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
}

window.exportManualBackup = function () {
    createEmergencyBackup();
    closeRecoveryDialog();
};

window.showStorageInstructions = function () {
    showSnackbar('Check browser settings > Storage > Clear data', 'info');
    closeRecoveryDialog();
};

window.closeRecoveryDialog = function () {
    const modal = document.querySelector('.recovery-modal');
    if (modal) modal.remove();
};

// ENHANCED DATA SYNCHRONIZATION AND BACKUP SYSTEM
async function checkStorageQuota(sanitizedDb) {
    // Check storage quota asynchronously (non-blocking)
    if ('storage' in navigator && 'estimate' in navigator.storage) {
        try {
            const storageData = JSON.stringify(sanitizedDb);
            const estimatedSize = new Blob([storageData]).size;
            const quota = await navigator.storage.estimate();

            if (quota.usage && quota.quota) {
                const usagePercentage = (estimatedSize / quota.quota) * 100;
                if (usagePercentage > 90) {
                    console.warn(`Storage usage critical: ${usagePercentage.toFixed(1)}%`);
                    showSnackbar("Storage almost full. Auto-backup triggered.", "warning");
                    // Trigger automatic backup
                    await autoBackupData();
                }
            }
        } catch (quotaError) {
            console.warn('Storage quota check failed:', quotaError);
        }
    }
}

// Automatic backup system
async function autoBackupData() {
    try {
        const backupData = {
            version: '1.0',
            timestamp: new Date().toISOString(),
            data: db,
            checksum: await generateDataChecksum(db)
        };

        // Create backup file
        const backupBlob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
        const backupUrl = URL.createObjectURL(backupBlob);

        // Save to Downloads
        const a = document.createElement('a');
        a.href = backupUrl;
        a.download = `TrackInvest_AutoBackup_${new Date().toISOString().split('T')[0]}.json`;
        a.click();

        URL.revokeObjectURL(backupUrl);
        showSnackbar('Auto backup created', 'backup');

    } catch (error) {
        console.error('Auto backup failed:', error);
        showSnackbar('Auto backup failed', 'error');
    }
}

// Data integrity verification
async function generateDataChecksum(data) {
    const dataString = JSON.stringify(data);
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(dataString);

    if ('crypto' in window && 'subtle' in window.crypto) {
        const hashBuffer = await window.crypto.subtle.digest('SHA-256', dataBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } else {
        // Fallback for environments without Web Crypto
        let hash = 0;
        for (let i = 0; i < dataString.length; i++) {
            const char = dataString.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(16);
    }
}



function sanitizeDatabaseObject(dbObj) {
    const sanitized = JSON.parse(JSON.stringify(dbObj));

    // Remove potentially dangerous content
    // Note: 'ai' is accepted for backward compatibility with chat history
    // saved before the role was normalized to 'assistant'. The renderer treats
    // any non-'user' role as an AI/assistant bubble, so both values are safe.
    const allowedRoles = ['user', 'assistant', 'ai'];
    if (sanitized.chatHistory) {
        sanitized.chatHistory = sanitized.chatHistory.map(msg => ({
            ...msg,
            content: sanitizeText(msg.content || ''),
            role: allowedRoles.includes(msg.role) ? msg.role : 'user'
        }));
    }

    if (sanitized.chatSessions) {
        sanitized.chatSessions = sanitized.chatSessions.map(session => ({
            ...session,
            title: sanitizeText(session.title || ''),
            messages: (session.messages || []).map(msg => ({
                ...msg,
                content: sanitizeText(msg.content || ''),
                role: allowedRoles.includes(msg.role) ? msg.role : 'user'
            }))
        }));
    }

    // Sanitize user inputs
    if (sanitized.investments) {
        sanitized.investments = sanitized.investments.map(inv => ({
            ...inv,
            note: sanitizeText(inv.note || ''),
            tags: sanitizeText(inv.tags || '')
        }));
    }

    if (sanitized.goals) {
        sanitized.goals = sanitized.goals.map(goal => ({
            ...goal,
            name: sanitizeText(goal.name || '')
        }));
    }

    if (sanitized.recurring) {
        sanitized.recurring = sanitized.recurring.map(r => ({
            ...r,
            note: sanitizeText(r.note || ''),
            tags: sanitizeText(r.tags || ''),
            account: sanitizeText(r.account || '')
        }));
    }

    if (sanitized.templates) {
        sanitized.templates = sanitized.templates.map(t => ({
            ...t,
            note: sanitizeText(t.note || ''),
            tags: sanitizeText(t.tags || ''),
            account: sanitizeText(t.account || '')
        }));
    }

    if (sanitized.spendTracker && sanitized.spendTracker.entries) {
        sanitized.spendTracker.entries = sanitized.spendTracker.entries.map(e => ({
            ...e,
            comment: sanitizeText(e.comment || '')
        }));
    }

    return sanitized;
}

function sanitizeText(text) {
    if (typeof text !== 'string') return '';
    if (typeof DOMPurify !== 'undefined' && DOMPurify.sanitize) {
        return DOMPurify.sanitize(text, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] }).trim();
    }
    return text
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/javascript:/gi, '')
        .replace(/on\w+\s*=/gi, '')
        .replace(/<iframe\b[^>]*>/gi, '')
        .replace(/<object\b[^>]*>/gi, '')
        .replace(/<embed\b[^>]*>/gi, '')
        .replace(/<svg\b[^>]*>/gi, '')
        .replace(/<math\b[^>]*>/gi, '')
        .trim();
}

function isCurrentFY(dateStr) {
    let d = new Date(dateStr); let now = new Date(); let curYear = now.getFullYear(); let curMonth = now.getMonth();
    let fyStartMonth = db.fyStartMonth !== undefined ? db.fyStartMonth : 3; // Default April
    let fyEndMonth = (fyStartMonth + 11) % 12; // FY ends 11 months after start
    let fyStartYear = curMonth >= fyStartMonth ? curYear : curYear - 1;
    let fyStart = new Date(fyStartYear, fyStartMonth, 1);
    // FY ends in the month before the start month of the next FY
    // If FY starts in April (3), it ends in March (2) of next year
    // If FY starts in January (0), it ends in December (11) of same year
    let fyEndYear = fyEndMonth < fyStartMonth ? fyStartYear + 1 : fyStartYear;
    let fyEnd = new Date(fyEndYear, fyEndMonth + 1, 0, 23, 59, 59); // Last day of end month
    return d >= fyStart && d <= fyEnd;
}

// App Lock functions managed in Section 9

function savePin() {
    let p = document.getElementById('settings-pin').value;
    if (p.length === 4 && /^\d{4}$/.test(p)) { db.appPin = p; saveData(); showSnackbar("App Lock Enabled", "lock"); }
    else if (p.length === 4) { showSnackbar("PIN must be 4 digits (0-9)", "error"); }
    else if (p.length === 0) { db.appPin = ''; saveData(); showSnackbar("App Lock Disabled", "lock_open"); }
    else { showSnackbar("PIN must be 4 digits", "error"); }
}



function switchTab(tabId) {
    haptic(20); // Subtle feedback on tab switch
    if (!document.startViewTransition) {
        performTabSwitch(tabId);
        return;
    }
    document.startViewTransition(() => performTabSwitch(tabId));
}
window.switchTab = switchTab;

function performTabSwitch(tabId, fromPopState = false) {
    const currentTab = document.querySelector('.tab-content.active')?.id?.replace('tab-', '');
    if (currentTab === tabId) return;

    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    const targetTab = document.getElementById('tab-' + tabId);
    if (targetTab) targetTab.classList.add('active');

    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const targetNav = document.getElementById('nav-' + tabId);
    if (targetNav) targetNav.classList.add('active');

    window.scrollTo(0, 0);
    sessionStorage.setItem('activeTab', tabId);

    if (!fromPopState) {
        history.pushState({ tabId: tabId }, "");
    }

    renderAll();
    if (tabId === 'portfolio') renderDonutChart(currentTypeTotals, currentTotalNW);
    if (tabId === 'dashboard') { renderNWChart(); renderRollingChart(); }
    if (tabId !== 'portfolio') {
        const catChartCanvas = document.getElementById('categoryHistoryChart');
        if (catChartCanvas && categoryChartInstance) {
            categoryChartInstance.destroy();
            categoryChartInstance = null;
        }
    }
}

function togglePrivacy() {
    haptic(40); db.privacyMode = !db.privacyMode; saveData();
    const pi = document.getElementById('privacy-icon');
    if (pi) pi.innerText = db.privacyMode ? 'visibility_off' : 'visibility';
    renderAll();
    if (window.renderHistory) renderHistory();
}

function setTheme(themeName) {
    haptic(40); db.theme = themeName; saveData(); document.body.className = '';
    if (themeName !== 'indigo') document.body.classList.add('theme-' + themeName);
    document.querySelectorAll('.theme-swatch').forEach(s => s.classList.remove('active'));
    let activeSwatch = document.querySelector('.ts-' + themeName);
    if (activeSwatch) activeSwatch.classList.add('active');
    renderAll();
}

function setChartRange(months, el) {
    haptic(20);
    document.querySelectorAll('.chart-chip').forEach(c => c.classList.remove('active'));
    el.classList.add('active');
    chartMonthsRange = months;
    renderNWChart();
    renderRollingChart();
}

function updateProjectionSlider() {
    let slider = document.getElementById('proj-slider'); if (!slider) return;
    let months = parseInt(slider.value, 10) || 12;
    let lbl = document.getElementById('proj-month-label'); if (lbl) lbl.innerText = months;

    let projected = currentTotalNW + (currentAvgMonthly * months);
    let conservative = currentTotalNW + (currentAvgMonthly * 0.7 * months);
    let optimistic = currentTotalNW + (currentAvgMonthly * 1.4 * months);

    let eoy = document.getElementById('projected-eoy'); if (eoy) eoy.innerText = formatMoney(projected);
    let cons = document.getElementById('proj-conservative'); if (cons) cons.innerText = formatMoney(conservative);
    let opti = document.getElementById('proj-optimistic'); if (opti) opti.innerText = formatMoney(optimistic);
    let avg = document.getElementById('proj-monthly-avg'); if (avg) avg.innerText = formatMoney(currentAvgMonthly);
}

window.fireMilestoneConfetti = function () {
    haptic([50, 100, 50, 100]);
    if (typeof confetti !== 'undefined') {
        confetti({ zIndex: 99999, particleCount: 150, spread: 70, origin: { y: 0.6 }, colors: ['#4559A4', '#186D33', '#BF360C', '#FFD700'] });
    }
};

function getThemeColor() {
    const root = getComputedStyle(document.body);
    return root.getPropertyValue('--md-primary').trim() || '#4559A4';
}

function checkMilestones(nw) {
    let unlocked = false;
    const sym = db.currency && db.currency !== 'INR' ? (db.currencySymbol || db.currency + ' ') : '₹';
    milestoneThresholds.forEach(t => {
        if (nw >= t.val && !isMilestoneUnlocked(t.val)) {
            db.milestones.push({ val: t.val, date: new Date().toISOString() });
            unlocked = true;
            showSnackbar(`Milestone Unlocked: ${sym}${t.label}! 🎉`, "workspace_premium");
        }
    });
    if (unlocked) { saveData(); window.fireMilestoneConfetti(); }
}

window.openMonthlyTargetSheet = function () {
    haptic(30);
    document.getElementById('monthly-target-amt').value = db.monthlyInvestmentTarget || '';
    openSubSheet('monthly-target-sheet');
};

window.saveMonthlyTarget = function () {
    const amt = parseFloat(document.getElementById('monthly-target-amt').value) || 0;
    db.monthlyInvestmentTarget = amt;
    saveData(); closeOverlays(); renderAll(); showSnackbar("Monthly Target Saved");
};

window.openProjectionSheet = function () {
    haptic(30);
    document.getElementById('proj-amt').value = db.projectionNextMonth || 0;
    openSubSheet('projection-sheet');
};

window.saveProjection = function () {
    haptic(40);
    db.projectionNextMonth = parseFloat(document.getElementById('proj-amt').value) || 0;
    saveData(); closeOverlays(); renderAll(); showSnackbar("Target Updated");
};

function initUI() {
    // Initialize base history state if missing
    const savedTab = sessionStorage.getItem('activeTab') || 'dashboard';
    if (!history.state) {
        history.replaceState({ tabId: savedTab }, "");
    }
    const php = document.getElementById('privacy-icon');
    if (php) php.innerText = db.privacyMode ? 'visibility_off' : 'visibility';
    setTheme(db.theme || 'indigo');

    window.activeAccountFilter = db.activeAccountFilter || 'All';

    let formSel = document.getElementById('inv-account');
    if (formSel) { formSel.innerHTML = ""; }
    db.accounts.forEach(a => { if (formSel) formSel.insertAdjacentHTML('beforeend', `<option value="${escapeHtml(a)}">${escapeHtml(a)}</option>`); });

    let chips = document.getElementById('type-chips');
    if (chips) { chips.innerHTML = ""; }
    let filterType = document.getElementById('ledger-filter-type');
    if (filterType) filterType.innerHTML = `<option value="All">All Assets</option>`;
    Object.keys(db.categories).forEach(c => {
        let safeC = escapeHtml(c);
        if (chips) chips.insertAdjacentHTML('beforeend', `<div class="quick-chip" onclick="setInvestType(this.dataset.cat)" data-cat="${safeC}">${safeC}</div>`);
        if (filterType) filterType.insertAdjacentHTML('beforeend', `<option value="${safeC}">${safeC}</option>`);
    });
    window.currentInvType = Object.keys(db.categories)[0];
    setInvestType(window.currentInvType);

    let gl = document.getElementById('goal-link');
    if (gl) { gl.innerHTML = `<option value="">None (Manual Tracking)</option>`; }
    Object.keys(db.categories).forEach(c => { if (gl) gl.insertAdjacentHTML('beforeend', `<option value="${escapeHtml(c)}">Link to ${escapeHtml(c)}</option>`); });
    initChartInteractivity();

    // Restore active tab and sheet
    if (savedTab) performTabSwitch(savedTab, true);

    const savedSheet = sessionStorage.getItem('currentSheet');
    if (savedSheet) {
        // Delay slightly to ensure DOM is ready and charts rendered
        setTimeout(() => {
            if (sessionStorage.getItem('appUnlocked') === 'true' || !db.appPin) {
                openSheet(savedSheet, true);
            }
        }, 100);
    }
}

// getThemeColor defined above (removed duplicate)

// --- Mobile Swipe to Close Sheets ---
let touchStartY = 0;
let touchStartX = 0;
let canSwipeClose = false;

document.addEventListener('touchstart', e => {
    const activeSheet = document.querySelector('.sheet.active');
    if (!activeSheet) {
        canSwipeClose = false;
        return;
    }

    // Prevent conflicts with AI bubble touch events
    if (e.target.closest('#ai-floating-bubble') || e.target.closest('.ai-bubble-popup')) {
        canSwipeClose = false;
        return;
    }

    touchStartY = e.touches[0].clientY;
    touchStartX = e.touches[0].clientX;

    // Only allow swipe-to-close if we are at very top of sheet content
    // and touch started on drag-handle or very top area (30px)
    const isAtTop = activeSheet.scrollTop <= 0;
    const rect = activeSheet.getBoundingClientRect();
    const isTopArea = (touchStartY - rect.top) < 30;
    const isDragHandle = e.target.classList.contains('drag-handle') || e.target.closest('.drag-handle');

    canSwipeClose = isAtTop && (isTopArea || isDragHandle);
}, { passive: true });

document.addEventListener('touchmove', e => {
    if (!canSwipeClose) return;

    const touchY = e.touches[0].clientY;
    const touchX = e.touches[0].clientX;
    const diffY = touchY - touchStartY;
    const diffX = touchX - touchStartX;
    const activeSheet = document.querySelector('.sheet.active');

    // Threshold: 120px downward (deliberate swipe), and primarily vertical (at least 3x vertical vs horizontal)
    if (activeSheet && diffY > 120 && Math.abs(diffY) > Math.abs(diffX) * 3) {
        haptic(15);
        if (activeSheet.classList.contains('sub-sheet')) {
            closeSubSheet();
        } else {
            closeOverlays();
        }
        canSwipeClose = false; // Prevent double trigger
    }
}, { passive: true });

// --- Scroll to Top Button ---
let scrollToTopBtn = null;

function initScrollToTop() {
    scrollToTopBtn = document.createElement('button');
    scrollToTopBtn.id = 'scroll-to-top';
    scrollToTopBtn.innerHTML = '<span class="material-symbols-rounded">arrow_upward</span>';
    scrollToTopBtn.style.cssText = `
        position: fixed; bottom: 170px; right: 16px;
        width: 48px; height: 48px; border-radius: 50%;
        background: var(--md-primary); color: var(--md-on-primary);
        border: none; cursor: pointer; z-index: 1000;
        display: none; align-items: center; justify-content: center;
        box-shadow: var(--md-elevation-2);
        transition: transform 0.2s, opacity 0.2s;
    `;
    scrollToTopBtn.onclick = () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        if (document.querySelector('.sheet.active')) {
            document.querySelector('.sheet.active').scrollTo({ top: 0, behavior: 'smooth' });
        }
    };
    document.body.appendChild(scrollToTopBtn);

    // Show/hide based on scroll
    let scrollTimeout;
    window.addEventListener('scroll', () => {
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => {
            const showBtn = window.scrollY > 300 ||
                (document.querySelector('.sheet.active')?.scrollTop > 300);
            scrollToTopBtn.style.display = showBtn ? 'flex' : 'none';
            scrollToTopBtn.style.opacity = showBtn ? '1' : '0';
        }, 100);
    }, { passive: true });
}

// ==========================================
// 3. STRICT CALCULATORS & VALUATION ENGINE
// ==========================================
function calculateStrictTax(tax80c = null) {
    let sal = parseFloat(db.userProfile.salary) || 0;
    // Validate salary is non-negative
    if (sal < 0) sal = 0;
    if (sal === 0) return { liability: 0, str: "Setup Income in Settings" };

    let regime = db.userProfile.regime || 'new';
    let tax = 0;

    // Use passed tax80c, fallback to global currentTax80c, then 0
    let deduction80c = tax80c !== null ? tax80c : (typeof currentTax80c !== 'undefined' ? currentTax80c : 0);

    if (regime === 'new') {
        // New Regime FY 2024-25 (Standard Deduction 75k + Rebate up to ₹12L + Surcharge above 50L)
        let taxable = Math.max(0, sal - 75000);
        let taxBeforeRebate = 0;
        // Progressive slabs
        // 0-3L: 0%
        if (taxable > 300000) {
            let slab = Math.min(taxable - 300000, 300000);
            taxBeforeRebate += slab * 0.05;
        }
        // 6-9L: 10%
        if (taxable > 600000) {
            let slab = Math.min(taxable - 600000, 300000);
            taxBeforeRebate += slab * 0.10;
        }
        // 9-12L: 15%
        if (taxable > 900000) {
            let slab = Math.min(taxable - 900000, 300000);
            taxBeforeRebate += slab * 0.15;
        }
        // 12-15L: 20%
        if (taxable > 1200000) {
            let slab = Math.min(taxable - 1200000, 300000);
            taxBeforeRebate += slab * 0.20;
        }
        // >15L: 30%
        if (taxable > 1500000) {
            taxBeforeRebate += (taxable - 1500000) * 0.30;
        }
        // Section 87A rebate: if total income (after standard deduction) <= 12L, tax is nil
        if (taxable <= 1200000) return { liability: 0, str: "Tax Free (Rebate Limit)" };
        // Rebate is limited to tax amount, so if income exceeds 12L, marginal relief may apply
        // For simplicity, no marginal relief — standard progressive calculation
        tax = taxBeforeRebate;
    } else {
        // Old Regime (Standard Deduction 50k + 80C up to 1.5L + Rebate 87A up to ₹5L)
        let taxable = Math.max(0, sal - 50000 - Math.min(deduction80c, 150000));
        // 0-2.5L: nil
        // 2.5-5L: 5%
        let taxBeforeRebate = 0;
        if (taxable > 250000) {
            let slab = Math.min(taxable - 250000, 250000);
            taxBeforeRebate += slab * 0.05;
        }
        // 5-10L: 20%
        if (taxable > 500000) {
            let slab = Math.min(taxable - 500000, 500000);
            taxBeforeRebate += slab * 0.20;
        }
        // >10L: 30%
        if (taxable > 1000000) {
            taxBeforeRebate += (taxable - 1000000) * 0.30;
        }
        if (taxable <= 500000) return { liability: 0, str: "Tax Free (Rebate 87A)" };
        tax = taxBeforeRebate;
    }

    tax = tax * 1.04; // 4% Health & Education Cess
    return { liability: tax, str: `₹${fmtNum(tax)}` };
}

function calculateStrictValuation(type, totalInvested, rawInvs) {
    const govRates = { 'PPF': 7.1, 'PF': 8.15 };
    const defaultRate = db.categoryDetails[type]?.interestRate || govRates[type] || 0;
    let interestEarned = 0;

    // Helper to get virtual investments including initial balance
    const getEffectiveInvs = () => {
        let invs = [...rawInvs];
        let initialBal = db.categoryDetails[type]?.initialBal || 0;
        if (initialBal > 0) {
            // Use a date BEFORE the earliest investment so initial balance accrues interest from the start
            let earliest = invs.reduce((min, i) => i.date < min ? i.date : min, invs[0]?.date || '2023-01-01');
            let earlyDate = new Date(earliest);
            earlyDate.setDate(earlyDate.getDate() - 1);
            let earlyStr = earlyDate.getFullYear() + '-' + String(earlyDate.getMonth() + 1).padStart(2, '0') + '-' + String(earlyDate.getDate()).padStart(2, '0');
            invs.push({ date: earlyStr, amount: initialBal, note: 'Initial Balance' });
        }
        return invs;
    };

    if (type === 'FD') {
        let val = 0;
        getEffectiveInvs().forEach(inv => {
            let rate = inv.interestRate || defaultRate;
            let payout = inv.payoutType || 'quarterly';
            let years = Math.max(0, (new Date() - parseDate(inv.date)) / (1000 * 60 * 60 * 24 * 365.25));
            let principal = inv.amount;
            let futureVal = principal;

            if (payout === 'quarterly') {
                futureVal = principal * Math.pow(1 + (rate / 100) / 4, 4 * years);
            } else if (payout === 'monthly') {
                futureVal = principal * Math.pow(1 + (rate / 100) / 12, 12 * years);
            } else {
                futureVal = principal * (1 + (rate / 100) * years);
            }
            val += futureVal;
            interestEarned += (futureVal - principal);
        });
        return { total: val, interest: interestEarned };
    }

    if (type === 'PF' || type === 'PPF') {
        let val = 0;
        getEffectiveInvs().forEach(inv => {
            // PPF/PF: Interest calculated monthly, credited annually
            // Using monthly compounding for accurate valuation
            let years = Math.max(0, (new Date() - parseDate(inv.date)) / (1000 * 60 * 60 * 24 * 365.25));
            let monthlyRate = (defaultRate / 100) / 12;
            let months = years * 12;
            let futureVal = inv.amount * Math.pow(1 + monthlyRate, months);
            val += futureVal;
            interestEarned += (futureVal - inv.amount);
        });
        return { total: val, interest: interestEarned };
    }

    if ((type === 'SIP' || type === 'Stocks') && db.navCache) {
        let val = 0; let hasUnits = false; let staleNavCount = 0;
        const oneDayMs = 24 * 60 * 60 * 1000;
        const today = new Date();
        rawInvs.forEach(inv => {
            if (inv.units && inv.mfCode && db.navCache[inv.mfCode]) {
                let navData = db.navCache[inv.mfCode];
                // Check if NAV is stale (> 1 day old)
                let navDate = navData.lastFetched ? new Date(navData.lastFetched) : new Date(navData.date);
                let isStale = (today - navDate) > oneDayMs;
                if (isStale) staleNavCount++;

                let currentVal = inv.units * navData.nav;
                val += currentVal;
                interestEarned += (currentVal - inv.amount);
                hasUnits = true;
            } else {
                val += inv.amount;
            }
        });
        // Add initial balance to value if units are not being used for it
        val += (db.categoryDetails[type]?.initialBal || 0);
        // Warn about stale NAV data
        if (staleNavCount > 0 && !window.navStaleWarningShown) {
            window.navStaleWarningShown = true;
            setTimeout(() => { window.navStaleWarningShown = false; }, 60000); // Reset after 1 minute
            showSnackbar(`${staleNavCount} NAV values may be outdated. Refresh for latest.`, 'warning');
        }
        return { total: val, interest: interestEarned };
    }

    let customRate = db.categoryDetails[type]?.interestRate || 0;
    if (customRate > 0) {
        let val = 0;
        getEffectiveInvs().forEach(inv => {
            let rate = inv.interestRate || customRate;
            let years = Math.max(0, (new Date() - parseDate(inv.date)) / (1000 * 60 * 60 * 24 * 365.25));
            let futureVal = inv.amount * Math.pow(1 + (rate / 100) / 12, 12 * years);
            val += futureVal;
            interestEarned += (futureVal - inv.amount);
        });
        return { total: val, interest: interestEarned };
    }

    return { total: totalInvested, interest: 0 };
}

// ==========================================
// 4. CHARTS AND VISUALIZATIONS
// ==========================================
function initChartInteractivity() {
    let container = document.getElementById('nw-chart-container');
    let tooltip = document.getElementById('chart-tooltip');
    let point = document.getElementById('chart-point');
    if (!container || container.dataset.chartInit) return;
    container.dataset.chartInit = '1';

    function handleMove(e) {
        if (chartDataPoints.length === 0 || db.privacyMode) return;
        let rect = container.getBoundingClientRect();
        let clientX = e.touches ? e.touches[0].clientX : e.clientX;
        let x = clientX - rect.left;
        let perc = Math.max(0, Math.min(100, (x / rect.width) * 100));

        let closest = chartDataPoints[0];
        let minDiff = Infinity;
        chartDataPoints.forEach(p => {
            let diff = Math.abs(p.x - perc);
            if (diff < minDiff) { minDiff = diff; closest = p; }
        });

        tooltip.innerText = closest.label + ": " + formatMoney(closest.val);
        tooltip.style.display = 'block';
        tooltip.style.left = closest.x + '%';

        point.style.display = 'block';
        point.style.left = closest.x + '%';
        point.style.top = closest.y + 'px';

        if (container.dataset.lastIdx != closest.idx) { haptic(10); container.dataset.lastIdx = closest.idx; }
    }
    container.addEventListener('touchstart', handleMove, { passive: true });
    container.addEventListener('touchmove', handleMove, { passive: true });
    container.addEventListener('touchend', () => { tooltip.style.display = 'none'; point.style.display = 'none'; });
    container.addEventListener('mousemove', handleMove, { passive: true });
    container.addEventListener('mouseleave', () => { tooltip.style.display = 'none'; point.style.display = 'none'; });
}

function getBezierPath(points) {
    if (points.length === 0) return "";
    let path = `M ${points[0].x} ${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
        let xMid = (points[i].x + points[i + 1].x) / 2;
        path += ` C ${xMid} ${points[i].y}, ${xMid} ${points[i + 1].y}, ${points[i + 1].x} ${points[i + 1].y}`;
    }
    return path;
}

function renderNWChart() {
    try {
        let now = new Date(); chartDataPoints = []; let maxVal = 0; let minVal = Infinity;
        let currentTempNW = currentTotalNW; let monthsToIterate = chartMonthsRange === 99 ? 24 : chartMonthsRange;
        let monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

        let chartLine = document.getElementById('chart-line-path');
        let chartFill = document.getElementById('chart-fill-path');
        if (!chartLine || !chartFill) return;

        chartLine.classList.remove('chart-animate'); void chartLine.offsetWidth; chartLine.classList.add('chart-animate');

        for (let i = 0; i < monthsToIterate; i++) {
            let m = now.getMonth() - i; let y = now.getFullYear();
            while (m < 0) { m += 12; y -= 1; }

            let monthInv = db.investments.filter(inv => {
                let d = new Date(inv.date);
                return d.getMonth() === m && d.getFullYear() === y && (activeAccountFilter === 'All' || inv.account === activeAccountFilter);
            }).reduce((sum, inv) => sum + inv.amount, 0);

            chartDataPoints.unshift({ val: currentTempNW, label: `${monthNames[m]} ${y}`, idx: i });
            if (currentTempNW > maxVal) maxVal = currentTempNW;
            if (currentTempNW < minVal) minVal = currentTempNW;
            currentTempNW -= monthInv;
        }

        let width = 100; let height = 40; if (maxVal === minVal) maxVal += 1;
        chartDataPoints.forEach((p, idx) => {
            let divisor = Math.max(1, monthsToIterate - 1);
            p.x = (idx / divisor) * width;
            p.y = height - (((p.val - minVal) / (maxVal - minVal)) * (height - 5)) - 5;
        });

        let bezierPath = getBezierPath(chartDataPoints);
        let fillPath = `${bezierPath} L100 ${height} L0 ${height} Z`;
        chartFill.setAttribute('d', fillPath); chartLine.setAttribute('d', bezierPath);

        // Update chart labels
        let len = chartDataPoints.length;
        let lblStart = document.getElementById('chart-label-start');
        let lblMid = document.getElementById('chart-label-mid');
        let lblEnd = document.getElementById('chart-label-end');
        if (lblStart && len > 0) lblStart.textContent = chartDataPoints[0].label;
        if (lblMid && len > 2) lblMid.textContent = chartDataPoints[Math.floor(len / 2)].label;
        if (lblEnd && len > 1) lblEnd.textContent = chartDataPoints[len - 1].label;
    } catch (e) { }
}

function renderDonutChart(typeTotals, totalMarketValue) {
    let canvas = document.getElementById('portfolioChart');
    if (!canvas) return;

    let ctx = canvas.getContext('2d');
    let labels = []; let data = []; let bgColors = [];

    Object.keys(typeTotals).forEach(t => {
        let value = db.currentMarketValues[t] && db.currentMarketValues[t] > 0 ? db.currentMarketValues[t] : typeTotals[t];
        if (value > 0) { labels.push(t); data.push(value); bgColors.push(db.categories[t]?.color || '#ccc'); }
    });

    if (labels.length === 0) { labels = ["Empty"]; data = [1]; bgColors = ["var(--md-surface-container-highest)"]; }
    const displayData = db.privacyMode ? data.map(() => 1) : data;

    // Check if we can reuse the existing chart
    let cacheKey = generateChartCacheKey('donut');
    let canUpdate = portfolioChartInstance &&
        chartDataCache.donut.key === cacheKey &&
        portfolioChartInstance.data.labels.length === labels.length;

    if (canUpdate) {
        // Smooth update existing chart data
        portfolioChartInstance.data.datasets[0].data = displayData;
        portfolioChartInstance.update('none'); // 'none' mode for smooth transition
    } else {
        // Create new chart only when necessary
        if (portfolioChartInstance) portfolioChartInstance.destroy();
        portfolioChartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: { labels: labels, datasets: [{ data: displayData, backgroundColor: bgColors, borderWidth: 0, hoverOffset: 6 }] },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '75%',
                animation: { duration: 800 },
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: function (c) { return db.privacyMode ? '••••••' : '₹' + Number(c.raw).toLocaleString('en-IN'); } } }
                }
            }
        });
        // Update cache
        chartDataCache.donut = { key: cacheKey, data: displayData, labels: labels, colors: bgColors };
    }

    document.getElementById('donut-val').innerText = formatMoney(totalMarketValue);
}

Chart.register({
    id: 'barValueLabels',
    afterDraw: function(chart) {
        if (chart.canvas.id !== 'rollingChart' || db.privacyMode) return;
        let meta = chart.getDatasetMeta(0);
        if (!meta || !meta.data) return;
        let ctx = chart.ctx;
        let textColor = getComputedStyle(document.documentElement).getPropertyValue('--md-on-surface').trim() || '#E6E1E5';
        ctx.save();
        ctx.font = '9px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        meta.data.forEach(function(bar, i) {
            let val = chart.data.datasets[0].data[i];
            if (val === 0) return;
            ctx.fillStyle = textColor;
            ctx.fillText('₹' + Number(val).toLocaleString('en-IN'), bar.x, bar.y - 5);
        });
        ctx.restore();
    }
});

function renderRollingChart() {
    let canvas = document.getElementById('rollingChart');
    if (!canvas) return;

    let ctx = canvas.getContext('2d');
    let now = new Date(); let chartLabels = []; let chartData = [];
    for (let i = 11; i >= 0; i--) {
        let m = now.getMonth() - i; let y = now.getFullYear(); while (m < 0) { m += 12; y -= 1; }
        let monthInv = db.investments.filter(inv => { let d = new Date(inv.date); return d.getMonth() === m && d.getFullYear() === y && (activeAccountFilter === 'All' || inv.account === activeAccountFilter); }).reduce((sum, inv) => sum + inv.amount, 0);
        chartLabels.push(`${new Date(y, m).toLocaleString('default', { month: 'short' })} ${y}`); chartData.push(monthInv);
    }

    const displayData = db.privacyMode ? chartData.map(() => 1) : chartData;

    // Check cache
    let cacheKey = generateChartCacheKey('rolling');
    let canUpdate = rollingChartInstance && chartDataCache.rolling.key === cacheKey;

    if (canUpdate) {
        // Update existing chart
        rollingChartInstance.data.datasets[0].data = displayData;
        rollingChartInstance.options.scales.y.display = !db.privacyMode;
        rollingChartInstance.update('none');
    } else {
        // Create new chart
        if (rollingChartInstance) rollingChartInstance.destroy();
        rollingChartInstance = new Chart(ctx, {
            type: 'bar',
            data: { labels: chartLabels, datasets: [{ label: 'Monthly Investment', data: displayData, backgroundColor: getThemeColor() + '80', borderRadius: 8 }] },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 600 },
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: function (c) { return db.privacyMode ? '••••••' : '₹' + Number(c.raw).toLocaleString('en-IN'); } } }
                },
                scales: { x: { display: true, ticks: { font: { size: 10 }, maxRotation: 90 } }, y: { display: !db.privacyMode, ticks: { callback: (v) => formatMoney(v) } } },
                onClick: (e, active) => {
                    if (active.length > 0) {
                        let idx = active[0].dataIndex;
                        let label = chartLabels[idx];
                        let raw = chartData[idx];
                        showMonthDetailSheet(label, raw, idx);
                    }
                }
            }
        });
        chartDataCache.rolling = { key: cacheKey, data: displayData, labels: chartLabels };
    }
}

function showMonthDetailSheet(label, totalAmt, idx) {
    let now = new Date();
    let monthsAgo = 11 - idx;
    let m = now.getMonth() - monthsAgo;
    let y = now.getFullYear();
    while (m < 0) { m += 12; y -= 1; }

    let entries = db.investments.filter(inv => {
        let d = new Date(inv.date);
        return d.getMonth() === m && d.getFullYear() === y && (activeAccountFilter === 'All' || inv.account === activeAccountFilter);
    });

    let html = `<div style="padding:4px 0;">
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:16px;">
            <div style="font-size:18px;font-weight:600;">${label}</div>
            <div style="font-size:14px;color:var(--md-on-surface-variant);">Total: <span style="font-weight:600;color:var(--md-primary);">${formatMoney(totalAmt)}</span></div>
        </div>`;

    if (entries.length === 0) {
        html += `<div style="text-align:center;padding:24px;opacity:0.5;font-size:13px;">No investments this month</div>`;
    } else {
        entries.forEach(e => {
            let cat = db.categories[e.type] || { color: '#8D6E63', icon: 'savings' };
            html += `<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--md-outline-variant);">
                <div style="width:36px;height:36px;border-radius:10px;background:${cat.color}20;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                    <span class="material-symbols-rounded" style="font-size:18px;color:${cat.color};">${cat.icon}</span>
                </div>
                <div style="flex:1;min-width:0;">
                    <div style="font-size:13px;font-weight:500;">${escapeHtml(cat.name || e.type)}</div>
                    <div style="font-size:11px;color:var(--md-outline);">${e.note ? escapeHtml(e.note) : '—'}</div>
                </div>
                <div style="font-size:14px;font-weight:600;color:var(--md-primary);">${formatMoney(e.amount)}</div>
            </div>`;
        });
    }
    html += `</div>`;

    let sheet = document.getElementById('month-detail-sheet');
    let body = document.getElementById('month-detail-body');
    let scrim = document.getElementById('month-detail-scrim');
    if (!sheet || !body) return;
    body.innerHTML = html;
    sheet.classList.add('open');
    if (scrim) scrim.classList.add('open');
}

function renderCategoryChart(category) {
    let canvas = document.getElementById('categoryHistoryChart');
    if (!canvas) return;
    let ctx = canvas.getContext('2d');

    let now = new Date(); let chartLabels = []; let chartData = [];
    for (let i = 5; i >= 0; i--) {
        let m = now.getMonth() - i; let y = now.getFullYear(); while (m < 0) { m += 12; y -= 1; }
        let monthInv = db.investments.filter(inv => { let d = new Date(inv.date); return inv.type === category && d.getMonth() === m && d.getFullYear() === y; }).reduce((sum, inv) => sum + inv.amount, 0);
        chartLabels.push(`${new Date(y, m).toLocaleString('default', { month: 'short' })}`); chartData.push(monthInv);
    }

    const displayData = db.privacyMode ? chartData.map(() => 1) : chartData;
    let color = db.categories[category]?.color || getThemeColor();

    // Check cache
    let cacheKey = generateChartCacheKey('category');
    let canUpdate = categoryChartInstance &&
        chartDataCache.category.key === cacheKey &&
        chartDataCache.category.category === category;

    if (canUpdate) {
        // Smooth update
        categoryChartInstance.data.datasets[0].data = displayData;
        categoryChartInstance.update('none');
    } else {
        // Create new chart
        if (categoryChartInstance) categoryChartInstance.destroy();
        categoryChartInstance = new Chart(ctx, {
            type: 'line',
            data: { labels: chartLabels, datasets: [{ label: category, data: displayData, borderColor: color, backgroundColor: color + '33', fill: true, tension: 0.4 }] },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 500 },
                plugins: { legend: { display: false } },
                scales: { x: { display: true, ticks: { font: { size: 10 } } }, y: { display: false } }
            }
        });
        chartDataCache.category = { key: cacheKey, data: displayData, labels: chartLabels, category: category };
    }
}

let heatmapMonth = new Date().getMonth();
let heatmapYear = new Date().getFullYear();

function renderHeatmap() {
    let heatmapGrid = document.getElementById('heatmap-grid');
    if (!heatmapGrid) return;

    let month = heatmapMonth, year = heatmapYear;
    let now = new Date();
    let firstDay = new Date(year, month, 1).getDay();
    let daysInMonth = new Date(year, month + 1, 0).getDate();

    let titleEl = document.getElementById('heatmap-month-title');
    if (titleEl) {
        let label = new Date(year, month).toLocaleString('default', { month: 'long', year: 'numeric' });
        titleEl.innerText = label;
    }

    // Disable prev/next at boundaries
    let prevBtn = document.getElementById('heatmap-prev');
    let nextBtn = document.getElementById('heatmap-next');
    if (prevBtn) prevBtn.style.opacity = '1';
    if (nextBtn) {
        let isFuture = (year > now.getFullYear() || (year === now.getFullYear() && month > now.getMonth()));
        nextBtn.style.opacity = isFuture ? '0.3' : '1';
    }

    // ── Invest past map ──
    let investMap = {};
    db.investments.forEach(inv => {
        if (activeAccountFilter === 'All' || inv.account === activeAccountFilter) {
            investMap[inv.date] = (investMap[inv.date] || 0) + inv.amount;
        }
    });

    // ── Future SIP map ──
    let futureMap = {};
    db.recurring.forEach(rec => {
        let nextD = new Date(rec.nextRun);
        if (nextD.getMonth() === month && nextD.getFullYear() === year) {
            let dStr = getLocalYYYYMMDD(nextD);
            if (window.activeAccountFilter === 'All' || rec.account === window.activeAccountFilter) {
                futureMap[dStr] = (futureMap[dStr] || 0) + rec.amount;
            }
        }
    });

    // ── Spend map ──
    let spendMap = {};
    if (db.spendTracker && db.spendTracker.entries) {
        db.spendTracker.entries.forEach(e => {
            let d = new Date(e.date);
            if (d.getMonth() === month && d.getFullYear() === year) {
                let dStr = getLocalYYYYMMDD(d);
                spendMap[dStr] = (spendMap[dStr] || 0) + (e.amount||0);
            }
        });
    }

    function intensityClass(base, amt) {
        if (amt <= 0) return '';
        if (amt < 500) return base + '-light';
        if (amt < 5000) return base + '-mid';
        return base;
    }

    function fmtAmt(amt) {
        return '₹' + Math.round(amt).toLocaleString('en-IN');
    }

    let html = `
        <div class="heatmap-header">
            <div>S</div><div>M</div><div>T</div><div>W</div><div>T</div><div>F</div><div>S</div>
        </div>
        <div class="heatmap-body">`;

    for (let i = 0; i < firstDay; i++) html += '<div></div>';

    let isCurrentMonth = (month === now.getMonth() && year === now.getFullYear());

    for (let d = 1; d <= daysInMonth; d++) {
        let cellDate = new Date(year, month, d);
        let dStr = getLocalYYYYMMDD(cellDate);

        let invAmt = investMap[dStr] || 0;
        let futAmt = futureMap[dStr] || 0;
        let spdAmt = spendMap[dStr] || 0;

        let cls = 'heatmap-cell-cal';
        let hasData = false;
        let tooltip = '';

        // Priority: invest > spend > future (show the most significant)
        if (invAmt > 0 && futAmt > 0) {
            cls += ' ' + intensityClass('active-past', invAmt);
            hasData = true;
            tooltip = `Invest: ${fmtAmt(invAmt)} | SIP: ${fmtAmt(futAmt)}`;
        } else if (invAmt > 0) {
            cls += ' ' + intensityClass('active-past', invAmt);
            hasData = true;
            tooltip = `Invest: ${fmtAmt(invAmt)}`;
        } else if (spdAmt > 0) {
            cls += ' ' + intensityClass('active-spend', spdAmt);
            hasData = true;
            tooltip = `Spent: ${fmtAmt(spdAmt)}`;
        } else if (futAmt > 0) {
            cls += ' ' + intensityClass('active-future', futAmt);
            hasData = true;
            tooltip = `SIP: ${fmtAmt(futAmt)}`;
        }

        if (isCurrentMonth && d === now.getDate()) cls += ' today-border';

        let onclick = hasData ? `onclick="showDayDetails('${dStr}')"` : '';
        html += `<div class="${cls}" title="${tooltip}" ${onclick}>${d}</div>`;
    }
    html += '</div>';

    let legends = [
        { cls: 'active-past', label: 'Invest' },
        { cls: 'active-past-mid', label: ' ' },
        { cls: 'active-past-light', label: ' ' },
        { cls: 'active-spend', label: 'Spend' },
        { cls: 'active-spend-mid', label: ' ' },
        { cls: 'active-spend-light', label: ' ' },
        { cls: 'active-future', label: 'SIP' },
        { cls: 'active-future-mid', label: ' ' },
        { cls: 'active-future-light', label: ' ' },
    ];

    html += `<div class="heatmap-legends">`;
    html += `<div><div class="dot" style="background:var(--md-primary);"></div> Invest <div class="row"><div class="labs"><span>₹500</span><span>₹5K</span></div></div></div>`;
    html += `<div><div class="dot" style="background:var(--md-tertiary);"></div> Spend</div>`;
    html += `<div><div class="dot" style="background:#D96200;"></div> SIP <div class="row"><div class="labs"><span>₹500</span><span>₹5K</span></div></div></div>`;
    html += `</div>`;

    heatmapGrid.innerHTML = html;
}

function shiftHeatmapMonth(delta) {
    heatmapMonth += delta;
    if (heatmapMonth > 11) { heatmapMonth = 0; heatmapYear++; }
    if (heatmapMonth < 0) { heatmapMonth = 11; heatmapYear--; }
    renderHeatmap();
}

function showDayDetails(dateStr) {
    haptic(20);
    let dObj = new Date(dateStr);
    let displayDate = `${dObj.getDate()} ${dObj.toLocaleString('default', { month: 'short' })} ${dObj.getFullYear()}`;

    let pastInvs = db.investments.filter(inv => inv.date === dateStr && (activeAccountFilter === 'All' || inv.account === activeAccountFilter));
    let futSips = db.recurring.filter(rec => {
        let nextD = new Date(rec.nextRun);
        return getLocalYYYYMMDD(nextD) === dateStr && (activeAccountFilter === 'All' || rec.account === activeAccountFilter);
    });

    let spends = [];
    if (db.spendTracker && db.spendTracker.entries) {
        spends = db.spendTracker.entries.filter(e => {
            let d = new Date(e.date);
            return getLocalYYYYMMDD(d) === dateStr;
        });
    }

    let html = '<div style="text-align:left;">';

    if (pastInvs.length > 0) {
        html += `<div style="font-size:13px;font-weight:700;color:var(--md-primary);margin-bottom:8px;">💰 Investments</div>`;
        pastInvs.forEach(i => {
            html += `<div style="display:flex;justify-content:space-between;margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid var(--md-surface-container-highest);">
                <div><div style="font-weight:500;">${escapeHtml(i.type)}</div><div style="font-size:12px;color:var(--md-outline);">${escapeHtml(i.note || '')}</div></div>
                <div style="font-weight:600;color:var(--md-on-surface);">+${formatMoney(i.amount)}</div>
            </div>`;
        });
    }

    if (futSips.length > 0) {
        if (pastInvs.length > 0) html += '<br>';
        html += `<div style="font-size:13px;font-weight:700;color:#D96200;margin-bottom:8px;">📅 Scheduled SIPs</div>`;
        futSips.forEach(r => {
            html += `<div style="display:flex;justify-content:space-between;margin-bottom:8px;padding-bottom:8px;border-bottom:1px dashed var(--md-surface-container-highest);">
                <div><div style="font-weight:500;">${escapeHtml(r.type)}</div><div style="font-size:12px;color:var(--md-outline);">${escapeHtml(r.note || '')}</div></div>
                <div style="font-weight:600;color:var(--md-on-surface);">+${formatMoney(r.amount)}</div>
            </div>`;
        });
    }

    if (spends.length > 0) {
        let totalSpend = spends.reduce((s, e) => s + e.amount, 0);
        if (pastInvs.length > 0 || futSips.length > 0) html += '<br>';
        html += `<div style="font-size:13px;font-weight:700;color:var(--md-tertiary);margin-bottom:8px;">💳 Spending <span style="font-weight:400;font-size:12px;">(${spends.length} txn &middot; ${formatMoney(totalSpend)})</span></div>`;
        spends.forEach(e => {
            let cat = e.category || 'Uncategorized';
            html += `<div style="display:flex;justify-content:space-between;margin-bottom:6px;padding-bottom:6px;border-bottom:1px solid var(--md-surface-container-highest);">
                <div><div style="font-weight:500;font-size:13px;">${(DOMPurify ? DOMPurify.sanitize(e.comment || '—',{ALLOWED_TAGS:[],ALLOWED_ATTR:[]}) : escapeHtml(e.comment || '—'))}</div><div style="font-size:11px;color:var(--md-outline);">${escapeHtml(cat)}</div></div>
                <div style="font-weight:600;color:var(--md-error);">${formatMoney(e.amount)}</div>
            </div>`;
        });
    }

    if (!pastInvs.length && !futSips.length && !spends.length) {
        html += '<div style="padding:20px;text-align:center;color:var(--md-outline);">No activity on this day</div>';
    }

    html += '</div>';
    Swal.fire({ title: displayDate, html: html, showConfirmButton: true, confirmButtonText: 'Close', width: 400 });
}

// ==========================================
// 5. INPUT FORMS & DATA OPERATIONS
// ==========================================

// Smart defaults memory - remembers last choices per category
let smartDefaults;
try { smartDefaults = JSON.parse(sessionStorage.getItem('smartDefaults') || '{}'); } catch (e) { smartDefaults = {}; }

function saveSmartDefault(key, value) {
    if (!value) return;
    smartDefaults[key] = value;
    sessionStorage.setItem('smartDefaults', JSON.stringify(smartDefaults));
}

function getSmartDefault(key, fallback = '') {
    return smartDefaults[key] || fallback;
}

function setInvestType(type) {
    haptic(20); window.currentInvType = type;
    document.querySelectorAll('#type-chips .quick-chip').forEach(el => {
        el.classList.toggle('active', el.dataset.cat === type);
    });

    const config = db.categoryDetails[type]?.fields || {};

    // Default hiding
    const sections = [
        'dynamic-fd-fields', 'dynamic-sip-fields', 'dynamic-qty-price',
        'dynamic-mf-search', 'dynamic-growth-fields', 'dynamic-sip-day-field',
        'maturity-box-simple', 'invest-smart-preview'
    ];
    sections.forEach(s => {
        const el = document.getElementById(s);
        if (el) el.style.display = 'none';
    });

    // Show monthly contribution wrapper for SIP, PF, PPF or if configured
    const isMonthlyAsset = ['SIP', 'PF', 'PPF'].includes(type) || config.monthly;
    const monthlyWrap = document.getElementById('monthly-contrib-wrapper');
    if (monthlyWrap) monthlyWrap.style.display = isMonthlyAsset ? 'flex' : 'none';

    const isMonthlyCheck = document.getElementById('inv-is-monthly');
    if (isMonthlyCheck && !editInvId) isMonthlyCheck.checked = isMonthlyAsset;

    // Core Logic mapping
    const showIfExist = (id, cond) => { const el = document.getElementById(id); if (el) el.style.display = cond ? 'flex' : 'none'; };
    const showBlockIfExist = (id, cond) => { const el = document.getElementById(id); if (el) el.style.display = cond ? 'block' : 'none'; };

    if (config.interest) showIfExist('dynamic-fd-fields', true);
    if (config.maturity) showBlockIfExist('maturity-box-simple', true);
    if (config.sipday) showIfExist('dynamic-sip-day-field', true);
    if (config.mf) showIfExist('dynamic-mf-search', true);
    if (config.qty) showIfExist('dynamic-qty-price', true);
    if (config.growth) showIfExist('dynamic-growth-fields', true);

    // Dynamic visibility for Sub-Category and Broker based on config
    const isSimple = config.simple || ['Cash', 'Liquid'].includes(type);
    const hasBroker = config.broker !== undefined ? config.broker : !isSimple;
    const hasSubcat = config.subcat !== undefined ? config.subcat : !isSimple;
    const subcatWrapper = document.getElementById('inv-subcat')?.parentElement;
    const brokerWrapper = document.getElementById('inv-broker')?.parentElement;
    if (subcatWrapper) subcatWrapper.style.display = hasSubcat ? 'flex' : 'none';
    if (brokerWrapper) brokerWrapper.style.display = hasBroker ? 'flex' : 'none';
    // If hidden, clear the row margin
    const row = subcatWrapper?.parentElement;
    if (row && row.classList.contains('input-row')) {
        row.style.display = (hasSubcat || hasBroker) ? 'flex' : 'none';
    }

    // Safe DOM access for labels and inputs
    const amtEl = document.getElementById('inv-amt');
    const amtLabel = document.getElementById('inv-amt-label');
    const intEl = document.getElementById('inv-interest');

    if (amtEl) amtEl.readOnly = (type === 'Stocks');
    if (amtLabel) amtLabel.innerText = type === 'SIP' ? "Monthly SIP Amount (₹)" : "Amount (₹)";

    // Set Gov rates if not specified
    if (type === 'PPF' && intEl && !intEl.value) intEl.value = 7.1;
    if (type === 'PF' && intEl && !intEl.value) intEl.value = 8.15;

    // Apply smart defaults for this category (only if not editing)
    if (!editInvId) {
        const sdAccount = document.getElementById('inv-account');
        const sdBroker = document.getElementById('inv-broker');
        const sdSubcat = document.getElementById('inv-subcat');
        const sdDate = document.getElementById('inv-date');

        if (sdAccount && !sdAccount.value) sdAccount.value = getSmartDefault(`account_${type}`, getSmartDefault('account_last', sdAccount.options[0]?.value || ''));
        if (sdBroker && !sdBroker.value) sdBroker.value = getSmartDefault(`broker_${type}`, getSmartDefault('broker_last', ''));
        if (sdSubcat && !sdSubcat.value) sdSubcat.value = getSmartDefault(`subcat_${type}`, '');
        if (sdDate && !sdDate.value) sdDate.value = getLocalYYYYMMDD(new Date()); // Always default to today
    }

    // Attach listeners for smart preview

    const inputIds = ['inv-amt', 'inv-date', 'inv-interest', 'inv-payout', 'inv-growth', 'inv-qty', 'inv-price', 'inv-sip-day', 'inv-mode'];
    inputIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.oninput = updateSmartPreview;
    });
    updateSmartPreview();
}

function updateSmartPreview() {
    const preview = document.getElementById('invest-smart-preview');
    const content = document.getElementById('smart-preview-content');
    if (!preview || !content) return;

    const amt = parseFloat(document.getElementById('inv-amt').value) || 0;
    const dateValue = document.getElementById('inv-date').value;
    const date = new Date(dateValue);
    const type = window.currentInvType;

    if (amt <= 0 || isNaN(date.getTime())) {
        preview.style.display = 'none';
        return;
    }
    preview.style.display = 'block';

    let html = "";
    const now = new Date();
    const years = Math.max(0, (now - date) / (1000 * 60 * 60 * 24 * 365.25));
    const months = Math.max(0, Math.floor((now.getFullYear() - date.getFullYear()) * 12 + (now.getMonth() - date.getMonth())));

    if (type === 'FD' || type === 'Fixed Deposit') {
        const rate = parseFloat(document.getElementById('inv-interest').value) || 0;
        const payout = document.getElementById('inv-payout').value;
        const maturityDate = new Date(document.getElementById('inv-maturity-simple').value);

        let currentVal = amt;
        if (rate > 0) {
            if (payout === 'quarterly') currentVal = amt * Math.pow(1 + (rate / 100) / 4, 4 * years);
            else if (payout === 'monthly') currentVal = amt * Math.pow(1 + (rate / 100) / 12, 12 * years);
            else currentVal = amt * (1 + (rate / 100) * years);
        }

        html = `<div style="padding:12px; border-radius:12px; background:var(--md-primary-container); color:var(--md-on-primary-container);">
            <div style="font-size:11px; opacity:0.8; margin-bottom:4px;">Accrued Value (${years.toFixed(1)}Y)</div>
            <div style="font-size:20px; font-weight:600;">₹${fmtNum(currentVal.toFixed(0))}</div>
            <div style="font-size:11px; margin-top:4px;">Interest: <span style="color:var(--md-success);">+₹${fmtNum((currentVal - amt).toFixed(0))}</span></div>
        </div>`;
    } else if (type === 'SIP') {
        const isMonthly = document.getElementById('inv-is-monthly').checked;
        const rate = parseFloat(document.getElementById('inv-growth').value) || 12;
        if (isMonthly) {
            const totalInvested = amt * (months + 1);
            const r = rate / (100 * 12);
            const futureVal = amt * ((Math.pow(1 + r, months + 1) - 1) / r) * (1 + r);
            html = `<div style="padding:12px; border-radius:12px; background:var(--md-secondary-container); color:var(--md-on-secondary-container);">
                <div style="font-size:11px; opacity:0.8; margin-bottom:4px;">SIP Valuation (${months + 1} Months)</div>
                <div style="font-size:20px; font-weight:600;">₹${fmtNum(futureVal.toFixed(0))}</div>
                <div style="font-size:11px; margin-top:4px;">Invested: ₹${fmtNum(totalInvested)} | P&L: <span style="color:var(--md-success);">+₹${fmtNum((futureVal - totalInvested).toFixed(0))}</span></div>
            </div>`;
        } else {
            const currentVal = amt * Math.pow(1 + (rate / 100), years);
            html = `<div style="padding:12px; border-radius:12px; background:var(--md-secondary-container); color:var(--md-on-secondary-container);">
                <div style="font-size:11px; opacity:0.8; margin-bottom:4px;">Growth Forecast (${years.toFixed(1)}Y @ ${rate}%)</div>
                <div style="font-size:20px; font-weight:600;">₹${fmtNum(currentVal.toFixed(0))}</div>
                <div style="font-size:11px; margin-top:4px;">Gain: <span style="color:var(--md-success);">+₹${fmtNum((currentVal - amt).toFixed(0))}</span></div>
            </div>`;
        }
    } else if (type === 'PF' || type === 'PPF') {
        const rate = type === 'PF' ? 8.15 : 7.1;
        const currentVal = amt * Math.pow(1 + (rate / 100), years);
        html = `<div style="padding:12px; border-radius:12px; background:var(--md-tertiary-container); color:var(--md-on-tertiary-container);">
            <div style="font-size:11px; opacity:0.8; margin-bottom:4px;">Govt Compound Interest (${rate}%)</div>
            <div style="font-size:20px; font-weight:600;">₹${fmtNum(currentVal.toFixed(0))}</div>
            <div style="font-size:11px; margin-top:4px;">Interest: <span style="color:var(--md-success);">+₹${fmtNum((currentVal - amt).toFixed(0))}</span></div>
        </div>`;
    } else {
        // Default generic growth
        const rate = parseFloat(document.getElementById('inv-growth').value) || 0;
        const currentVal = amt * Math.pow(1 + (rate / 100), years);
        if (rate > 0) {
            html = `<div style="padding:12px; border-radius:12px; border:1px solid var(--md-outline-variant);">
                <div style="font-size:11px; opacity:0.8; margin-bottom:4px;">Forecasted Value (${rate}%)</div>
                <div style="font-size:18px; font-weight:600;">₹${fmtNum(currentVal.toFixed(0))}</div>
            </div>`;
        }
    }
    if (html) {
        content.innerHTML = html;
        preview.style.display = 'block';
    } else {
        content.innerHTML = '';
        preview.style.display = 'none';
    }
}

function calculateDynamicTotal() {
    let qty = parseFloat(document.getElementById('inv-qty').value) || 0;
    let price = parseFloat(document.getElementById('inv-price').value) || 0;
    if (qty > 0 && price > 0) document.getElementById('inv-amt').value = (qty * price).toFixed(2);
    document.getElementById('inv-units-hidden').value = qty;
}

function reverseCalculateUnits() {
    let amtEl = document.getElementById('inv-amt');
    let priceEl = document.getElementById('inv-price');
    if (!amtEl || !priceEl) return;
    let amt = parseFloat(amtEl.value) || 0;
    let price = parseFloat(priceEl.value) || 0;
    if (amt > 0 && price > 0) {
        let units = amt / price;
        let qtyEl = document.getElementById('inv-qty');
        if (qtyEl) qtyEl.value = units.toFixed(4);
        let hiddenEl = document.getElementById('inv-units-hidden');
        if (hiddenEl) hiddenEl.value = units;
    }
}

async function searchMFForLog() {
    if (window.currentInvType === 'Stocks') {
        return searchStockForLog();
    }
    let q = document.getElementById('inv-mf-query').value.trim();
    if (!q) return showSnackbar("Enter fund name to search", "warning");

    // Show loading state
    let searchBtn = document.querySelector('#dynamic-mf-search button');
    if (searchBtn) setButtonLoading(searchBtn.id || 'mf-search-btn', true);
    let sel = document.getElementById('inv-mf-select');
    if (sel) {
        sel.innerHTML = '<option>Searching...</option>';
        sel.style.display = 'block';
    }

    try {
        let res = await fetch(`https://api.mfapi.in/mf/search?q=${encodeURIComponent(q)}`);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        let data = await res.json();

        if (searchBtn) setButtonLoading(searchBtn.id || 'mf-search-btn', false);

        if (data.length === 0) {
            if (sel) sel.innerHTML = '<option>No funds found</option>';
            return showSnackbar("No funds found", "error");
        }

        sel.innerHTML = `<option value="">Select a fund (${data.length} found)...</option>` + data.map(f => `<option value="${escapeHtml(f.schemeCode)}" data-name="${escapeHtml(f.schemeName)}">${escapeHtml(f.schemeName.substring(0, 60))}${f.schemeName.length > 60 ? '...' : ''}</option>`).join('');
        sel.style.display = 'block';
        showSnackbar(`${data.length} funds found`, "check_circle");

        // Auto-focus the select for faster UX
        setTimeout(() => sel.focus(), 100);
    } catch (e) {
        if (searchBtn) setButtonLoading(searchBtn.id || 'mf-search-btn', false);
        if (sel) sel.innerHTML = '<option>Search failed</option>';
        showSnackbar("Search failed - check connection", "error");
    }
}

function handleMFSelectForLog(sel) {
    if (window.currentInvType === 'Stocks') {
        return handleStockSelectForLog(sel);
    }
    let code = sel.value; if (!code) return;
    let opt = sel.options[sel.selectedIndex];
    document.getElementById('inv-note').value = opt.getAttribute('data-name');
    document.getElementById('inv-mf-code-hidden').value = code;
    fetchLiveNAV(code);
}

async function fetchLiveNAV(code) {
    if (!code) return;

    // Show loading on price field
    let priceInput = document.getElementById('inv-price');
    if (!priceInput) return;
    let originalPrice = priceInput.value;
    priceInput.value = 'Loading...';
    priceInput.disabled = true;

    try {
        let res = await fetch(`https://api.mfapi.in/mf/${code}`);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        let data = await res.json();
        if (!data || data.status !== "SUCCESS") throw new Error("Invalid Code");

        let latestNav = parseFloat(data.data[0].nav);
        priceInput.value = latestNav.toFixed(4);
        priceInput.disabled = false;
        db.navCache[code] = { nav: latestNav, date: data.data[0].date, lastFetched: new Date().toISOString() };
        reverseCalculateUnits();
        showSnackbar(`NAV: ₹${latestNav} (${data.data[0].date})`, "check_circle");

        // Auto-calculate and move focus to amount for faster entry
        setTimeout(() => {
            let qtyInput = document.getElementById('inv-qty');
            let amtInput = document.getElementById('inv-amt');
            if (qtyInput && qtyInput.value && amtInput && !amtInput.value) {
                calculateDynamicTotal();
                updateSmartPreview();
            }
            // Focus amount field if empty
            if (amtInput && !amtInput.value) {
                amtInput.focus();
            }
        }, 100);
    } catch (e) {
        priceInput.value = originalPrice;
        priceInput.disabled = false;
        showSnackbar("Failed to fetch NAV", "error");
    }
}

// --- STOCK SEARCH & PRICE LOOKUP via Yahoo Finance ---

const YAHOO_PROXIES = [
  'https://api.codetabs.com/v1/proxy?quest=',
  'https://corsproxy.io/?',
  'https://api.allorigins.win/raw?url=',
  'https://api.allorigins.win/get?url=',
];

async function yahooFetch(url) {
  let lastErr;
  for (const proxy of YAHOO_PROXIES) {
    try {
      const ctrl = new AbortController();
      const id = setTimeout(() => ctrl.abort(), 10000);
      const r = await fetch(proxy + encodeURIComponent(url), { signal: ctrl.signal });
      clearTimeout(id);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('Yahoo unreachable');
}

async function searchStockForLog() {
    let q = document.getElementById('inv-mf-query').value.trim();
    if (!q) return showSnackbar("Enter stock name to search", "warning");

    let searchBtn = document.querySelector('#dynamic-mf-search button');
    if (searchBtn) setButtonLoading(searchBtn.id || 'mf-search-btn', true);
    let sel = document.getElementById('inv-mf-select');
    if (sel) {
        sel.innerHTML = '<option>Searching...</option>';
        sel.style.display = 'block';
    }

    try {
        let data = await yahooFetch(`https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=10`);

        if (searchBtn) setButtonLoading(searchBtn.id || 'mf-search-btn', false);
        let quotes = data.quotes || [];
        if (quotes.length === 0) {
            if (sel) sel.innerHTML = '<option>No stocks found</option>';
            return showSnackbar("No stocks found", "error");
        }

        let indian = quotes.filter(s => s.symbol && (s.symbol.endsWith('.NS') || s.symbol.endsWith('.BO')));
        let display = indian.length > 0 ? indian : quotes.slice(0, 10);

        sel.innerHTML = `<option value="">Select stock (${display.length} found)...</option>` +
            display.map(s => {
                let name = s.longname || s.shortname || s.symbol;
                let exch = s.symbol.endsWith('.NS') ? 'NSE' : s.symbol.endsWith('.BO') ? 'BSE' : s.exchange || '';
                return `<option value="${escapeHtml(s.symbol)}" data-name="${escapeHtml(name)}">${escapeHtml(name.substring(0, 55))} — ${escapeHtml(s.symbol)} (${escapeHtml(exch)})</option>`;
            }).join('');
        sel.style.display = 'block';
        showSnackbar(`${display.length} stocks found`, "check_circle");
        setTimeout(() => sel.focus(), 100);
    } catch (e) {
        if (searchBtn) setButtonLoading(searchBtn.id || 'mf-search-btn', false);
        if (sel) sel.innerHTML = '<option>Search failed</option>';
        showSnackbar("Search failed - check connection", "error");
    }
}

function handleStockSelectForLog(sel) {
    let symbol = sel.value;
    if (!symbol) return;
    let opt = sel.options[sel.selectedIndex];
    document.getElementById('inv-note').value = opt.getAttribute('data-name');
    document.getElementById('inv-mf-code-hidden').value = symbol;
    fetchLiveStockPrice(symbol);
}

async function fetchLiveStockPrice(symbol) {
    if (!symbol) return;

    let priceInput = document.getElementById('inv-price');
    let originalPrice = priceInput.value;
    priceInput.value = 'Loading...';
    priceInput.disabled = true;

    try {
        let data = await yahooFetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`);
        let result = data.chart?.result?.[0];
        if (!result) throw new Error("No data");

        let price = result.meta.regularMarketPrice;
        let today = new Date();
        let dateStr = today.toISOString().split('T')[0];

        priceInput.value = price.toFixed(2);
        priceInput.disabled = false;
        db.navCache[symbol] = { nav: price, date: dateStr, lastFetched: new Date().toISOString() };
        reverseCalculateUnits();
        showSnackbar(`${result.meta.shortName || symbol}: ₹${price}`, "check_circle");

        setTimeout(() => {
            let qtyInput = document.getElementById('inv-qty');
            let amtInput = document.getElementById('inv-amt');
            if (qtyInput && qtyInput.value && amtInput && !amtInput.value) {
                calculateDynamicTotal();
                updateSmartPreview();
            }
            if (amtInput && !amtInput.value) amtInput.focus();
        }, 100);
    } catch (e) {
        priceInput.value = originalPrice;
        priceInput.disabled = false;
        showSnackbar("Failed to fetch stock price", "error");
    }
}

// --- UNIVERSAL HISTORICAL BACKFILL WIZARD ---
function populateSyncDropdown() {
    let sel = document.getElementById('sync-asset-type');
    sel.innerHTML = Object.keys(db.categories).map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
    toggleSyncFields();
}

function toggleSyncFields() {
    let type = document.getElementById('sync-asset-type').value;
    if (type === 'SIP' || type === 'Stocks') {
        document.getElementById('sync-mf-block').style.display = 'flex';
    } else {
        document.getElementById('sync-mf-block').style.display = 'none';
    }
}

async function searchMFForSync() {
    let q = document.getElementById('sync-search').value.trim();
    if (!q) return showSnackbar("Enter fund name to search", "warning");

    showSnackbar("Searching...", "hourglass_empty");
    try {
        let res = await fetch(`https://api.mfapi.in/mf/search?q=${encodeURIComponent(q)}`);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        let data = await res.json();
        if (!data || data.length === 0) return showSnackbar("No funds found", "error");

        let sel = document.getElementById('sync-mf-select');
        sel.innerHTML = `<option value="">Select a fund...</option>` + data.map(f => `<option value="${escapeHtml(f.schemeCode)}">${escapeHtml(f.schemeName)}</option>`).join('');
        sel.style.display = 'block';
        showSnackbar(`Found ${data.length} funds`, "check_circle");
    } catch (e) { showSnackbar("Search failed", "error"); }
}

function handleMFSelectForSync(sel) {
    let code = sel.value; if (!code) return;
    document.getElementById('sync-code').value = code;
}

async function syncHistoricalSIP() {
    let type = document.getElementById('sync-asset-type').value;
    let amt = parseFloat(document.getElementById('sync-amt').value);
    let start = new Date(document.getElementById('sync-start').value);
    let day = parseInt(document.getElementById('sync-day').value, 10);

    if (isNaN(amt) || isNaN(start.getTime()) || isNaN(day)) return showSnackbar("Fill all fields", "error");

    if (type === 'SIP' || type === 'Stocks') {
        let code = document.getElementById('sync-code').value.trim();
        if (!code) return showSnackbar("Select MF Code", "error");
        showSnackbar("Fetching Historical Data...", "hourglass_empty");
        try {
            let res = await fetch(`https://api.mfapi.in/mf/${code}`);
            if (!res.ok) throw new Error('HTTP ' + res.status);
            let data = await res.json();
            if (!data || data.status !== "SUCCESS") throw new Error("Invalid Code");

            let navMap = {};
            data.data.forEach(d => {
                let parts = d.date.split('-');
                navMap[`${parts[2]}-${parts[1]}-${parts[0]}`] = parseFloat(d.nav);
            });

            let schemeName = data.meta.scheme_name;
            let currentDate = monthlyOccurrenceOnOrAfter(start, day);
            let today = new Date(); let added = 0;

            while (currentDate <= today) {
                let dStr = getLocalYYYYMMDD(currentDate);
                let checkDate = new Date(currentDate); let foundNav = null;
                for (let i = 0; i < 7; i++) {
                    let checkStr = getLocalYYYYMMDD(checkDate);
                    if (navMap[checkStr]) { foundNav = navMap[checkStr]; break; }
                    checkDate.setDate(checkDate.getDate() - 1);
                }

                let units = foundNav ? amt / foundNav : 0;
                db.investments.push({ id: generateUniqueId(), date: dStr, type: type, amount: amt, units: units, mfCode: code, note: schemeName, tags: "backfill", account: activeAccountFilter === 'All' ? db.accounts[0] : activeAccountFilter });
                added++;
                currentDate = advanceMonth(currentDate, day);
            }

            saveData(); renderAll(); closeOverlays(); showSnackbar(`Generated ${added} past SIP entries!`, "check_circle");
        } catch (e) { showSnackbar("Failed to fetch MF data", "error"); }
    } else {
        // Fixed income or custom backfill
        let currentDate = monthlyOccurrenceOnOrAfter(start, day);
        let today = new Date(); let added = 0;
        while (currentDate <= today) {
            let dStr = getLocalYYYYMMDD(currentDate);

            db.investments.push({ id: generateUniqueId(), date: dStr, type: type, amount: amt, note: `${type} (Backfill)`, tags: "backfill", account: activeAccountFilter === 'All' ? db.accounts[0] : activeAccountFilter });
            added++;
            currentDate = advanceMonth(currentDate, day);
        }
        saveData(); renderAll(); closeOverlays(); showSnackbar(`Generated ${added} deposits for ${type}!`, "check_circle");
    }
}

// Date helpers shared by historical SIP backfill and recurring scheduler.
// JS Date treats `setDate(31)` followed by `setMonth(+1)` as overflow — e.g.
// Jan 31 → Feb 31 → Mar 2, silently skipping February. These helpers clamp
// the requested day to the last day of the resulting month so we always land
// in the intended calendar month.
function clampDayToMonth(year, monthIndex, day) {
    const lastDay = new Date(year, monthIndex + 1, 0).getDate();
    return Math.min(day, lastDay);
}
function monthlyOccurrenceOnOrAfter(start, day) {
    let y = start.getFullYear();
    let m = start.getMonth();
    let d = clampDayToMonth(y, m, day);
    let dt = new Date(y, m, d);
    if (dt < start) {
        m += 1;
        d = clampDayToMonth(y, m, day);
        dt = new Date(y, m, d);
    }
    return dt;
}
function advanceMonth(currentDate, day) {
    const y = currentDate.getFullYear();
    const m = currentDate.getMonth() + 1;
    const d = clampDayToMonth(y, m, day);
    return new Date(y, m, d);
}
// Initial nextRun for a recurring SIP: one month after the user-picked start
// date, clamped to the start's day-of-month so a 31st-of-the-month SIP doesn't
// silently drift to the next month on creation (Jan 31 + 1mo would otherwise
// overflow to Mar 2, leaving processRecurring with the wrong intendedDay).
function nextMonthlyRun(startDate) {
    return advanceMonth(startDate, startDate.getDate());
}

const FORM_DRAFT_KEY = 'investFormDraft';

function saveFormDraft() {
    if (window.editInvId) return; // Don't save drafts when editing
    const draft = {
        type: window.currentInvType,
        date: document.getElementById('inv-date')?.value,
        amount: document.getElementById('inv-amt')?.value,
        note: document.getElementById('inv-note')?.value,
        tags: document.getElementById('inv-tags')?.value,
        subcat: document.getElementById('inv-subcat')?.value,
        broker: document.getElementById('inv-broker')?.value,
        interest: document.getElementById('inv-interest')?.value,
        maturity: document.getElementById('inv-maturity-simple')?.value,
        account: document.getElementById('inv-account')?.value,
        isMonthly: document.getElementById('inv-is-monthly')?.checked,
        mfQuery: document.getElementById('inv-mf-query')?.value,
        mfCode: document.getElementById('inv-mf-code-hidden')?.value,
        qty: document.getElementById('inv-qty')?.value,
        price: document.getElementById('inv-price')?.value,
        timestamp: Date.now()
    };
    sessionStorage.setItem(FORM_DRAFT_KEY, JSON.stringify(draft));
}

function loadFormDraft() {
    const draftJson = sessionStorage.getItem(FORM_DRAFT_KEY);
    if (!draftJson) return false;

    try {
        const draft = JSON.parse(draftJson);
        const age = Date.now() - draft.timestamp;
        if (age > 24 * 60 * 60 * 1000) { // Older than 24h
            sessionStorage.removeItem(FORM_DRAFT_KEY);
            return false;
        }

        // Restore fields
        if (draft.type) setInvestType(draft.type);
        setTimeout(() => {
            const safeSet = (id, val) => { const el = document.getElementById(id); if (el && val) el.value = val; };
            const safeCheck = (id, val) => { const el = document.getElementById(id); if (el) el.checked = val; };

            safeSet('inv-date', draft.date);
            safeSet('inv-amt', draft.amount);
            safeSet('inv-note', draft.note);
            safeSet('inv-tags', draft.tags);
            safeSet('inv-subcat', draft.subcat);
            safeSet('inv-broker', draft.broker);
            safeSet('inv-interest', draft.interest);
            safeSet('inv-maturity-simple', draft.maturity);
            safeSet('inv-account', draft.account);
            safeSet('inv-mf-query', draft.mfQuery);
            safeSet('inv-mf-code-hidden', draft.mfCode);
            safeSet('inv-qty', draft.qty);
            safeSet('inv-price', draft.price);
            safeCheck('inv-is-monthly', draft.isMonthly);

            updateSmartPreview();
            showSnackbar('Draft restored', 'restore');
        }, 100);
        return true;
    } catch (e) {
        return false;
    }
}

function clearFormDraft() {
    sessionStorage.removeItem(FORM_DRAFT_KEY);
}

function openInvestSheet(id = null, presetAmt = null) {
    haptic(30); editInvId = id;
    const sheetTitle = document.getElementById('invest-sheet-title');
    const delBtn = document.getElementById('del-inv-btn');
    if (sheetTitle) sheetTitle.innerText = id ? `Edit Entry` : `Log Investment`;
    if (delBtn) delBtn.style.display = id ? 'block' : 'none';

    // Auto-focus management for faster entry flow
    setTimeout(() => {
        if (id) {
            // Editing - focus on amount for quick changes
            let amtField = document.getElementById('inv-amt');
            if (amtField) amtField.focus();
        } else {
            // Try to restore draft first
            const draftRestored = loadFormDraft();
            if (!draftRestored) {
                // New entry - smart focus based on category type
                let type = window.currentInvType;
                let focusField = 'inv-amt'; // default

                // For SIP/Stocks with MF search enabled, focus the search first
                let config = db.categoryDetails[type]?.fields || {};
                if ((type === 'SIP' || type === 'Stocks') && config.mf) {
                    let mfQuery = document.getElementById('inv-mf-query');
                    if (mfQuery && !mfQuery.value) {
                        focusField = 'inv-mf-query';
                    }
                }
                // For FD with interest, focus interest rate
                else if (type === 'FD' && config.interest) {
                    let intField = document.getElementById('inv-interest');
                    if (intField && !intField.value) {
                        focusField = 'inv-interest';
                    }
                }

                let field = document.getElementById(focusField);
                if (field) field.focus();
            }
        }
    }, 150);

    // Attach auto-save listeners
    setTimeout(() => {
        const fields = ['inv-date', 'inv-amt', 'inv-note', 'inv-tags', 'inv-subcat', 'inv-broker',
            'inv-interest', 'inv-maturity-simple', 'inv-account', 'inv-mf-query',
            'inv-qty', 'inv-price', 'inv-is-monthly'];
        fields.forEach(id => {
            const el = document.getElementById(id);
    if (el && !el.dataset._formDraftAttached) {
        el.dataset._formDraftAttached = '1';
        el.addEventListener('change', saveFormDraft);
        el.addEventListener('input', debounce(saveFormDraft, 1000));
    }
        });
    }, 200);

    const safeSet = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
    const safeCheck = (id, val) => { const el = document.getElementById(id); if (el) el.checked = !!val; };

    if (id) {
        let inv = db.investments.find(i => String(i.id) === String(id));
        if (!inv) return;
        setInvestType(inv.type);

        safeSet('inv-date', inv.date);
        safeSet('inv-amt', inv.amount);
        safeSet('inv-note', inv.note || '');
        safeSet('inv-tags', inv.tags || '');
        safeSet('inv-subcat', inv.subCategory || '');
        safeSet('inv-broker', inv.broker || '');
        safeSet('inv-growth', inv.growthRate || '');
        safeSet('inv-maturity-simple', inv.maturityDate || '');
        safeSet('inv-interest', inv.interestRate || '');
        safeSet('inv-account', inv.account || db.accounts[0]);
        safeSet('inv-units-hidden', inv.units || '');
        safeSet('inv-mf-code-hidden', inv.mfCode || '');
        safeCheck('inv-is-monthly', inv.isMonthlyContrib);
        if (inv.payoutType) safeSet('inv-payout', inv.payoutType);
        if (inv.investMode) safeSet('inv-mode', inv.investMode);
        if (inv.sipDay) safeSet('inv-sip-day', inv.sipDay);

        let tplCheck = document.getElementById('tpl-switch-wrap'); if (tplCheck) tplCheck.style.display = 'none';
    } else {
        safeSet('inv-date', getLocalYYYYMMDD(new Date()));
        safeSet('inv-amt', presetAmt !== null ? presetAmt : '');
        safeSet('inv-note', '');
        safeSet('inv-tags', '');
        safeSet('inv-subcat', '');
        safeSet('inv-broker', '');
        safeSet('inv-growth', '');
        safeSet('inv-maturity-simple', '');
        safeSet('inv-interest', '');
        safeSet('inv-initial-payment', '');
        safeSet('inv-qty', '');
        safeSet('inv-price', '');
        safeSet('inv-account', activeAccountFilter !== 'All' ? activeAccountFilter : db.accounts[0]);
        safeSet('inv-units-hidden', '');
        safeSet('inv-mf-code-hidden', '');
        safeCheck('inv-is-monthly', false);
        safeSet('inv-payout', 'quarterly');
        safeSet('inv-mode', 'monthly');
        safeSet('inv-sip-day', '');

        let tplCheck = document.getElementById('tpl-switch-wrap'); if (tplCheck) tplCheck.style.display = 'flex';
        let tplToggle = document.getElementById('inv-template'); if (tplToggle) tplToggle.checked = false;
        let recCheck = document.getElementById('inv-recurring'); if (recCheck) recCheck.checked = false;
        if (window.activeCategory) { setInvestType(window.activeCategory); } else { setInvestType(Object.keys(db.categories)[0]); }
    }
    openSheet('invest-sheet');
}

