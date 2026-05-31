window.activeChatSession = null;

function saveInvestment() {
    haptic(40);

    // Show loading state - find the save button in the invest sheet
    const saveBtn = document.querySelector('#invest-sheet button[onclick="saveInvestment()"]');
    if (saveBtn) {
        setButtonLoading(saveBtn, true);
    }

    // Get and validate all form inputs
    const formInputs = {
        date: document.getElementById('inv-date')?.value || '',
        amt: parseFloat(document.getElementById('inv-amt')?.value) || 0,
        note: document.getElementById('inv-note')?.value || '',
        tags: (document.getElementById('inv-tags')?.value || '').replace(/#/g, ''),
        subCat: document.getElementById('inv-subcat')?.value || '',
        broker: document.getElementById('inv-broker')?.value || '',
        growth: (function(v){return v===''||v==null?null:parseFloat(v)})(document.getElementById('inv-growth')?.value),
        acc: document.getElementById('inv-account')?.value || '',
        matDate: document.getElementById('inv-maturity-simple')?.value || '',
        intRate: (function(v){return v===''||v==null?null:parseFloat(v)})(document.getElementById('inv-interest')?.value),
        initialPayment: (function(v){return v===''||v==null?null:parseFloat(v)})(document.getElementById('inv-initial-payment')?.value),
        isTemplate: document.getElementById('inv-template')?.checked || false,
        isRecurring: document.getElementById('inv-recurring')?.checked || false,
        units: (function(v){return v===''||v==null?null:parseFloat(v)})(document.getElementById('inv-units-hidden')?.value),
        mfCode: document.getElementById('inv-mf-code-hidden')?.value || null,
        isMonthlyContrib: document.getElementById('inv-is-monthly')?.checked || false,
        payoutType: document.getElementById('inv-payout')?.value || '',
        investMode: document.getElementById('inv-mode')?.value || '',
        sipDay: (function(v){return v===''||v==null?null:parseInt(v,10)})(document.getElementById('inv-sip-day')?.value)
    };

    // Add input field animations
    Object.keys(formInputs).forEach(key => {
        const element = document.getElementById(`inv-${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`);
        if (element && formInputs[key]) {
            element.classList.add('input-focused');
            setTimeout(() => element.classList.remove('input-focused'), 300);
        }
    });

    // Sanitize text inputs
    const sanitizedInputs = {
        ...formInputs,
        note: sanitizeText(formInputs.note),
        tags: sanitizeText(formInputs.tags),
        subCat: sanitizeText(formInputs.subCat),
        broker: sanitizeText(formInputs.broker),
        acc: sanitizeText(formInputs.acc)
    };

    let { date, amt, note, tags, subCat, broker, growth, acc, matDate, intRate, initialPayment, isTemplate, isRecurring, units, mfCode, isMonthlyContrib, payoutType, investMode, sipDay } = sanitizedInputs;

    // Enhanced validation with field-specific error messages and visual feedback
    const validationErrors = [];
    const errorFields = [];

    if (!date || isNaN(amt)) {
        validationErrors.push("Date and Amount required");
        errorFields.push('inv-date', 'inv-amt');
    } else {
        if (amt <= 0) {
            validationErrors.push("Amount must be greater than zero");
            errorFields.push('inv-amt');
        }

        if (units !== null && units <= 0) {
            validationErrors.push("Units must be greater than zero");
            errorFields.push('inv-qty');
        }

        if (intRate !== null && (intRate < 0 || intRate > 25)) {
            validationErrors.push("Interest rate must be between 0% and 25%");
            errorFields.push('inv-interest');
        }

        if (matDate && date) {
            let matD = new Date(matDate);
            let invD = new Date(date);
            if (matD <= invD) {
                validationErrors.push("Maturity date must be after investment date");
                errorFields.push('inv-maturity-simple');
            } else {
                // Check if maturity is unreasonably far (>50 years)
                let yearsDiff = (matD - invD) / (1000 * 60 * 60 * 24 * 365.25);
                if (yearsDiff > 50) {
                    validationErrors.push("Maturity cannot exceed 50 years from investment");
                    errorFields.push('inv-maturity-simple');
                }
            }
        }

        if (initialPayment !== null && initialPayment <= 0) {
            validationErrors.push("Initial payment must be greater than zero");
            errorFields.push('inv-initial-payment');
        }

        // Date range validation - prevent future dates more than 1 day ahead
        let investmentDate = new Date(date);
        let today = new Date();
        today.setHours(23, 59, 59, 999);
        if (investmentDate > today) {
            validationErrors.push("Investment date cannot be in the future");
            errorFields.push('inv-date');
        } else {
            // Prevent very old dates (before 2000)
            let year2000 = new Date('2000-01-01');
            if (investmentDate < year2000) {
                validationErrors.push("Investment date cannot be before year 2000");
                errorFields.push('inv-date');
            }
        }
    }

    // ENHANCED BUSINESS LOGIC VALIDATION
    // Investment amount validation based on type
    const investmentLimits = {
        'Stocks': { min: 1, max: 10000000, warning: 1000000 },
        'SIP': { min: 500, max: 1000000, warning: 100000 },
        'FD': { min: 1000, max: 10000000, warning: 5000000 },
        'RD': { min: 500, max: 500000, warning: 100000 },
        'PPF': { min: 500, max: 150000, warning: 100000 },
        'EPF': { min: 500, max: 250000, warning: 50000 },
        'NPS': { min: 500, max: 200000, warning: 50000 },
        'Gold': { min: 100, max: 5000000, warning: 1000000 },
        'Real Estate': { min: 10000, max: 100000000, warning: 50000000 },
        'Crypto': { min: 100, max: 1000000, warning: 100000 }
    };

    const limits = investmentLimits[window.currentInvType] || { min: 1, max: 10000000, warning: 1000000 };

    if (amt < limits.min) {
        validationErrors.push(`${window.currentInvType} minimum amount is ${formatMoney(limits.min)}`);
        errorFields.push('inv-amt');
    } else if (amt > limits.max) {
        validationErrors.push(`${window.currentInvType} maximum amount is ${formatMoney(limits.max)}`);
        errorFields.push('inv-amt');
    } else if (amt > limits.warning) {
        validationErrors.push(`Large amount warning: ${formatMoney(limits.warning)} is typical for ${window.currentInvType}`);
        errorFields.push('inv-amt');
    }

    // Business logic validation for investment types
    if (window.currentInvType === 'SIP' && !sipDay) {
        validationErrors.push("SIP day is required for SIP investments");
        errorFields.push('inv-sip-day');
    }

    if ((window.currentInvType === 'FD' || window.currentInvType === 'RD') && !intRate) {
        validationErrors.push("Interest rate is required for Fixed/RD deposits");
        errorFields.push('inv-interest');
    }

    if (window.currentInvType === 'Stocks' && !units) {
        validationErrors.push("Units are required for stock investments");
        errorFields.push('inv-qty');
    }

    if (window.currentInvType === 'Mutual Funds' && !mfCode) {
        validationErrors.push("MF code is required for mutual fund investments");
        errorFields.push('inv-mf-code');
    }

    // Account validation
    if (!acc) {
        validationErrors.push("Account selection is required");
        errorFields.push('inv-account');
    } else if (!db.accounts.includes(acc)) {
        validationErrors.push("Invalid account selected");
        errorFields.push('inv-account');
    }

    // Enhanced validation with security checks
    if (validationErrors.length > 0) {
        // Clear previous error states
        document.querySelectorAll('.input-error').forEach(el => el.classList.remove('input-error'));
        document.querySelectorAll('.error-message').forEach(el => el.remove());

        // Show errors with visual feedback
        validationErrors.forEach((error, index) => {
            showSnackbar(error, "error");

            // Highlight error fields with security checks
            if (errorFields[index]) {
                const field = document.getElementById(errorFields[index]);
                if (field) {
                    // Prevent XSS through field attributes
                    field.classList.add('input-error');
                    field.focus();

                    // Add inline error message with sanitization
                    const errorMsg = document.createElement('div');
                    errorMsg.className = 'error-message';
                    errorMsg.textContent = error;
                    errorMsg.style.cssText = 'color: var(--md-error); font-size: 12px; margin-top: 4px;';

                    // Securely append error message
                    if (field.parentNode && field.parentNode.appendChild) {
                        field.parentNode.appendChild(errorMsg);
                    }

                    // Remove error state on input with validation
                    field.addEventListener('input', function removeError() {
                        field.classList.remove('input-error');
                        const msg = field.parentNode ? field.parentNode.querySelector('.error-message') : null;
                        if (msg && msg.parentNode) {
                            msg.parentNode.removeChild(msg);
                        }
                        field.removeEventListener('input', removeError);
                    }, { once: true });

                    // Prevent form submission if validation fails
                    field.addEventListener('keydown', function preventSubmit(e) {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            e.stopPropagation();
                        }
                        field.removeEventListener('keydown', preventSubmit);
                    }, { once: true });
                }
            }
        });

        // Reset button state
        if (saveBtn) setButtonLoading(saveBtn, false);
        return false; // Explicitly return false to prevent save
    }

    // Duplicate detection: warn if an entry with the same date, type, and
    // amount already exists. The previous implementation compared
    // `db.lastUpdated` against "one hour ago", which only reflected when the
    // database itself was last saved — not when the matching entry was
    // added — so it false-positived every save within an hour of any prior
    // activity. checkDuplicates() runs after save for thorough flagging; this
    // pre-save warning is just a soft hint before commit.
    if (!editInvId) {
        let recentDuplicate = db.investments.find(i =>
            i.date === date &&
            i.type === window.currentInvType &&
            i.amount === amt
        );
        if (recentDuplicate) {
            showSnackbar("Similar entry already exists. Check for duplicates.", "warning");
        }
    }
    let newEntry = {
        id: editInvId || generateUniqueId(),
        date,
        type: window.currentInvType,
        amount: amt,
        note,
        tags,
        subCategory: subCat,
        broker: broker,
        growthRate: growth,
        account: acc,
        isMonthlyContrib: isMonthlyContrib,
        payoutType: payoutType,
        investMode: investMode,
        sipDay: sipDay
    };

    if (matDate) newEntry.maturityDate = matDate;
    if (intRate != null) newEntry.interestRate = intRate;
    if (units != null) newEntry.units = units;
    if (mfCode) newEntry.mfCode = mfCode;

    if (!editInvId && initialPayment > 0) {
        db.investments.push({
            id: generateUniqueId(),
            date,
            type: window.currentInvType,
            amount: initialPayment,
            note: (note ? note + ' ' : '') + 'Initial Balance',
            tags,
            subCategory: subCat,
            broker: broker,
            account: acc,
            interestRate: intRate
        });
    }
    if (editInvId) {
        let idx = db.investments.findIndex(i => String(i.id) === String(editInvId));
        if (idx > -1) {
            db.investments[idx] = newEntry;
        } else {
            db.investments.push(newEntry);
        }
    } else {
        db.investments.push(newEntry);
    }

    if (!editInvId) {
        if (isTemplate) { db.templates.push({ type: window.currentInvType, amount: amt, note: note || window.currentInvType, tags: tags, account: acc }); }
        if (isRecurring) { let nextDate = nextMonthlyRun(new Date(date)); db.recurring.push({ type: window.currentInvType, amount: amt, note, tags, account: acc, nextRun: getLocalYYYYMMDD(nextDate) }); }

        // Save smart defaults for next time
        saveSmartDefault('account_last', acc);
        saveSmartDefault(`account_${window.currentInvType}`, acc);
        saveSmartDefault('broker_last', broker);
        saveSmartDefault(`broker_${window.currentInvType}`, broker);
        saveSmartDefault('subcat_last', subCat);
        saveSmartDefault(`subcat_${window.currentInvType}`, subCat);
    }

    saveData(); renderAll(); closeOverlays(); clearFormDraft();
    // Reset edit states
    const wasEdit = !!window.editInvId;
    window.editInvId = null;
    // Show undo-capable toast for new entries
    if (!wasEdit) {
        const lastEntryId = newEntry.id;
        showUndoSnackbar("Investment Logged!", () => {
            // Undo: remove the entry
            db.investments = db.investments.filter(i => i.id !== lastEntryId);
            saveData();
            renderAll();
            showSnackbar("Entry removed", 'undo');
        });
        checkDuplicates(newEntry);
    } else {
        showSnackbar("Entry Updated", "check_circle");
    }
}

// Enhanced snackbar with undo option
function showUndoSnackbar(message, undoCallback) {
    const sb = document.getElementById("snackbar");
    if (!sb) return;
    const undoId = 'undo-' + Date.now();

    sb.innerHTML = `
        <span class="material-symbols-rounded" style="font-size:20px;">check_circle</span>
        <span style="flex:1;">${escapeHtml(message)}</span>
        <button id="${undoId}" style="background:none;border:none;color:var(--md-primary);font-weight:600;cursor:pointer;padding:4px 8px;margin-left:8px;border-radius:4px;">
            UNDO
        </button>
    `;
    sb.classList.add("show");
    sb.style.display = 'flex';
    sb.style.alignItems = 'center';

    // Attach undo handler synchronously
    const undoBtn = document.getElementById(undoId);
    if (undoBtn) {
        undoBtn.addEventListener('click', () => {
            undoCallback();
            sb.classList.remove("show");
        });
    }

    // Auto-hide after 5 seconds (longer for undo)
    setTimeout(() => {
        sb.classList.remove("show");
    }, 5000);
}

function deleteInvestment() {
    haptic(50);
    Swal.fire({
        title: 'Delete Entry?',
        text: "This cannot be undone.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Delete'
    }).then((r) => {
        if (r.isConfirmed) {
            db.investments = db.investments.filter(i => String(i.id) !== String(window.editInvId));
            saveData();
            renderAll();
            closeOverlays();
            showSnackbar("Entry Deleted");
            window.editInvId = null;
        } else {
            window.editInvId = null;
        }
    });
}


function executeQuickLog(idx) { haptic(40); let tpl = db.templates[idx]; db.investments.push({ id: generateUniqueId(), date: getLocalYYYYMMDD(new Date()), type: tpl.type, amount: tpl.amount, note: tpl.note, tags: tpl.tags, account: tpl.account }); saveData(); renderAll(); showSnackbar(`Quick Logged ${formatMoney(tpl.amount)}`); }
function deleteQuickLog(event, idx) { event.stopPropagation(); haptic(40); Swal.fire({ title: 'Delete Template?', showCancelButton: true }).then((res) => { if (res.isConfirmed) { db.templates.splice(idx, 1); saveData(); renderAll(); } }); }

// ==========================================
// 6. LIST BUILDING & SWIPE LOGIC
// ==========================================
function buildUnifiedItemHTML(inv) {
    let meta = db.categories[inv.type] || { icon: 'savings', color: '#8D6E63' };
    let dObj = parseDate(inv.date);
    let dateStr = `${dObj.getDate()} ${dObj.toLocaleString('default', { month: 'short' })}`;
    let safeNote = escapeHtml(inv.note || inv.type);
    let safeType = escapeHtml(inv.type);
    let tagsHtml = ""; if (inv.tags) { inv.tags.split(',').forEach(t => { if (t.trim()) tagsHtml += `<span class="roi-tag" style="background:var(--md-surface-container-highest);color:var(--md-on-surface-variant);font-size:10px;margin:0 2px;">#${escapeHtml(t.trim())}</span> `; }); }
    let intHtml = inv.interestRate ? `<span style="font-size:10px;color:var(--md-primary);font-weight:500;">${escapeHtml(inv.interestRate)}%</span>` : '';
    return `
            <div class="swipe-wrapper" data-id="${inv.id}">
                <div class="unified-item" onclick="openInvestSheet('${inv.id}')">
                    <div class="unified-icon" style="background:${escapeHtml(meta.color)};"><span class="material-symbols-rounded">${escapeHtml(meta.icon)}</span></div>
                    <div class="unified-content">
                        <div class="unified-title">
                            <span class="title-text">${safeNote}</span>
                            <span class="price" style="color:${parseFloat(inv.amount) >= 0 ? 'var(--md-success, #186D33)' : 'var(--md-error, #BA1A1A)'};">${parseFloat(inv.amount) >= 0 ? '+' : ''}${formatMoney(inv.amount)}</span>
                        </div>
                        <span class="unified-subtitle">${dateStr} • ${safeType}</span>
                        ${intHtml || tagsHtml ? `<div style="margin-top:2px;display:flex;gap:4px;align-items:center;flex-wrap:wrap;">${intHtml}${tagsHtml}</div>` : ''}
                    </div>
                </div>
            </div>`;
}

function getEmptyStateHTML(context = 'default') {
    const emptyStates = {
        default: {
            icon: 'inbox',
            title: 'No Entries Yet',
            subtitle: 'Start tracking your wealth journey',
            action: { text: 'Add First Entry', icon: 'add', onclick: 'openInvestSheet()' }
        },
        dashboard: {
            icon: 'account_balance_wallet',
            title: 'Welcome to TrackInvest',
            subtitle: 'Your financial journey starts here. Add your first investment to see your portfolio grow.',
            action: { text: 'Add Investment', icon: 'add_circle', onclick: 'openInvestSheet()' }
        },
        history: {
            icon: 'history',
            title: 'No Transaction History',
            subtitle: 'Your investment history will appear here',
            action: { text: 'Log Investment', icon: 'edit_note', onclick: 'openInvestSheet()' }
        },
        portfolio: {
            icon: 'pie_chart',
            title: 'Portfolio is Empty',
            subtitle: 'Add investments across different categories to build a diversified portfolio',
            action: { text: 'Start Investing', icon: 'trending_up', onclick: 'openInvestSheet()' }
        },
        goals: {
            icon: 'flag',
            title: 'No Goals Set',
            subtitle: 'Set financial goals to track your progress towards financial freedom',
            action: { text: 'Create Goal', icon: 'target', onclick: 'openGoalSheet()' }
        },
        recurring: {
            icon: 'autorenew',
            title: 'No Recurring SIPs',
            subtitle: 'Set up automatic monthly investments to build wealth consistently',
            action: { text: 'Add SIP', icon: 'schedule', onclick: 'openInvestSheet(); setTimeout(()=>document.getElementById(\'inv-is-monthly\').checked=true, 100)' }
        }
    };

    const state = emptyStates[context] || emptyStates.default;
    return `<div class="empty-state-premium" style="padding: 40px 24px; text-align: center;">
        <span class="material-symbols-rounded" style="font-size: 48px; color: var(--md-outline); margin-bottom: 16px;">${state.icon}</span>
        <div class="es-title" style="font-size: 18px; font-weight: 600; margin-bottom: 8px; color: var(--md-on-surface);">${state.title}</div>
        <div style="font-size: 14px; color: var(--md-on-surface-variant); margin-bottom: 24px; max-width: 280px; margin-left: auto; margin-right: auto;">${state.subtitle}</div>
        <button class="btn-primary" style="display: inline-flex; align-items: center; gap: 8px;" onclick="${state.action.onclick}">
            <span class="material-symbols-rounded" style="font-size: 18px;">${state.action.icon}</span>
            ${state.action.text}
        </button>
    </div>`;
}

function renderListToContainer(arr, containerId, context = 'default') {
    let html = arr.length === 0 ? getEmptyStateHTML(context) : arr.map(buildUnifiedItemHTML).join('');
    let container = document.getElementById(containerId);
    if (container) {
        container.innerHTML = html;
        attachSwipeListeners(container);
    }
}

const SEARCH_HISTORY_KEY = 'ledgerSearchHistory';
const MAX_RECENT_SEARCHES = 5;

function getSearchHistory() {
    try {
        return JSON.parse(sessionStorage.getItem(SEARCH_HISTORY_KEY) || '[]');
    } catch (e) {
        return [];
    }
}

function addSearchHistory(term) {
    if (!term || term.length < 2) return;
    let history = getSearchHistory();
    history = history.filter(h => h.toLowerCase() !== term.toLowerCase());
    history.unshift(term);
    history = history.slice(0, MAX_RECENT_SEARCHES);
    try { sessionStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(history)); } catch (e) {}
}

function clearSearchHistory() {
    try { sessionStorage.removeItem(SEARCH_HISTORY_KEY); } catch (e) {}
    renderSearchHistory();
}

function renderSearchHistory() {
    const container = document.getElementById('search-history-container');
    if (!container) return;

    const history = getSearchHistory();
    if (history.length === 0) {
        container.innerHTML = '';
        container.style.display = 'none';
        return;
    }

    // Apostrophes in the term would close the inline JS string literal even
    // after escapeHtml encoded them (browsers decode &#39; before running the
    // attribute as JS), so the term is passed via a data-attribute and read
    // back from the dataset.
    container.innerHTML = `
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;align-items:center;">
            <span style="font-size:11px;color:var(--md-outline);">Recent:</span>
            ${history.map(term => `
                <button type="button" data-term="${escapeHtml(term)}" onclick="applySearchTerm(this.dataset.term)"
                    style="padding:4px 10px;background:var(--md-surface-container-highest);border:none;border-radius:12px;font-size:12px;color:var(--md-on-surface-variant);cursor:pointer;">
                    ${escapeHtml(term)}
                </button>
            `).join('')}
            <button onclick="clearSearchHistory()" style="padding:4px;background:none;border:none;color:var(--md-outline);cursor:pointer;font-size:11px;">
                Clear
            </button>
        </div>
    `;
    container.style.display = 'block';
}

window.applySearchTerm = function (term) {
    const searchInput = document.getElementById('search-history');
    if (searchInput) {
        searchInput.value = term;
        searchInput.focus();
        renderHistory();
    }
};

function renderHistory() {
    let searchEl = document.getElementById("search-history"), filterEl = document.getElementById("ledger-filter-type"); if (!searchEl || !filterEl) return;
    let term = searchEl.value.toLowerCase(), filterType = filterEl.value;
    let dateFrom = document.getElementById('ledger-date-from')?.value;
    let dateTo = document.getElementById('ledger-date-to')?.value;

    // Save search term to history if user has typed something
    if (term && term.length >= 2) {
        addSearchHistory(searchEl.value.trim());
    }
    // Render recent searches
    renderSearchHistory();

    // Single-pass filter + summary computation
    let liCount = 0, liTotal = 0;
    let filtered = [];
    for (const inv of db.investments) {
        if (activeAccountFilter !== 'All' && inv.account !== activeAccountFilter) continue;
        if (filterType !== 'All' && inv.type !== filterType) continue;
        if (term) {
            const amountStr = String(inv.amount);
            if (!inv.type.toLowerCase().includes(term) && !(inv.note && inv.note.toLowerCase().includes(term)) && !(inv.tags && inv.tags.toLowerCase().includes(term)) && !inv.date.includes(term) && !amountStr.includes(term)) continue;
        }
        if (dateFrom && inv.date < dateFrom) continue;
        if (dateTo && inv.date > dateTo) continue;
        filtered.push(inv);
        liCount++; liTotal += inv.amount;
    }

    // Apply sorting
    const sortField = window.ledgerSort || 'date';
    const asc = window.ledgerAsc === true;
    filtered.sort((a, b) => {
        let cmp = 0;
        if (sortField === 'date') cmp = a.date.localeCompare(b.date);
        else if (sortField === 'amount') cmp = a.amount - b.amount;
        else if (sortField === 'type') cmp = (a.type || '').localeCompare(b.type || '');
        return asc ? cmp : -cmp;
    });

    // Group by month only if sorting by date, then newest first
    let html = '';
    if (filtered.length === 0) {
        html = getEmptyStateHTML('history');
    } else if (sortField === 'date') {
        let groups = {};
        filtered.forEach(inv => {
            let d = parseDate(inv.date);
            let dStr = d.toLocaleString('default', { month: 'long', year: 'numeric' });
            if (!groups[dStr]) { groups[dStr] = []; groups[dStr]._sortKey = d.getFullYear() * 12 + d.getMonth(); }
            groups[dStr].push(inv);
        });
        // Sort chronologically by year+month, newest first
        const months = Object.keys(groups).sort((a, b) => groups[b]._sortKey - groups[a]._sortKey);
        html = months.map(m => `<div class="ledger-month-header">${m} <span style="font-weight:400;font-size:11px;color:var(--md-outline);">(${groups[m].length})</span></div>` + groups[m].map(buildUnifiedItemHTML).join('')).join('');
    } else {
        html = filtered.map(buildUnifiedItemHTML).join('');
    }

    let container = document.getElementById('ledger-history-list'); if (container) { container.innerHTML = html; attachSwipeListeners(container); }

    // Update insights bar
    const countEl = document.getElementById('li-count');
    const totalEl = document.getElementById('li-total');
    const avgEl = document.getElementById('li-avg');
    if (countEl) countEl.textContent = liCount;
    if (totalEl) totalEl.textContent = '₹' + liTotal.toLocaleString('en-IN');
    if (avgEl) avgEl.textContent = liCount > 0 ? '₹' + Math.round(liTotal / liCount).toLocaleString('en-IN') : '₹0';
}
window.renderHistory = renderHistory;
window.buildUnifiedItemHTML = buildUnifiedItemHTML;
window.attachSwipeListeners = attachSwipeListeners;
window.getEmptyStateHTML = getEmptyStateHTML;

function attachSwipeListeners(cE) {
    if (!cE) return;
    // Avoid accumulating duplicate listeners on repeated calls
    if (cE.dataset.swipeAttached) return;
    cE.dataset.swipeAttached = '1';

    let gestureState = {
        startX: 0,
        startY: 0,
        currentX: 0,
        activeItem: null,
        isSwiping: false,
        hapticTriggered: false,
        touchId: null
    };

    const handleTouchStart = (e) => {
        if (e.target.closest('button, input, select, textarea, .icon-btn')) return;

        const wrapper = e.target.closest('.swipe-wrapper');
        if (!wrapper) return;

        const frontElement = wrapper.querySelector('.unified-item');
        if (!frontElement) return;

        const touch = e.touches[0];
        gestureState = {
            startX: touch.clientX,
            startY: touch.clientY,
            currentX: touch.clientX,
            activeItem: frontElement,
            wrapper: wrapper,
            touchId: touch.identifier,
            isSwiping: false,
            hapticTriggered: false
        };

        frontElement.classList.add('swiping');
        frontElement.style.transition = 'none';
    };

    const handleTouchMove = (e) => {
        if (!gestureState.activeItem) return;
        const touch = Array.from(e.touches).find(t => t.identifier === gestureState.touchId);
        if (!touch) return;

        const deltaX = touch.clientX - gestureState.startX;
        const deltaY = Math.abs(touch.clientY - gestureState.startY);

        if (!gestureState.isSwiping && deltaY > 15) {
            resetSwipeState();
            return;
        }

        if (Math.abs(deltaX) > 10) {
            gestureState.isSwiping = true;
            if (e.cancelable) e.preventDefault();
        }

        if (gestureState.isSwiping) {
            if (deltaX > 20) { // Swipe Right
                gestureState.activeItem.style.transform = `translateX(${deltaX - 20}px)`;
                gestureState.activeItem.style.opacity = Math.max(0.7, 1 - (deltaX / 400));
            } else if (deltaX < -20) { // Swipe Left
                gestureState.activeItem.style.transform = `translateX(${deltaX + 20}px)`;
                gestureState.activeItem.style.opacity = Math.max(0.7, 1 - (Math.abs(deltaX) / 400));
            }
        }
    };

    const handleTouchEnd = (e) => {
        if (!gestureState.activeItem) return;
        const touch = Array.from(e.changedTouches).find(t => t.identifier === gestureState.touchId);
        if (!touch) {
            resetSwipeState();
            return;
        }

        const diffX = touch.clientX - gestureState.startX;
        const threshold = 120;

        gestureState.activeItem.style.transition = 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s';

        if (diffX > threshold) {
            // Edit Action
            haptic(40);
            gestureState.activeItem.style.transform = 'translateX(100%)';
            gestureState.activeItem.style.opacity = '0';
            setTimeout(() => {
                const id = gestureState.wrapper.dataset.id;
                openInvestSheet(id);
                renderAll(); // Restore item
            }, 300);
        } else if (diffX < -threshold) {
            // Delete Action
            haptic(60);
            gestureState.activeItem.style.transform = 'translateX(-100%)';
            gestureState.activeItem.style.opacity = '0';
            setTimeout(() => {
                const id = gestureState.wrapper.dataset.id;
                window.editInvId = id;
                deleteInvestment();
                renderAll(); // Restore item if cancelled
            }, 300);
        } else {
            gestureState.activeItem.style.transform = 'translateX(0px)';
            gestureState.activeItem.style.opacity = '1';
        }

        gestureState.activeItem = null;
        gestureState.isSwiping = false;
    };

    const resetSwipeState = () => {
        if (gestureState.activeItem) {
            gestureState.activeItem.classList.remove('swiping');
            gestureState.activeItem.style.transition = 'transform 0.3s cubic-bezier(0.2, 0, 0, 1)';
        }
        gestureState.activeItem = null;
        gestureState.isSwiping = false;
        gestureState.touchId = null;
    };

    cE.addEventListener('touchstart', handleTouchStart, { passive: true });
    cE.addEventListener('touchmove', handleTouchMove, { passive: false });
    cE.addEventListener('touchend', handleTouchEnd, { passive: true });
}

// ==========================================
// 7. MODULES (GOALS, FIRE, CATS, SETTINGS)
// ==========================================
function openGoalSheet(id = null) {
    haptic(30);
    window.editGoalId = id;
    if (id) {
        let g = db.goals.find(g => String(g.id) === String(id));
        if (!g) return;
        document.getElementById('goal-name').value = g.name;
        document.getElementById('goal-target').value = g.target;
        document.getElementById('goal-saved').value = g.saved;
        document.getElementById('goal-link').value = g.linkedCategory || '';
        document.getElementById('del-goal-btn').style.display = 'block';
    } else {
        document.getElementById('goal-name').value = '';
        document.getElementById('goal-target').value = '';
        document.getElementById('goal-saved').value = '';
        document.getElementById('goal-link').value = '';
        document.getElementById('del-goal-btn').style.display = 'none';
    }
    openSheet('goal-sheet');
}
function saveGoal() {
    haptic(40);
    let name = document.getElementById('goal-name').value;
    let target = parseFloat(document.getElementById('goal-target').value);
    let saved = parseFloat(document.getElementById('goal-saved').value) || 0;
    let link = document.getElementById('goal-link').value;
    if (!name || isNaN(target)) return showSnackbar("Name and Target required", "error");
    let newGoal = { id: editGoalId || Date.now(), name, target, saved, linkedCategory: link };
    if (editGoalId) {
        let idx = db.goals.findIndex(g => String(g.id) === String(editGoalId));
        if (idx > -1) {
            db.goals[idx] = newGoal;
        } else {
            db.goals.push(newGoal);
        }
    } else {
        db.goals.push(newGoal);
    }
    saveData();
    closeOverlays();
    renderAll();
    showSnackbar("Goal Saved!", "flag");
    window.editGoalId = null;
}
function openFIRESheet() {
    haptic(30);
    document.getElementById('fire-expenses').value = db.fireTargetMonthly || '';
    openSheet('fire-sheet');
}
function saveFIRE() { haptic(40); db.fireTargetMonthly = parseFloat(document.getElementById('fire-expenses').value) || 0; saveData(); closeOverlays(); renderAll(); showSnackbar("FIRE Target Updated"); }

function deleteGoal() {
    if (!window.editGoalId) return;
    haptic(40);
    Swal.fire({
        title: 'Delete Goal?',
        text: 'This will permanently remove your goal and progress tracking.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: 'var(--md-error)',
        confirmButtonText: 'Yes, delete it',
        customClass: { popup: 'swal2-popup', confirmButton: 'swal2-confirm', cancelButton: 'swal2-cancel' }
    }).then(r => {
        if (r.isConfirmed) {
            db.goals = db.goals.filter(g => String(g.id) !== String(window.editGoalId));
            saveData();
            closeOverlays();
            renderAll();
            showSnackbar('Goal deleted');
            window.editGoalId = null;
        } else {
            window.editGoalId = null;
        }
    });
}

function openCategoryDetails(type) {
    haptic(30); window.activeCategory = type; let meta = db.categories[type] || { icon: 'savings', color: '#8D6E63' };
    document.getElementById('cat-sheet-title').innerHTML = `<span class="material-symbols-rounded" style="color:${escapeHtml(meta.color)};">${escapeHtml(meta.icon)}</span> ${escapeHtml(type)} Portfolio`;
    document.getElementById('cat-target-alloc').value = db.allocTargets[type] || ''; document.getElementById('cat-cmv-input').value = db.currentMarketValues[type] || ''; document.getElementById('cat-initial-bal').value = db.categoryDetails[type]?.initialBal || ''; document.getElementById('cat-interest-rate').value = db.categoryDetails[type]?.interestRate || '';

    let filtered = db.investments.filter(i => i.type === type && (window.activeAccountFilter === 'All' || i.account === window.activeAccountFilter));
    let now = new Date(); let stcgTotal = 0, ltcgTotal = 0, assets = {}, totalInvested = 0;

    if (db.categoryDetails[type]?.initialBal) { totalInvested += db.categoryDetails[type].initialBal; ltcgTotal += db.categoryDetails[type].initialBal; assets["Earlier Balance (Initial)"] = db.categoryDetails[type].initialBal; }

    filtered.forEach(i => {
        let key = i.note || "General"; if (!assets[key]) assets[key] = 0;
        assets[key] += i.amount; totalInvested += i.amount; let days = (now - new Date(i.date)) / (1000 * 60 * 60 * 24); if (days <= 365) stcgTotal += i.amount; else ltcgTotal += i.amount;
    });

    let totalTaxBase = stcgTotal + ltcgTotal;
    ['tax-lt-fill','tax-st-fill','tax-lt-label','tax-st-label'].forEach(id => { if (!document.getElementById(id)) return; });
    if (totalTaxBase > 0) {
        const ltFill = document.getElementById('tax-lt-fill'); if (ltFill) ltFill.style.width = (ltcgTotal / totalTaxBase * 100) + '%';
        const stFill = document.getElementById('tax-st-fill'); if (stFill) stFill.style.width = (stcgTotal / totalTaxBase * 100) + '%';
        const ltLabel = document.getElementById('tax-lt-label'); if (ltLabel) ltLabel.innerText = `LTCG (>1Y): ${formatMoney(ltcgTotal)}`;
        const stLabel = document.getElementById('tax-st-label'); if (stLabel) stLabel.innerText = `STCG (<1Y): ${formatMoney(stcgTotal)}`;
    } else {
        const ltFill = document.getElementById('tax-lt-fill'); if (ltFill) ltFill.style.width = '0%';
        const stFill = document.getElementById('tax-st-fill'); if (stFill) stFill.style.width = '0%';
    }

    let assetHtml = "";
    Object.keys(assets).sort((a, b) => assets[b] - assets[a]).forEach(k => {
        let perc = totalInvested > 0 ? ((assets[k] / totalInvested) * 100).toFixed(1) : 0;
        assetHtml += `<div class="unified-item"><div class="unified-title" style="flex:1;"><span class="title-text">${escapeHtml(k)}</span> <span style="font-size:11px;color:var(--md-outline);margin-left:6px;flex-shrink:0;">${perc}%</span></div><div class="price">${formatMoney(assets[k])}</div></div>`;
    });
    document.getElementById('cat-asset-list').innerHTML = assetHtml || '<div style="color:var(--md-outline);font-size:14px;text-align:center;padding:16px;">No assets found.</div>';
    renderListToContainer(filtered.sort((a, b) => parseDate(b.date) - parseDate(a.date)), 'cat-history-list');

    // Load field configuration checkboxes
    const fieldConfig = db.categoryDetails[type]?.fields || {};
    const allFieldIds = ['interest', 'payout', 'maturity', 'sipday', 'mf', 'qty', 'broker', 'subcat', 'monthly', 'simple', 'growth'];
    allFieldIds.forEach(fid => {
        const el = document.getElementById('cfg-' + fid);
        if (el) el.checked = !!fieldConfig[fid];
    });

    openSheet('category-sheet');

    setTimeout(() => { renderCategoryChart(type); }, 300);
}

function saveCatSettings() {
    haptic(40);
    let cmv = parseFloat(document.getElementById('cat-cmv-input').value);
    let alloc = parseFloat(document.getElementById('cat-target-alloc').value);
    let initialBal = parseFloat(document.getElementById('cat-initial-bal').value);
    let intRate = parseFloat(document.getElementById('cat-interest-rate').value);

    if (!db.categoryDetails[window.activeCategory]) db.categoryDetails[window.activeCategory] = {};
    if (!isNaN(cmv)) db.currentMarketValues[window.activeCategory] = cmv; else delete db.currentMarketValues[window.activeCategory];
    if (!isNaN(alloc)) db.allocTargets[window.activeCategory] = alloc; else delete db.allocTargets[window.activeCategory];

    db.categoryDetails[window.activeCategory].initialBal = !isNaN(initialBal) ? initialBal : 0;
    db.categoryDetails[window.activeCategory].interestRate = !isNaN(intRate) ? intRate : 0;

    // Save field configurations - preserve all fields including those not in UI yet
    const fields = {};
    const fieldIds = ['interest', 'payout', 'maturity', 'sipday', 'mf', 'qty', 'broker', 'subcat', 'monthly', 'simple', 'growth'];
    fieldIds.forEach(fid => {
        const el = document.getElementById('cfg-' + fid);
        if (el) fields[fid] = el.checked;
    });
    db.categoryDetails[window.activeCategory].fields = fields;

    saveData(); renderAll(); showSnackbar("Settings Saved", "check_circle"); closeOverlays();
}

// Call this function when loading the settings UI tab panel
function loadUserProfileSettings() {
    if (db.userProfile) {
        if(document.getElementById('settings-salary')) document.getElementById('settings-salary').value = db.userProfile.salary || '';
        
        const dobInput = document.getElementById('profile-dob');
        if (dobInput) {
            dobInput.value = db.userProfile.dob || '';
            updateCalculatedAgeDisplay(); // Instantly show computed age metric
        }
    }
}

// Age calculation controller logic
function updateCalculatedAgeDisplay() {
    const dobValue = document.getElementById('profile-dob').value;
    const label = document.getElementById('calculated-age-label');
    if (!label) return;

    if (!dobValue) {
        label.innerText = "Age: Not set";
        return;
    }

    const birthDate = new Date(dobValue);
    const difference = Date.now() - birthDate.getTime();
    const ageDate = new Date(difference); 
    const calculatedAge = Math.abs(ageDate.getUTCFullYear() - 1970);

    label.innerText = `Age: ${calculatedAge} years old`;
}

function saveProfileSettings() {
    haptic(40);
    const getVal = id => document.getElementById(id)?.value;
    db.userProfile.salary = parseFloat(getVal('settings-salary')) || 0;
    db.userProfile.regime = getVal('settings-regime') || 'new';
    db.userProfile.monthlyExpense = parseFloat(getVal('settings-expenses')) || 0;
    db.fyStartMonth = parseInt(getVal('settings-fy-start'), 10) || 3;
    db.currency = getVal('settings-display-currency') || 'INR';
    db.displayCurrency = getVal('settings-display-currency') || 'INR';
    db.currencySymbol = getVal('settings-currency') || '₹';
    db.userProfile.dob = getVal('profile-dob') || '';
    db.userProfile.creditScore = parseInt(getVal('settings-credit-score'), 10) || null;
    db.userProfile.riskTolerance = getVal('settings-risk') || 'moderate';
    db.userProfile.dependents = parseInt(getVal('settings-dependents'), 10) || 0;
    db.userProfile.primaryGoal = getVal('settings-primary-goal') || '';
    
    // Toggles are saved instantly via saveToggleState, but as a fallback:
    const plannerEl = document.getElementById('settings-enable-planner');
    if(plannerEl) db.enableMonthlyPlanner = plannerEl.checked;
    const spendEl = document.getElementById('settings-enable-spend-tracker');
    if(spendEl) db.enableSpendTracker = spendEl.checked;
    const aiToggle = document.getElementById('settings-ai-toggle');
    if (aiToggle) { db.aiEnabled = aiToggle.checked; window.__aiEnabled = db.aiEnabled; }
    const webToggle = document.getElementById('settings-web-toggle');
    if (webToggle) { db.webEnabled = webToggle.checked; window.__webEnabled = db.webEnabled; }

    saveData(); renderAll(); showSnackbar("Profile & Preferences Updated", "check_circle");
}

function saveToggleState(type, isChecked) {
    haptic(20);
    if (type === 'planner') {
        db.enableMonthlyPlanner = isChecked;
    } else if (type === 'spend') {
        db.enableSpendTracker = isChecked;
    } else if (type === 'ai') {
        db.aiEnabled = isChecked;
        window.__aiEnabled = isChecked;
    } else if (type === 'web') {
        db.webEnabled = isChecked;
        window.__webEnabled = isChecked;
    }
    saveData();
    // Render silently or show brief toast if requested
    // showSnackbar("Preference saved"); 
}

function openMonthDetails(offset) {
    haptic(30); let now = new Date(); let m = now.getMonth(); let y = now.getFullYear(); let filtered = [];
    if (offset === 'tax') {
        document.getElementById('month-sheet-title').innerHTML = `<span class="material-symbols-rounded" style="color:var(--md-success);">receipt_long</span> 80C Tax Savings`;
        filtered = db.investments.filter(i => db.categories[i.type] && db.categories[i.type].is80c && isCurrentFY(i.date) && (activeAccountFilter === 'All' || i.account === activeAccountFilter));
    } else {
        if (offset === 1) { if (m === 0) { m = 11; y = y - 1; } else { m = m - 1; } }
        let monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        document.getElementById('month-sheet-title').innerHTML = `<span class="material-symbols-rounded" style="color:var(--md-primary);">calendar_month</span> ${monthNames[m]} ${y}`;
        filtered = db.investments.filter(i => {
            let d = parseDate(i.date);
            return d.getMonth() === m && d.getFullYear() === y && (activeAccountFilter === 'All' || i.account === activeAccountFilter);
        });
    }
    renderListToContainer(filtered.sort((a, b) => parseDate(b.date) - parseDate(a.date)), 'month-history-list');
    openSheet('month-sheet');
}

function openSettings() {
    haptic(30);
    closeOverlays();
    loadUserProfileSettings();

    // Map DOM IDs to their values (optimized without 20 if-checks)
    const formValues = {
        'settings-salary': db.userProfile.salary || 0,
        'settings-regime': db.userProfile.regime || 'new',
        'settings-expenses': db.userProfile.monthlyExpense || 0,
        'settings-fy-start': db.fyStartMonth || 3,
        'settings-currency': db.currencySymbol || '₹',
        'settings-display-currency': db.displayCurrency || 'INR',
        'settings-pin': db.appPin || '',
        'gemini-api-key': db.geminiKey || '',
        'groq-api-key': db.groqKey || '',
        'openrouter-api-key': db.openrouterKey || '',
        'cerebras-api-key': db.cerebrasKey || '',
        'github-api-key': db.githubKey || '',
        'profile-dob': db.userProfile.dob || '',
        'settings-credit-score': db.userProfile.creditScore || '',
        'settings-risk': db.userProfile.riskTolerance || 'moderate',
        'settings-dependents': db.userProfile.dependents || 0,
        'settings-primary-goal': db.userProfile.primaryGoal || ''
    };

    for (const [id, value] of Object.entries(formValues)) {
        const el = document.getElementById(id);
        if (el) el.value = value;
    }

    const toggles = {
        'use-biometric-toggle': db.useBiometric || false,
        'settings-enable-planner': db.enableMonthlyPlanner !== false,
        'settings-enable-spend-tracker': db.enableSpendTracker !== false,
        'settings-ai-toggle': db.aiEnabled !== false,
        'settings-web-toggle': db.webEnabled !== false
    };

    for (const [id, checked] of Object.entries(toggles)) {
        const el = document.getElementById(id);
        if (el) el.checked = checked;
    }

    // Refresh manage sections
    renderSettingsSections();

    // Load notification preferences
    loadNotificationPrefs();

    // Update settings UI with helpful tips
    updateSettingsHelpText();

    openSheet('settings-sheet');
}

function loadNotificationPrefs() {
    const prefs = db.userPreferences || {};
    document.querySelectorAll('.notif-toggle').forEach(cb => {
        const key = cb.dataset.key;
        if (key in prefs) cb.checked = prefs[key];
    });
    const master = document.getElementById('notif-master-toggle');
    const prefsEl = document.getElementById('notif-preferences');
    if (master && prefsEl) {
        master.checked = Notification.permission === 'granted';
        prefsEl.style.opacity = master.checked ? '1' : '0.4';
        prefsEl.style.pointerEvents = master.checked ? 'auto' : 'none';
    }
    const statusText = document.getElementById('notif-status-text');
    if (statusText) {
        if (Notification.permission === 'granted') statusText.textContent = '✓ Notifications active';
        else if (Notification.permission === 'denied') statusText.textContent = '✗ Notifications blocked in browser';
        else statusText.textContent = 'Requires browser permission';
    }
    // Save on toggle change
    document.querySelectorAll('.notif-toggle').forEach(cb => {
        cb.onchange = function() {
            if (!db.userPreferences) db.userPreferences = {};
            db.userPreferences[this.dataset.key] = this.checked;
            saveData();
        };
    });
}

function toggleNotificationMaster(checked) {
    if (!('Notification' in window)) return;
    if (checked) {
        if (Notification.permission === 'granted') {
            enableNotifPrefs(true);
            return;
        }
        Notification.requestPermission().then(perm => {
            if (perm === 'granted') {
                enableNotifPrefs(true);
            } else {
                document.getElementById('notif-master-toggle').checked = false;
                showSnackbar('Notification permission denied', 'error');
            }
        });
    } else {
        enableNotifPrefs(false);
    }
}

function enableNotifPrefs(enabled) {
    const prefsEl = document.getElementById('notif-preferences');
    if (prefsEl) {
        prefsEl.style.opacity = enabled ? '1' : '0.4';
        prefsEl.style.pointerEvents = enabled ? 'auto' : 'none';
    }
    const statusText = document.getElementById('notif-status-text');
    if (statusText) statusText.textContent = enabled ? '✓ Notifications active' : 'Notifications paused';
    // If disabling, reset master toggle state too
    if (!enabled) {
        document.querySelectorAll('.notif-toggle').forEach(cb => cb.checked = false);
    }
    if (!db.userPreferences) db.userPreferences = {};
    Object.assign(db.userPreferences, { sipReminders: enabled, maturityAlerts: enabled, goalProgressUpdates: enabled, weeklyDigest: false, priceAlerts: false });
    document.querySelectorAll('.notif-toggle').forEach(cb => {
        cb.checked = db.userPreferences[cb.dataset.key] || false;
    });
    saveData();
}

function switchSettingsTab(tabName, btn) {
    haptic(20);
    // Update tab buttons
    const tabs = document.querySelectorAll('.s-tab');
    tabs.forEach(t => t.classList.remove('active'));
    btn.classList.add('active');

    // Update tab contents
    const contents = document.querySelectorAll('.s-tab-content');
    contents.forEach(c => c.style.display = 'none');
    document.getElementById('stab-' + tabName).style.display = 'block';

    // Reset scroll
    document.getElementById('settings-content-scroll').scrollTop = 0;
}

function updateSettingsHelpText() {
    // Add/Update help text for various settings
    const helpTexts = [
        { id: 'salary-help', text: 'Used to calculate savings rate and tax estimates', after: 'settings-salary' },
        { id: 'pin-help', text: '4-digit PIN for app lock. Leave empty to disable.', after: 'settings-pin' },
        { id: 'api-help', text: 'Get keys: Groq (console.groq.com), Gemini (aistudio.google.com), OpenRouter (openrouter.ai/keys), Cerebras (cloud.cerebras.ai), GitHub Models (github.com/settings/tokens)', after: 'gemini-api-key' }
    ];

    helpTexts.forEach(help => {
        let el = document.getElementById(help.id);
        const target = document.getElementById(help.after);
        if (target && !el) {
            el = document.createElement('div');
            el.id = help.id;
            el.style.cssText = 'font-size:11px;color:var(--md-outline);margin-top:4px;margin-bottom:12px;';
            el.textContent = help.text;
            target.parentNode.insertBefore(el, target.nextSibling);
        }
    });
}

function renderSettingsSections() {
    // Accounts section
    let accHtml = `<div style="margin-bottom:12px;padding:12px;background:var(--md-surface-container-highest);border-radius:12px;">
        <div style="font-size:11px;font-weight:600;color:var(--md-outline);margin-bottom:6px;">Active Filter</div>
        <select class="account-selector" id="settings-account-filter" onchange="changeAccountFilter(this.value)" style="width:100%;max-width:100%;background:var(--md-surface);">
            <option value="All" ${db.activeAccountFilter === 'All' ? 'selected' : ''}>All Accounts</option>
            ${db.accounts.map(a => `<option value="${escapeHtml(a)}" ${db.activeAccountFilter === a ? 'selected' : ''}>${escapeHtml(a)}</option>`).join('')}
        </select>
    </div>`;
    db.accounts.forEach((a, idx) => {
        let delBtn = idx === 0 ? '' : `<span class="material-symbols-rounded" style="color:var(--md-error);font-size:16px;cursor:pointer;" onclick="deleteAccount(this.dataset.val)" data-val="${escapeHtml(a)}">delete</span>`;
        accHtml += `<div style="display:flex;justify-content:space-between;padding:12px;background:var(--md-surface-container-highest);border-radius:12px;"><span>${escapeHtml(a)}</span>${delBtn}</div>`;
    });
    let accList = document.getElementById('account-list');
    if (accList) accList.innerHTML = accHtml;

    // Categories section
    let catHtml = "";
    if (db.categories && Object.keys(db.categories).length > 0) {
        Object.keys(db.categories).forEach(c => {
            let isDefault = (typeof defaultCategories !== 'undefined') ? defaultCategories.includes(c) : ['FD', 'PPF', 'PF', 'SIP', 'Liquid', 'Home', 'Cash', 'Stocks'].includes(c);
            let cat = db.categories[c];
            if (!cat.targetMultiplier) cat.targetMultiplier = 0;

            let safeColor = escapeHtml(cat?.color || '#ccc');
            let safeIcon = escapeHtml(cat?.icon || 'help');
            let delBtn = `<span style="display:flex;align-items:center;gap:8px;">
                    ${isDefault ? '<span style="font-size:10px;color:var(--md-outline);">Default</span>' : ''}
                    <span class="material-symbols-rounded" style="color:var(--md-error);font-size:16px;cursor:pointer;" onclick="deleteCategory(this.dataset.val)" data-val="${escapeHtml(c)}" title="Delete category">delete</span>
                </span>`;

            catHtml += `
        <div style="padding:12px;background:var(--md-surface-container-highest);border-radius:12px;margin-bottom:8px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                <span><span class="material-symbols-rounded" style="font-size:16px;color:${safeColor};vertical-align:text-bottom;margin-right:6px;">${safeIcon}</span>${escapeHtml(c)}</span>
                ${delBtn}
            </div>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px;">
                <div class="input-container" style="margin-bottom:0;">
                    <label style="font-size:10px;">Target (x Expense)</label>
                    <input type="number" step="0.1" value="${cat.targetMultiplier || ''}" placeholder="e.g. 6" class="md-input" style="padding:4px 8px;font-size:12px;" onchange="updateCategorySetting(this.dataset.cat, 'targetMultiplier', this.value)" data-cat="${escapeHtml(c)}">
                </div>
            </div>
        </div>`;
        });
    } else {
        catHtml = `<div style="text-align:center; padding:20px; color:var(--md-outline); font-size:13px;">
            <span class="material-symbols-rounded" style="font-size:32px; display:block; margin-bottom:8px;">category</span>
            No categories defined. Add one below.
        </div>`;
    }
    let catList = document.getElementById('category-crud-list');
    if (catList) catList.innerHTML = catHtml;

    // Badges section
    const badgeSym = db.currency && db.currency !== 'INR' ? (db.currencySymbol || db.currency + ' ') : '₹';
    let badgeHtml = "";
    milestoneThresholds.forEach(t => {
        let unlocked = db.milestones.includes(t.val);
        if (unlocked) badgeHtml += `<div class="badge-item"><span class="material-symbols-rounded">workspace_premium</span> ${badgeSym}${t.label}</div>`;
        else badgeHtml += `<div class="badge-item locked"><span class="material-symbols-rounded">lock</span> ${badgeSym}${t.label}</div>`;
    });
    let badgeGrid = document.getElementById('badge-grid');
    if (badgeGrid) badgeGrid.innerHTML = badgeHtml;
}

function changeAccountFilter(val) {
    db.activeAccountFilter = val;
    window.activeAccountFilter = val;
    saveData();
    renderAll();
    // Scroll to the bottom of settings so the user sees the change
    setTimeout(() => {
        let scrollEl = document.getElementById('settings-content-scroll');
        if (scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight;
    }, 100);
}
window.changeAccountFilter = changeAccountFilter;
window.toggleNotificationMaster = toggleNotificationMaster;
window.loadNotificationPrefs = loadNotificationPrefs;
window.saveToggleState = saveToggleState;

function updateCategorySetting(cat, key, val) {
    if (!db.categories[cat]) return;
    if (key === 'targetMultiplier') db.categories[cat][key] = parseFloat(val) || 0;
    else db.categories[cat][key] = val;
    saveData();
    // No full re-render here to avoid losing focus on input
}

function saveApiKeys() { db.geminiKey = document.getElementById('gemini-api-key').value.trim(); db.groqKey = document.getElementById('groq-api-key').value.trim(); db.openrouterKey = document.getElementById('openrouter-api-key').value.trim(); db.cerebrasKey = document.getElementById('cerebras-api-key').value.trim(); db.githubKey = document.getElementById('github-api-key').value.trim(); saveData(); showSnackbar("API Keys Saved", "key"); }
function addAccount() { haptic(40); let name = sanitizeText(document.getElementById('new-acc-name').value.trim()); if (name && !db.accounts.includes(name)) { db.accounts.push(name); document.getElementById('new-acc-name').value = ''; saveData(); initUI(); openSettings(); showSnackbar("Account Added"); } }
function deleteAccount(name) { haptic(40); Swal.fire({ title: `Delete Account '${name}'?`, text: "Entries will remain but lose association.", showCancelButton: true }).then(r => { if (r.isConfirmed) { db.accounts = db.accounts.filter(a => a !== name); saveData(); initUI(); openSettings(); renderAll(); } }); }
function addCustomCategory() {
    haptic(40);
    const nameInput = document.getElementById('new-cat-name');
    const name = sanitizeText(nameInput.value.trim());
    const template = document.getElementById('new-cat-template').value;
    if (!name) return;

    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    const colors = ['#6750A4', '#B3261E', '#D96200', '#0288D1', '#388E3C', '#006874', '#9C27B0'];
    const color = colors[Math.abs(hash) % colors.length];

    // Add to categories
    db.categories[name] = {
        icon: template === 'stock' ? 'trending_up' : (template === 'fd' ? 'account_balance' : 'category'),
        color: color,
        is80c: false
    };

    // Add field configuration based on template
    if (!db.categoryDetails[name]) db.categoryDetails[name] = {};

    const fields = {
        flat: { simple: true },
        fd: { interest: true, payout: true, maturity: true, broker: true, subcat: true },
        sip: { mf: true, sipday: true, monthly: true, broker: true, subcat: true },
        stock: { mf: true, qty: true, broker: true, subcat: true },
        growth: { growth: true }
    };

    db.categoryDetails[name].fields = fields[template] || {};

    nameInput.value = '';
    saveData();
    initUI();
    openSettings();
    showSnackbar(`Added Category: ${name} with ${template} template`);
}
function deleteCategory(name) {
    haptic(40);
    if (!db.categories || Object.keys(db.categories).length <= 1) {
        showSnackbar("At least one investment category must remain.", "warning");
        return;
    }

    const available = Object.keys(db.categories).filter(c => c !== name);
    let options = {};
    available.forEach(c => options[c] = c);

    Swal.fire({
        title: `Delete '${name}'?`,
        text: `Choose where to move existing investments from this category. This action cannot be undone.`,
        icon: 'warning',
        input: 'select',
        inputOptions: options,
        inputPlaceholder: 'Select fallback category',
        showCancelButton: true,
        confirmButtonColor: 'var(--md-error)',
        confirmButtonText: 'Yes, delete and move',
        inputValidator: (value) => {
            return new Promise((resolve) => {
                if (value) { resolve() }
                else { resolve('You need to select a fallback category') }
            })
        }
    }).then(r => {
        if (r.isConfirmed && r.value) {
            const fallback = r.value;
            db.investments.forEach(i => { if (i.type === name) i.type = fallback; });
            if (window.currentInvType === name) window.currentInvType = fallback;
            if (window.activeCategory === name) window.activeCategory = fallback;
            delete db.categories[name];
            if (db.categoryDetails && db.categoryDetails[name]) delete db.categoryDetails[name];
            saveData();
            initUI();
            renderSettingsSections();
            renderAll();
            showSnackbar(`Category '${name}' deleted`);
        }
    });
}

// savePin() defined in app_part1.js (removed weaker duplicate)
async function toggleBiometric() {
    const toggle = document.getElementById('use-biometric-toggle');
    if (toggle.checked) {
        const success = await registerBiometric();
        if (!success) {
            toggle.checked = false;
            db.useBiometric = false;
            showSnackbar("Biometric registration failed. Please try again.", "error");
        } else {
            db.useBiometric = true;
            showSnackbar("Biometric Enabled Successfully");
        }
    } else {
        db.useBiometric = false;
        db.biometricCredentialId = null;
        showSnackbar("Biometric Disabled");
    }
    saveData();
}

async function registerBiometric() {
    if (!window.PublicKeyCredential) return false;

    // Check if platform authenticator is available
    const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    if (!available) {
        showSnackbar("Platform biometric not available", "warning");
        return false;
    }

    try {
        const challenge = new Uint8Array(32);
        window.crypto.getRandomValues(challenge);
        const userId = new Uint8Array(16);
        window.crypto.getRandomValues(userId);

        const cred = await navigator.credentials.create({
            publicKey: {
                challenge,
                rp: { name: "TrackInvest" },
                user: {
                    id: userId,
                    name: "user@trackinvest",
                    displayName: "TrackInvest User"
                },
                pubKeyCredParams: [{ alg: -7, type: "public-key" }, { alg: -257, type: "public-key" }],
                authenticatorSelection: {
                    authenticatorAttachment: "platform",
                    userVerification: "required",
                    residentKey: "preferred"
                },
                timeout: 60000
            }
        });

        if (cred) {
            // Store rawId as base64
            db.biometricCredentialId = btoa(String.fromCharCode(...new Uint8Array(cred.rawId)));
            return true;
        }
    } catch (e) {
        console.error("Biometric registration error:", e);
        return false;
    }
    return false;
}

// App Lock System with Biometric, PIN fallback, rate limiting, and auto-lock
let appLockState = {
    failedAttempts: 0,
    lockoutEndTime: null,
    lastActivity: Date.now(),
    autoLockTimer: null
};

const LOCKOUT_DURATION = 5 * 60 * 1000; // 5 minutes
const MAX_ATTEMPTS = 5;
const AUTO_LOCK_DELAY = 5 * 60 * 1000; // 5 minutes of inactivity

async function checkAppLock() {
    if (!db.appPin) {
        hideLockScreen();
        return true;
    }

    // Check if already unlocked in this session
    let appUnlocked = false;
    try { appUnlocked = sessionStorage.getItem('appUnlocked') === 'true'; } catch (e) {}
    if (appUnlocked) {
        hideLockScreen();
        startAutoLockTimer();
        return true;
    }

    // Check lockout
    if (appLockState.lockoutEndTime && Date.now() < appLockState.lockoutEndTime) {
        const remaining = Math.ceil((appLockState.lockoutEndTime - Date.now()) / 1000);
        updateLockScreenMessage(`Too many attempts. Try again in ${remaining}s`);
        showLockScreen();
        return false;
    }

    showLockScreen();

    // Try biometric first if enabled
    if (db.useBiometric && window.PublicKeyCredential) {
        try {
            const result = await attemptBiometricAuth();
            if (result) {
                unlockSuccess();
                return true;
            }
        } catch (e) {

        }
    }

    // Focus PIN input for manual entry
    setTimeout(() => {
        const pinInput = document.getElementById('pin-input-auth');
        if (pinInput) pinInput.focus();
    }, 300);

    return false;
}
window.checkAppLock = checkAppLock;

async function attemptBiometricAuth() {
    if (!db.biometricCredentialId || !window.PublicKeyCredential) return false;

    try {
        const challenge = new Uint8Array(32);
        window.crypto.getRandomValues(challenge);

        // Convert base64 back to Uint8Array
        const rawIdStr = atob(db.biometricCredentialId);
        const rawId = new Uint8Array(rawIdStr.length);
        for (let i = 0; i < rawIdStr.length; i++) {
            rawId[i] = rawIdStr.charCodeAt(i);
        }

        const cred = await navigator.credentials.get({
            publicKey: {
                challenge,
                allowCredentials: [{
                    id: rawId,
                    type: 'public-key'
                }],
                userVerification: 'required',
                timeout: 30000
            }
        });
        return !!cred;
    } catch (e) {
        console.error("Biometric auth error:", e);
        // If it's a specific error like NotFoundError, it might mean the credential was deleted from device
        return false;
    }
}

function showLockScreen() {
    const lockScreen = document.getElementById('app-lock-screen');
    if (!lockScreen) return;

    // Update lock screen UI with biometric option if available
    const biometricBtn = document.getElementById('biometric-auth-btn') || createBiometricButton();

    lockScreen.style.display = 'flex';
    lockScreen.classList.add('active');

    // Update message based on state
    updateLockScreenMessage('Enter your 4-digit PIN');
}

function hideLockScreen() {
    const lockScreen = document.getElementById('app-lock-screen');
    if (lockScreen) {
        lockScreen.style.display = 'none';
        lockScreen.classList.remove('active');
    }
}

function createBiometricButton() {
    const btn = document.createElement('button');
    btn.id = 'biometric-auth-btn';
    btn.className = 'icon-btn';
    btn.style.cssText = 'width:56px;height:56px;border-radius:50%;background:var(--md-primary-container);margin-top:16px;';
    btn.innerHTML = '<span class="material-symbols-rounded" style="font-size:28px;color:var(--md-primary);">fingerprint</span>';
    btn.onclick = async () => {
        const result = await attemptBiometricAuth();
        if (result) {
            unlockSuccess();
        } else {
            showSnackbar('Biometric authentication failed', 'error');
        }
    };

    const lockScreen = document.getElementById('app-lock-screen');
    if (lockScreen) {
        const pinSection = lockScreen.querySelector('div') || lockScreen;
        pinSection.appendChild(btn);
    }
    return btn;
}

function updateLockScreenMessage(msg) {
    const msgEl = document.getElementById('lock-screen-message');
    if (msgEl) {
        msgEl.textContent = msg;
    } else {
        const lockScreen = document.getElementById('app-lock-screen');
        if (lockScreen) {
            const h2 = lockScreen.querySelector('h2');
            const newMsg = document.createElement('div');
            newMsg.id = 'lock-screen-message';
            newMsg.style.cssText = 'font-size:14px;color:var(--md-error);margin:8px 0;text-align:center;';
            newMsg.textContent = msg;
            if (h2) h2.after(newMsg);
        }
    }
}

function unlockApp() {
    // Check lockout
    if (appLockState.lockoutEndTime && Date.now() < appLockState.lockoutEndTime) {
        const remaining = Math.ceil((appLockState.lockoutEndTime - Date.now()) / 1000);
        updateLockScreenMessage(`Locked. Try again in ${remaining}s`);
        haptic([100, 100, 100]);
        return;
    }

    let pin = document.getElementById('pin-input-auth').value;

    // Validate PIN format
    if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
        updateLockScreenMessage('Enter a valid 4-digit PIN');
        haptic([50, 50]);
        return;
    }

    if (pin === db.appPin) {
        unlockSuccess();
    } else {
        handleFailedAttempt();
    }
}

function unlockSuccess() {
    haptic(50);
    appLockState.failedAttempts = 0;
    appLockState.lockoutEndTime = null;
    try { sessionStorage.setItem('appUnlocked', 'true'); } catch (e) {}
    hideLockScreen();

    const pinInput = document.getElementById('pin-input-auth');
    if (pinInput) pinInput.value = '';

    updateLockScreenMessage('Enter your 4-digit PIN');

    // Restore last active sheet if any
    let lastSheet = null;
    try { lastSheet = sessionStorage.getItem('currentSheet'); } catch (e) {}
    if (lastSheet) {
        setTimeout(() => openSheet(lastSheet), 100);
    }

    startAutoLockTimer();
    showSnackbar('Welcome back!', 'check_circle');
}

function handleFailedAttempt() {
    appLockState.failedAttempts++;
    const remaining = MAX_ATTEMPTS - appLockState.failedAttempts;

    haptic([100, 50, 100]);

    if (remaining <= 0) {
        appLockState.lockoutEndTime = Date.now() + LOCKOUT_DURATION;
        updateLockScreenMessage(`Too many attempts. Locked for 5 minutes.`);
        showSnackbar('Too many failed attempts. App locked for 5 minutes.', 'error');
    } else {
        updateLockScreenMessage(`Incorrect PIN. ${remaining} attempts remaining.`);
        showSnackbar(`Incorrect PIN. ${remaining} attempts remaining.`, 'warning');
    }

    const pinInput = document.getElementById('pin-input-auth');
    if (pinInput) {
        pinInput.value = '';
        pinInput.classList.add('shake');
        setTimeout(() => pinInput.classList.remove('shake'), 500);
    }
}

function startAutoLockTimer() {
    if (appLockState.autoLockTimer) {
        clearTimeout(appLockState.autoLockTimer);
    }

    appLockState.lastActivity = Date.now();

    appLockState.autoLockTimer = setInterval(() => {
        if (Date.now() - appLockState.lastActivity > AUTO_LOCK_DELAY) {
            lockApp();
        }
    }, 30000); // Check every 30 seconds
}

function updateActivity() {
    appLockState.lastActivity = Date.now();
}

function lockApp() {
    try { sessionStorage.removeItem('appUnlocked'); } catch (e) {}
    checkAppLock();
    showSnackbar('App locked due to inactivity', 'info');
}

// Track user activity
['mousedown', 'keydown', 'touchstart', 'scroll'].forEach(event => {
    document.addEventListener(event, updateActivity, { passive: true });
});

window.unlockApp = unlockApp;
window.lockApp = lockApp;
// btoa() only accepts a binary string, but `String.fromCharCode(...bytes)` on
// large Uint8Arrays exceeds the JS engine argument-count limit and throws
// "Maximum call stack size exceeded" / RangeError. Chunked conversion avoids
// the issue for arbitrarily large encrypted payloads.
function _uint8ToBase64(bytes) {
    let binary = '';
    const chunk = 0x8000; // 32 KB at a time
    for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode.apply(
            null,
            bytes.subarray(i, Math.min(i + chunk, bytes.length))
        );
    }
    return btoa(binary);
}

function _base64ToUint8(b64) {
    const binary = atob(b64);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
}

async function encryptData(jsonStr, pin) {
    if (!pin) return btoa(encodeURIComponent(jsonStr));
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveKey']);
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(jsonStr));
    const buf = new Uint8Array(salt.length + iv.length + ct.byteLength);
    buf.set(salt, 0); buf.set(iv, salt.length); buf.set(new Uint8Array(ct), salt.length + iv.length);
    return 'ENC2:' + _uint8ToBase64(buf);
}
async function decryptData(encStr, pin) {
    if (encStr.startsWith('ENC2:')) {
        if (!pin) throw new Error('PIN required for decryption');
        const raw = _base64ToUint8(encStr.substring(5));
        const salt = raw.slice(0, 16); const iv = raw.slice(16, 28); const ct = raw.slice(28);
        const enc = new TextEncoder();
        const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveKey']);
        const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
        const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
        return new TextDecoder().decode(pt);
    }
    if (encStr.startsWith('ENC:')) {
        if (!pin) throw new Error('PIN required for decryption');
        let enc = atob(encStr.substring(4)); let dec = '';
        for (let i = 0; i < enc.length; i++) dec += String.fromCharCode(enc.charCodeAt(i) ^ pin.charCodeAt(i % pin.length));
        return decodeURIComponent(atob(dec));
    }
    return decodeURIComponent(atob(encStr));
}

async function exportData() {
    haptic(40);
    let encrypt = document.getElementById('encrypt-backup-toggle') ? document.getElementById('encrypt-backup-toggle').checked : false;
    if (encrypt && !db.appPin) { showSnackbar("Please set a PIN first to encrypt", "warning"); return; }

    let dataStr = JSON.stringify(db, null, 2);
    let finalData = encrypt ? await encryptData(dataStr, db.appPin) : dataStr;
    let ext = encrypt ? '.enc' : '.json';

    const blob = new Blob([finalData], { type: encrypt ? 'text/plain' : 'application/json' });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `Invest_Backup_${new Date().toISOString().split('T')[0]}${ext}`;
    a.click();
    closeOverlays();
    showSnackbar(encrypt ? "Encrypted Backup Downloaded" : "Backup Downloaded");
}

function restoreData(e) {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
        try {
            let content = event.target.result;
            let parsedStr = content;

            if (content.startsWith('ENC:') || content.startsWith('ENC2:')) {
                let pin = prompt("Enter PIN to decrypt backup:");
                if (!pin) { showSnackbar("Decryption cancelled", "error"); e.target.value = ''; return; }
                try {
                    parsedStr = await decryptData(content, pin);
                } catch (decErr) {
                    showSnackbar("Incorrect PIN or Corrupted Data", "error");
                    e.target.value = '';
                    return;
                }
            }

            let parsed = JSON.parse(parsedStr);
            if (!parsed.userProfile) parsed.userProfile = { salary: 0, regime: 'new' };
            // Deep merge/update db
            db.userProfile = parsed.userProfile;
            db.investments = parsed.investments || [];
            db.goals = parsed.goals || [];
            db.recurring = parsed.recurring || [];
            db.milestones = parsed.milestones || [];
            db.projectionNextMonth = parsed.projectionNextMonth || 0;
            db.categoryDetails = parsed.categoryDetails || parsed.categoryGoals || {};
            db.currentMarketValues = parsed.currentMarketValues || {};
            db.allocTargets = parsed.allocTargets || {};
            db.accounts = parsed.accounts && parsed.accounts.length > 0 ? parsed.accounts : ['Main Portfolio'];
            db.fireTargetMonthly = parsed.fireTargetMonthly || 0;
            db.templates = parsed.templates || [];
            db.privacyMode = typeof parsed.privacyMode !== 'undefined' ? parsed.privacyMode : false;
            db.theme = parsed.theme || db.theme || 'indigo';
            db.geminiKey = parsed.geminiKey || '';
            db.groqKey = parsed.groqKey || '';
            db.openrouterKey = parsed.openrouterKey || '';
            db.cerebrasKey = parsed.cerebrasKey || '';
            db.githubKey = parsed.githubKey || '';
            // Decrypt keys from _ek if plaintext not present but appPin matches
            if (!db.geminiKey && parsed._ek && db.appPin) {
                const parts = parsed._ek.split('|');
                if (parts.length >= 2) {
                    db.geminiKey = _decryptKey(parts[0], db.appPin) || '';
                    db.groqKey = _decryptKey(parts[1], db.appPin) || '';
                    if (parts.length >= 4) {
                        db.openrouterKey = _decryptKey(parts[2] || '', db.appPin) || '';
                        db.cerebrasKey = _decryptKey(parts[3] || '', db.appPin) || '';
                    }
                    if (parts.length >= 5) {
                        db.githubKey = _decryptKey(parts[4] || '', db.appPin) || '';
                    }
                }
            }
            db.appPin = parsed.appPin || '';
            db.useBiometric = parsed.useBiometric || false;
            db.chatHistory = parsed.chatHistory || [];
            db.chatSessions = parsed.chatSessions || [];
            db.lastBackupPrompt = parsed.lastBackupPrompt || '';
            db.navCache = parsed.navCache || {};
            db.spendTracker = parsed.spendTracker || { entries: [], aiCategoryCache: {} };
            db.monthlyPlans = parsed.monthlyPlans || {};
            db.aiMemory = parsed.aiMemory || {};

            if (parsed.categories && Object.keys(parsed.categories).length > 0) { db.categories = parsed.categories; }
            if (!db.settingsTable) db.settingsTable = { lastResetMonth: '' };

            saveData(); initUI(); renderAll(); closeOverlays();
            showSnackbar("Data Restored Successfully", "check_circle");
            e.target.value = '';
        } catch (err) {
            console.error(err);
            showSnackbar("Invalid or Corrupted Backup", "error");
        }
    };
    reader.readAsText(file);
}

// Legacy WebRTC functions removed — canonical implementation in app_part3.js

function importCSV(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            let text = e.target.result;
            let rows = text.split('\n'); let added = 0;
            for (let i = 1; i < rows.length; i++) {
                let cols = rows[i].match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || [];
                cols = cols.map(c => c.replace(/^"|"$/g, ''));
                if (cols.length >= 3 && cols[0] && !isNaN(parseFloat(cols[2]))) {
                    db.investments.push({ id: generateUniqueId(), date: cols[0].trim(), type: cols[1].trim() || 'Cash', amount: parseFloat(cols[2]), note: cols[3] ? cols[3].trim() : '', tags: cols[4] ? cols[4].trim() : '', account: activeAccountFilter === 'All' ? db.accounts[0] : activeAccountFilter });
                    added++;
                }
            }
            if (added > 0) {
                saveData(); renderAll(); closeOverlays();
                showSnackbar(`${added} Entries Imported!`, "check_circle");
            }
            else { showSnackbar("No valid rows found in CSV", "warning"); }
        }
        catch (err) { showSnackbar("Failed to parse CSV", "error"); }
    };
    reader.readAsText(file);
}

function checkDuplicates(newEntry) { let dups = db.investments.filter(i => i.date === newEntry.date && i.type === newEntry.type && i.amount === newEntry.amount && i.id !== newEntry.id); if (dups.length > 0) { showSnackbar("Possible duplicate entry detected!", "warning"); } }
function autoBackupReminder() { let now = new Date().toDateString(); if (db.lastBackupPrompt !== now && (new Date() - new Date(db.lastBackupPrompt || 0)) > 7 * 24 * 60 * 60 * 1000) { showSnackbar("Remember to backup your data! (Settings > Backup)", "cloud_download"); db.lastBackupPrompt = now; saveData(); } }
function dataCleanup() { Swal.fire({ title: 'Cleanup Old Entries', text: 'Enter cutoff date (YYYY-MM-DD) to remove entries older than that date.', input: 'text', showCancelButton: true }).then(res => { if (res.isConfirmed && res.value) { let cutoff = parseDate(res.value); let before = db.investments.length; db.investments = db.investments.filter(i => parseDate(i.date) >= cutoff); saveData(); renderAll(); showSnackbar(`Removed ${before - db.investments.length} entries.`); } }); }


// ==========================================
// 8. AI INTEGRATION (delegates to shared_ai.js)
// ==========================================
// Delegates to shared_ai.js
async function callAIApi(promptText, systemPrompt) {
    if (!window.__aiEnabled && window.__aiEnabled !== undefined) throw new Error('AI features disabled in Settings');
    return callAIProvider({ geminiKey: db.geminiKey, groqKey: db.groqKey, openrouterKey: db.openrouterKey, cerebrasKey: db.cerebrasKey, githubKey: db.githubKey }, promptText, systemPrompt);
}

function formatAIResponse(text) {
    if (!text) return '<p style="padding:20px; opacity:0.6;">No data received...</p>';

    let formatted = text.replace(/```(html|markdown)?|```/gi, '').trim();

    // If response contains rich HTML tags, sanitize via DOMPurify
    if (/<(div|p|table|h[1-6]|span|ul|ol|li|br|hr|blockquote|pre|code|strong|em|b|i|a|img|section|article|header|footer|main|aside|nav|figure|figcaption|details|summary|mark|small|sub|sup)[\s>]/i.test(formatted)) {
        if (typeof DOMPurify !== 'undefined') {
            return DOMPurify.sanitize(formatted, {
                ALLOWED_TAGS: ['div','p','span','br','strong','em','b','i','u','ul','ol','li','h1','h2','h3','h4','h5','h6','hr','pre','code','blockquote','table','thead','tbody','tr','th','td','section','article','a'],
                ALLOWED_ATTR: ['style','class','href','target','border','colspan','rowspan','bgcolor','align']
            });
        }
        formatted = formatted
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
            .replace(/\bon\w+\s*=/gi, '')
            .replace(/javascript\s*:/gi, '')
            .replace(/<iframe/gi, '&lt;iframe')
            .replace(/<embed/gi, '&lt;embed')
            .replace(/<object/gi, '&lt;object');
        return formatted;
    }

    // Plain text / markdown: escape and process
    formatted = escapeHtml(formatted);
    formatted = processAITables(formatted);
    formatted = processAICharts(formatted);
    formatted = processAIProgress(formatted);
    formatted = processAICallouts(formatted);
    formatted = formatted.replace(/\bon\w+\s*=/gi, '').replace(/javascript\s*:/gi, '');
    formatted = formatted
        .replace(/^### (.*$)/gim, '<h3 style="margin:16px 0 8px;color:var(--md-on-surface-variant);font-size:16px;">$1</h3>')
        .replace(/^## (.*$)/gim, '<h2 style="margin:20px 0 10px;color:var(--md-on-surface);font-size:18px;font-weight:600;">$1</h2>')
        .replace(/^# (.*$)/gim, '<h1 style="margin:24px 0 12px;color:var(--md-primary);font-size:20px;font-weight:700;">$1</h1>')
        .replace(/\*\*(.*?)\*\*/g, '<strong style="color:var(--md-on-surface);font-weight:600;">$1</strong>')
        .replace(/\*(.*?)\*/g, '<em style="color:var(--md-on-surface-variant);">$1</em>')
        .replace(/^&gt; (.*$)/gim, '<blockquote style="border-left:3px solid var(--md-primary);padding-left:12px;margin:12px 0;color:var(--md-on-surface-variant);font-style:italic;">$1</blockquote>')
        .replace(/^\* (.*$)/gim, '<li style="margin:4px 0;padding-left:8px;">$1</li>')
        .replace(/(<li[^>]*>.*<\/li>\n?)+/g, '<ul style="margin:12px 0;padding-left:20px;list-style-type:disc;">$&</ul>')
        .replace(/<\/ul>\s*<ul[^>]*>/g, '')
        .replace(/\[(.*?)\]\((https?:\/\/.*?)\)/g, (m, label, url) =>
            `<a href="${escapeHtml(url)}" target="_blank" style="color:var(--md-primary);text-decoration:underline;">${escapeHtml(label)}</a>`
        );
    formatted = formatted.replace(/`([^`]+)`/g, '<code style="background:var(--md-surface-container-highest);padding:2px 6px;border-radius:4px;font-family:monospace;font-size:90%;">$1</code>');
    return formatted.split('\n').map(line => {
        if (line.trim().startsWith('<') || line.trim().endsWith('>')) return line;
        if (line.trim() === '') return '<div style="height:8px;"></div>';
        return `<p style="margin:8px 0;line-height:1.5;">${line}</p>`;
    }).join('');
}

// Process AI-generated tables
function processAITables(text) {
    // Match markdown tables: | Header1 | Header2 | ...\n|-------|-------|...\n| Data | Data |
    const tableRegex = /\|(.+)\|\n\|[-\s|]+\|\n((?:\|.+\|\n?)+)/g;
    return text.replace(tableRegex, (match, headers, rows) => {
        const headerCells = headers.split('|').map(h => h.trim()).filter(h => h);
        const rowLines = rows.trim().split('\n');

        let tableHtml = '<div style="overflow-x:auto;margin:16px 0;border-radius:12px;border:1px solid var(--md-outline-variant);"><table style="width:100%;border-collapse:collapse;font-size:13px;">';

        // Headers
        tableHtml += '<thead><tr style="background:var(--md-primary-container);">';
        headerCells.forEach(h => {
            tableHtml += `<th style="padding:12px;text-align:left;color:var(--md-on-primary-container);font-weight:600;border-bottom:2px solid var(--md-outline-variant);">${escapeHtml(h)}</th>`;
        });
        tableHtml += '</tr></thead><tbody>';

        // Rows
        rowLines.forEach((line, idx) => {
            const cells = line.split('|').map(c => c.trim()).filter(c => c);
            const bg = idx % 2 === 0 ? 'var(--md-surface)' : 'var(--md-surface-container-low)';
            tableHtml += `<tr style="background:${bg};">`;
            cells.forEach(c => {
                tableHtml += `<td style="padding:10px 12px;border-bottom:1px solid var(--md-outline-variant);color:var(--md-on-surface);">${escapeHtml(c)}</td>`;
            });
            tableHtml += '</tr>';
        });

        tableHtml += '</tbody></table></div>';
        return tableHtml;
    });
}

// Process AI-generated charts using simple HTML/CSS
function processAICharts(text) {
    // Match [CHART: bar data="10,20,30" labels="A,B,C" colors="#ff0000,#00ff00,#0000ff"]
    // Quotes may be HTML-encoded as &quot; because escapeHtml runs first in
    // formatAIResponse, so the regex accepts either form.
    const q = '(?:"|&quot;)';
    const chartRegex = new RegExp(
        '\\[CHART:\\s*(\\w+)\\s+data=' + q + '([^"&]+)' + q +
        '(?:\\s+labels=' + q + '([^"&]*)' + q + ')?' +
        '(?:\\s+colors=' + q + '([^"&]*)' + q + ')?\\]',
        'g'
    );

    return text.replace(chartRegex, (match, type, dataStr, labelsStr, colorsStr) => {
        const data = dataStr.split(',').map(v => parseFloat(v.trim()) || 0);
        const labels = labelsStr ? labelsStr.split(',').map(l => l.trim()) : data.map((_, i) => i + 1);
        const colors = colorsStr ? colorsStr.split(',').map(c => c.trim()) : generateChartColors(data.length);

        const max = Math.max(...data, 1);
        const total = data.reduce((a, b) => a + b, 0);

        if (type === 'bar' || type === 'column') {
            return renderAIBarChart(data, labels, colors, max);
        } else if (type === 'pie' || type === 'donut') {
            return renderAIPieChart(data, labels, colors, total);
        }
        return match;
    });
}

function renderAIBarChart(data, labels, colors, max) {
    let bars = '';
    data.forEach((val, i) => {
        const pct = (val / max) * 100;
        bars += `
            <div style="display:flex;align-items:center;margin:6px 0;">
                <div style="width:60px;font-size:11px;color:var(--md-on-surface-variant);text-align:right;padding-right:8px;flex-shrink:0;">${labels[i]}</div>
                <div style="flex:1;background:var(--md-surface-container-highest);border-radius:4px;height:24px;position:relative;overflow:hidden;">
                    <div style="width:${pct}%;background:${colors[i % colors.length]};height:100%;border-radius:4px;transition:width 0.5s;display:flex;align-items:center;justify-content:flex-end;padding-right:6px;">
                        <span style="font-size:10px;color:white;font-weight:600;text-shadow:0 1px 2px rgba(0,0,0,0.3);">${val}</span>
                    </div>
                </div>
            </div>`;
    });
    return `<div style="margin:16px 0;padding:16px;background:var(--md-surface-container-low);border-radius:12px;">${bars}</div>`;
}

function renderAIPieChart(data, labels, colors, total) {
    let slices = [];
    let currentAngle = 0;

    data.forEach((val, i) => {
        const pct = (val / total) * 100;
        const angle = (val / total) * 360;
        slices.push({ val, pct, angle, color: colors[i % colors.length], label: labels[i] });
    });

    // Create simple legend-based visualization
    let legend = '<div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(120px, 1fr));gap:8px;margin-top:12px;">';
    slices.forEach(s => {
        legend += `
            <div style="display:flex;align-items:center;gap:8px;padding:8px;background:var(--md-surface);border-radius:8px;">
                <div style="width:12px;height:12px;border-radius:50%;background:${s.color};flex-shrink:0;"></div>
                <div style="flex:1;min-width:0;">
                    <div style="font-size:11px;color:var(--md-on-surface);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${s.label}</div>
                    <div style="font-size:10px;color:var(--md-on-surface-variant);">${s.pct.toFixed(1)}% (${s.val})</div>
                </div>
            </div>`;
    });
    legend += '</div>';

    return `<div style="margin:16px 0;padding:16px;background:var(--md-surface-container-low);border-radius:12px;">
        <div style="font-size:14px;font-weight:600;color:var(--md-on-surface);margin-bottom:12px;text-align:center;">Total: ${total}</div>
        ${legend}
    </div>`;
}

function generateChartColors(count) {
    const base = ['#6750A4', '#006874', '#B3261E', '#D96200', '#0288D1', '#4CAF50', '#FF9800', '#9C27B0'];
    const colors = [];
    for (let i = 0; i < count; i++) {
        colors.push(base[i % base.length]);
    }
    return colors;
}

// Process progress indicators
function processAIProgress(text) {
    const progressRegex = /\[PROGRESS:\s*(\d+(?:\.\d+)?)%\s*([^\]]*)\]/g;
    return text.replace(progressRegex, (match, value, label) => {
        const num = parseFloat(value);
        const color = num >= 80 ? 'var(--md-success)' : num >= 50 ? 'var(--md-primary)' : num >= 25 ? 'var(--md-warning)' : 'var(--md-error)';
        return `<div style="margin:12px 0;">
            <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px;color:var(--md-on-surface-variant);">
                <span>${label.trim()}</span>
                <span style="font-weight:600;color:${color};">${num}%</span>
            </div>
            <div style="height:8px;background:var(--md-surface-container-highest);border-radius:4px;overflow:hidden;">
                <div style="width:${num}%;height:100%;background:${color};border-radius:4px;transition:width 0.5s;"></div>
            </div>
        </div>`;
    });
}

// Process callout boxes
function processAICallouts(text) {
    const callouts = {
        'INFO': { icon: 'info', color: 'var(--md-primary)', bg: 'var(--md-primary-container)' },
        'WARNING': { icon: 'warning', color: 'var(--md-warning)', bg: 'var(--md-warning-container)' },
        'TIP': { icon: 'lightbulb', color: 'var(--md-success)', bg: 'var(--md-success-container)' },
        'ERROR': { icon: 'error', color: 'var(--md-error)', bg: 'var(--md-error-container)' }
    };

    let result = text;
    Object.entries(callouts).forEach(([type, config]) => {
        const regex = new RegExp(`\\[!${type}\\]([^\\n]*(?:\\n(?!!|\\[|$)[^\\n]*)*)`, 'g');
        result = result.replace(regex, (match, content) => {
            return `<div style="margin:16px 0;padding:16px;background:${config.bg};border-radius:12px;border-left:4px solid ${config.color};">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                    <span class="material-symbols-rounded" style="color:${config.color};font-size:20px;">${config.icon}</span>
                    <span style="font-weight:600;color:${config.color};font-size:13px;text-transform:uppercase;letter-spacing:0.5px;">${type}</span>
                </div>
                <div style="color:var(--md-on-surface);line-height:1.5;">${content.trim()}</div>
            </div>`;
        });
    });
    return result;
}

function saveChatSession() {
    // Legacy support: if db.chatHistory has items, migrate to activeChatSession or sessions
    if (db.chatHistory && db.chatHistory.length > 0) {
        const title = db.chatHistory[0].content.substring(0, 30) + "...";
        db.chatSessions.unshift({
            id: generateUniqueId(),
            date: new Date().toISOString(),
            title: title,
            messages: [...db.chatHistory]
        });
        db.chatHistory = [];
    }

    if (activeChatSession && activeChatSession.messages.length > 0) {
        const existingIdx = db.chatSessions.findIndex(s => s.id === activeChatSession.id);
        if (existingIdx !== -1) {
            db.chatSessions[existingIdx] = JSON.parse(JSON.stringify(activeChatSession));
        } else {
            db.chatSessions.unshift(JSON.parse(JSON.stringify(activeChatSession)));
        }
    }

    saveData();
}

// ==========================================
// 8.1 AI HUB (unified chat + reports sheet)
// ==========================================

function openAIHub(tab = 'chat') {
    if (window.__aiEnabled === false) { showSnackbar('Enable AI in Settings to use this feature.', 'smart_toy'); return; }
    saveChatSession();
    switchAIHubTab(tab);
    openSheet('ai-hub-sheet');
    if (tab === 'chat') {
        if (!window.activeChatSession) {
            startNewChatInHub();
        } else {
            renderHubChatMessages();
        }
        setTimeout(() => document.getElementById('ai-hub-input')?.focus(), 300);
    }
}
window.openAIHub = openAIHub;

function switchAIHubTab(tab) {
    const chatTab = document.getElementById('ai-hub-chat-tab');
    const reportsTab = document.getElementById('ai-hub-reports-tab');
    const footer = document.getElementById('ai-hub-footer');
    const btnChat = document.getElementById('ai-hub-tab-chat');
    const btnReports = document.getElementById('ai-hub-tab-reports');
    if (!chatTab || !reportsTab) return;
    if (tab === 'chat') {
        chatTab.style.display = 'block';
        reportsTab.style.display = 'none';
        if (footer) footer.style.display = 'block';
        if (btnChat) btnChat.classList.add('active');
        if (btnReports) btnReports.classList.remove('active');
        renderHubChatMessages();
        const body = document.getElementById('ai-hub-body');
        if (body) body.scrollTop = body.scrollHeight;
    } else {
        chatTab.style.display = 'none';
        reportsTab.style.display = 'block';
        if (footer) footer.style.display = 'none';
        if (btnChat) btnChat.classList.remove('active');
        if (btnReports) btnReports.classList.add('active');
    }
}
window.switchAIHubTab = switchAIHubTab;

// ── Chat functions ──

function renderHubChatMessages() {
    const container = document.getElementById('ai-hub-chat-messages');
    if (!container) return;
    if (!window.activeChatSession || !window.activeChatSession.messages.length) {
        container.innerHTML = '<div style="text-align:center; padding:40px 20px; opacity:0.5; font-size:13px;">Ask your Wealth Assistant anything about your portfolio!</div>';
        return;
    }
    let html = '';
    (window.activeChatSession.messages || []).forEach(msg => {
        html += `<div class="ai-hub-chat-msg ${msg.role === 'user' ? 'user' : 'bot'}">${formatAIResponse(msg.content)}</div>`;
    });
    container.innerHTML = html;
    const body = document.getElementById('ai-hub-body');
    if (body) body.scrollTop = body.scrollHeight;
}

function startNewChatInHub() {
    saveChatSession();
    window.activeChatSession = { id: generateUniqueId(), date: new Date().toISOString(), title: "New Conversation", messages: [] };
    renderHubChatMessages();
    haptic(30);
    document.getElementById('ai-hub-input')?.focus();
    document.getElementById('ai-hub-history-panel').style.display = 'none';
}
window.startNewChatInHub = startNewChatInHub;

function toggleChatHistory() {
    const panel = document.getElementById('ai-hub-history-panel');
    if (!panel) return;
    if (panel.style.display === 'block') {
        panel.style.display = 'none';
        return;
    }
    let html = '<div style="font-weight:600; margin-bottom:10px; opacity:0.7; font-size:12px; text-transform:uppercase; letter-spacing:0.5px;">Past Sessions</div>';
    if (db.chatSessions && db.chatSessions.length) {
        db.chatSessions.forEach((sess, idx) => {
            const date = new Date(sess.date).toLocaleDateString();
            html += `<div class="ai-hub-history-item" onclick="loadHubChatSession(${idx})">
                <div style="font-weight:600; font-size:14px; color:var(--md-on-surface);">${escapeHtml(sess.title)}</div>
                <div style="font-size:11px; opacity:0.6; margin-top:4px;">${date} • ${sess.messages.length} messages</div>
            </div>`;
        });
    } else {
        html += '<div style="text-align:center; padding:20px; opacity:0.5; font-size:13px;">No history yet.</div>';
    }
    panel.innerHTML = html;
    panel.style.display = 'block';
}
window.toggleChatHistory = toggleChatHistory;

function loadHubChatSession(idx) {
    if (!db.chatSessions || idx < 0 || idx >= db.chatSessions.length) return;
    saveChatSession();
    window.activeChatSession = JSON.parse(JSON.stringify(db.chatSessions[idx]));
    renderHubChatMessages();
    const panel = document.getElementById('ai-hub-history-panel');
    if (panel) panel.style.display = 'none';
    haptic(30);
}
window.loadHubChatSession = loadHubChatSession;

function buildFinancialContext() {
    const parts = [];
    parts.push('Current date: ' + new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' }));

    // Portfolio — use the centrally computed values for consistency
    if (Array.isArray(db.investments) && db.investments.length > 0) {
        const totalVal = currentTotalNW || db.investments.reduce((s, i) => s + (i.amount || 0), 0);
        const totalInv = db.investments.reduce((s, i) => s + (i.amount || 0), 0);
        const pnl = totalVal - totalInv;
        const topHoldings = [...db.investments].sort((a, b) => (b.amount || 0) - (a.amount || 0)).slice(0, 8);
        parts.push('Portfolio: ' + db.investments.length + ' investments, total value ₹' + totalVal.toLocaleString('en-IN') + ', invested ₹' + totalInv.toLocaleString('en-IN') + ', P&L ₹' + Math.round(pnl).toLocaleString('en-IN'));
        parts.push('Top holdings: ' + topHoldings.map(i => (i.note || i.type || 'Unknown') + ' (₹' + Math.round(i.amount || 0).toLocaleString('en-IN') + ')').join(', '));
    }

    // SIPs
    if (Array.isArray(db.recurring) && db.recurring.length > 0) {
        const sipTotal = db.recurring.reduce((s, i) => s + (i.amount || 0), 0);
        parts.push('SIPs: ' + db.recurring.length + ' active, total monthly ₹' + sipTotal.toLocaleString('en-IN'));
    }

    // Goals
    if (Array.isArray(db.goals) && db.goals.length > 0) {
        const goalTotal = db.goals.reduce((s, i) => s + (i.target || 0), 0);
        const goalSaved = db.goals.reduce((s, i) => s + (i.saved || 0), 0);
        parts.push('Goals: ' + db.goals.length + ' goals, target ₹' + goalTotal.toLocaleString('en-IN') + ', saved ₹' + goalSaved.toLocaleString('en-IN'));
    }

    // Monthly Plan
    if (db.monthlyPlans) {
        const now = new Date();
        const key = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
        const plan = db.monthlyPlans[key];
        if (plan) {
            const income = Array.isArray(plan.income) ? plan.income.reduce((s, i) => s + i.amount, 0) : 0;
            const needs = Array.isArray(plan.needs) ? plan.needs.reduce((s, i) => s + i.amount, 0) : 0;
            const wants = Array.isArray(plan.wants) ? plan.wants.reduce((s, i) => s + i.amount, 0) : 0;
            parts.push('Monthly budget: income ₹' + Math.round(income).toLocaleString('en-IN') + ', needs ₹' + Math.round(needs).toLocaleString('en-IN') + ', wants ₹' + Math.round(wants).toLocaleString('en-IN'));
        }
    }

    // Spend Tracker
    if (db.spendTracker && Array.isArray(db.spendTracker.entries) && db.spendTracker.entries.length > 0) {
        const now = new Date();
        const monthEntries = db.spendTracker.entries.filter(e => {
            const d = new Date(e.date);
            return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        });
        if (monthEntries.length > 0) {
            const total = monthEntries.reduce((s, e) => s + e.amount, 0);
            parts.push('Spend this month: ₹' + Math.round(total).toLocaleString('en-IN') + ' across ' + monthEntries.length + ' transactions');
            const cats = {};
            monthEntries.forEach(e => { const c = e.category || 'Uncategorized'; cats[c] = (cats[c] || 0) + e.amount; });
            const topCat = Object.entries(cats).sort((a, b) => b[1] - a[1])[0];
            if (topCat) parts.push('Top spend category: ' + topCat[0] + ' (₹' + Math.round(topCat[1]).toLocaleString('en-IN') + ')');
        }
    }

    // User profile
    if (db.userName) parts.push('User name: ' + db.userName);
    if (db.userEmail) parts.push('User email: ' + db.userEmail);

    return parts.join('\n');
}

async function sendAIChatInHub() {
    const input = document.getElementById('ai-hub-input');
    if (!input || !input.value.trim()) return;
    const text = input.value.trim();
    input.value = '';
    haptic(40);

    if (!activeChatSession) {
        activeChatSession = { id: generateUniqueId(), date: new Date().toISOString(), title: text.substring(0, 30), messages: [] };
    }

    activeChatSession.messages.push({ role: 'user', content: text });
    renderHubChatMessages();

    const msgContainer = document.getElementById('ai-hub-chat-messages');
    const typing = document.createElement('div');
    typing.className = 'ai-hub-chat-msg bot';
    typing.innerHTML = '<span class="material-symbols-rounded ai-loading-icon" style="font-size:16px;">autorenew</span> thinking...';
    msgContainer.appendChild(typing);
    const body = document.getElementById('ai-hub-body');
    if (body) body.scrollTop = body.scrollHeight;

    const context = buildFinancialContext();
    const systemPrompt = 'You are TrackInvest, a strict financial planning assistant. You ONLY answer questions about personal finance, investing, budgeting, saving, and portfolio management. If asked about anything else (coding, general knowledge, entertainment, etc.), politely decline and redirect to finance topics. Keep responses concise and helpful. Format responses using simple HTML (<p>, <strong>, <br>, <ul>, <li>). Here is the user\'s financial profile and context:\n\n' + context + '\n\nUse this data to give personalized advice. If they ask about their portfolio, refer to the data above.';

    // Build message history for the AI
    const history = [
        { role: 'system', content: systemPrompt }
    ];
    // Include up to last 20 messages for context
    const recentMessages = activeChatSession.messages.slice(-20);
    recentMessages.forEach(m => {
        if (m.role === 'user' || m.role === 'assistant') {
            history.push({ role: m.role, content: m.content });
        }
    });

    try {
        const response = await callAIApiWithHistory(history);

        if (typing.parentNode) typing.parentNode.removeChild(typing);
        activeChatSession.messages.push({ role: 'assistant', content: response });

        if (activeChatSession.title === "New Conversation") {
            activeChatSession.title = text.substring(0, 25) + (text.length > 25 ? '...' : '');
        }

        renderHubChatMessages();
        saveChatSession();
    } catch (e) {
        if (typing.parentNode) typing.parentNode.removeChild(typing);
        showSnackbar("AI thinking failed. Check API keys.", "error");
    }
}

async function callAIApiWithHistory(messages) {
    if (!window.__aiEnabled && window.__aiEnabled !== undefined) throw new Error('AI features disabled in Settings');
    return callAIProvider(
        { geminiKey: db.geminiKey, groqKey: db.groqKey, openrouterKey: db.openrouterKey, cerebrasKey: db.cerebrasKey, githubKey: db.githubKey },
        '', '', messages
    );
}
window.sendAIChatInHub = sendAIChatInHub;
window.buildFinancialContext = buildFinancialContext;
window.callAIApiWithHistory = callAIApiWithHistory;

// ── Reports functions ──

function generateAIHubReport(type, reportData = null) {
    if (reportData) {
        showHubReport(reportData);
        return;
    }
    const hubSheet = document.getElementById('ai-hub-sheet');
    const isOpen = hubSheet && hubSheet.classList.contains('open');
    if (type === 'full_report') {
        askAIEngine('full_report', isOpen);
    } else if (type === 'ledger') {
        askAIEngine('ledger', isOpen);
    } else if (type === 'blueprint') {
        openWealthBlueprint(isOpen);
    } else if (type === 'forecast') {
        openAIPredictSheet(isOpen);
    }
}
window.generateAIHubReport = generateAIHubReport;

function showHubReport(htmlContent) {
    const container = document.getElementById('ai-hub-report-content');
    const pdfBtn = document.getElementById('ai-hub-download-pdf');
    if (!container) return;
    if (htmlContent) {
        let cleaned = htmlContent
            .replace(/(```[\w]*)/gi, '')
            .trim();
        if (typeof DOMPurify !== 'undefined') {
            cleaned = DOMPurify.sanitize(cleaned, {
                ALLOWED_TAGS: ['div','p','span','br','strong','em','b','i','u','ul','ol','li','h1','h2','h3','h4','h5','h6','hr','pre','code','blockquote','table','thead','tbody','tr','th','td','section','article'],
                ALLOWED_ATTR: ['style','class','border','colspan','rowspan','bgcolor','align']
            });
        }
        container.innerHTML = cleaned;
        if (pdfBtn) { pdfBtn.style.display = ''; pdfBtn.title = 'Download as PDF'; }
        window._hubReportData = cleaned;
    } else {
        container.innerHTML = '<div style="text-align:center; padding:40px 20px; opacity:0.5;">No report data.</div>';
        if (pdfBtn) pdfBtn.style.display = 'none';
    }
}
window.showHubReport = showHubReport;

async function downloadAIHubReport() {
    const data = window._hubReportData;
    if (!data) { showSnackbar("No report to download", "error"); return; }

    const tempDiv = document.createElement('div');
    tempDiv.id = '_hub_report_pdf';
    tempDiv.style.cssText = 'padding:24px;font-size:14px;line-height:1.6;background:#fff;color:#000;max-width:800px;margin:0 auto;';
    tempDiv.innerHTML = data;
    document.body.appendChild(tempDiv);
    tempDiv.scrollIntoView({ block: 'nearest' });

    // small delay for CSS variable resolution
    await new Promise(r => setTimeout(r, 200));

    try {
        const opt = {
            margin: [0.5, 0.5, 0.5, 0.5],
            filename: `Wealth_Report_${new Date().toISOString().split('T')[0]}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true, letterRendering: true, windowWidth: 800, width: tempDiv.scrollWidth, height: tempDiv.scrollHeight },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait', compress: true }
        };
        await html2pdf().set(opt).from(tempDiv).save();
        showSnackbar("PDF Downloaded!", "check_circle");
    } catch (e) {
        console.error('PDF error:', e);
        showSnackbar("PDF generation failed: " + (e.message || 'unknown'), "error");
    }

    if (tempDiv.parentNode) document.body.removeChild(tempDiv);
}
window.downloadAIHubReport = downloadAIHubReport;

// ── Legacy bridge functions (redirect to hub) ──

function toggleAIPopup(forceState, view) {
    if (forceState) {
        if (view === 'report') {
            openAIHub('reports');
        } else {
            openAIHub('chat');
        }
    }
}

function renderAIPopupContent(view, data) {
    if (view === 'report' && data) {
        openAIHub('reports');
        showHubReport(data);
    } else if (view === 'history') {
        openAIHub('chat');
        toggleChatHistory();
    } else {
        openAIHub('chat');
    }
}

function openAIReportSheet(reportData) {
    openAIHub('reports');
    showHubReport(reportData);
}
window.openAIReportSheet = openAIReportSheet;

window.toggleAIPopup = toggleAIPopup;
window.renderAIPopupContent = renderAIPopupContent;

function openAIPredictSheet(alreadyOpen = false) {
    if (!alreadyOpen) openAIHub('reports');
    window.activeChatSession = {
        id: 'forecast_' + Date.now(),
        title: 'Predictive Wealth Forecasting',
        messages: [{ role: 'assistant', content: 'Generating your predictive wealth forecast...' }],
        type: 'forecast'
    };
    generateAIForecast(alreadyOpen);
}

async function generateAIForecast(alreadyOpen = false) {
    haptic(30);
    if (!alreadyOpen) openAIHub('reports');
    if (!db.geminiKey && !db.groqKey) { showSnackbar('Add API Key in Settings', 'key'); return; }

    showHubReport(`
        <div style="padding:24px;text-align:center;color:var(--md-primary);">
            <span class="material-symbols-rounded ai-loading-icon" style="font-size:32px;">autorenew</span>
            <div style="margin-top:12px;font-size:14px;">Generating category-wise forecast...</div>
        </div>`);

    // Build category monthly data (last 3 months per category)
    let now = new Date(); let catMonthly = {};
    (Object.keys(db.categories || {})).forEach(cat => { catMonthly[cat] = []; });
    for (let i = 2; i >= 0; i--) {
        let m = now.getMonth() - i; let y = now.getFullYear();
        if (m < 0) { m += 12; y -= 1; }
        (Object.keys(db.categories || {})).forEach(cat => {
            let sum = (db.investments || []).filter(inv => { let d = parseDate(inv.date); return inv.type === cat && d.getMonth() === m && d.getFullYear() === y; }).reduce((s, i) => s + i.amount, 0);
            catMonthly[cat].push(sum);
        });
    }
    let autoSips = {};
    (db.recurring || []).forEach(r => { autoSips[r.type] = (autoSips[r.type] || 0) + r.amount; });

    let prompt = `You are a financial AI. Given this user data, predict next month investment for each category. Return ONLY a JSON array: [{"category":"X","predicted":N,"trend":"up|down|stable","reason":"short reason"}]. Categories data (last 3 months each): ${JSON.stringify(catMonthly)}. Auto-SIPs per category: ${JSON.stringify(autoSips)}. Net worth: ${currentTotalNW}. Salary: ${db.userProfile.salary}. Only include categories with investments. No markdown.`;

    try {
        let raw = await callAIApi(prompt, "You return only valid JSON arrays. No markdown.");
        raw = raw.replace(/```json|```/g, '').trim();
        let predictions = JSON.parse(raw);
        let total = predictions.reduce((s, p) => s + p.predicted, 0);
        let html = `<div style="background:var(--md-primary-container);color:var(--md-on-primary-container);border-radius:24px;padding:24px;margin-bottom:24px;text-align:center;">
                    <div style="font-size:14px;font-weight:500;opacity:0.8;margin-bottom:4px;">Predicted Total Next Month</div>
                    <div style="font-size:36px;font-weight:600;">₹${fmtNum(total)}</div>
                </div><div style="display:flex;flex-direction:column;gap:12px;">`;
        predictions.forEach(p => {
            let meta = (db.categories || {})[p.category] || { color: '#8D6E63', icon: 'savings' };
            let trendIcon = p.trend === 'up' ? 'trending_up' : p.trend === 'down' ? 'trending_down' : 'trending_flat';
            let trendColor = p.trend === 'up' ? 'var(--md-success)' : p.trend === 'down' ? 'var(--md-error)' : 'var(--md-outline)';
            let trendBg = p.trend === 'up' ? 'var(--md-success-container)' : p.trend === 'down' ? 'var(--md-error-container)' : 'var(--md-surface-container-highest)';
            let safeCat = escapeHtml(p.category);
            let safeReason = escapeHtml(p.reason);
            let safeColor = escapeHtml(meta.color);
            let safeIcon = escapeHtml(meta.icon);
            html += `<div class="md-card" style="margin-bottom:0;display:flex;align-items:center;gap:16px;padding:16px;border-left:4px solid ${safeColor};">
                        <div style="width:48px;height:48px;border-radius:16px;background:${safeColor}20;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                            <span class="material-symbols-rounded" style="color:${safeColor};font-size:24px;">${safeIcon}</span>
                        </div>
                        <div style="flex:1;min-width:0;">
                            <div style="font-size:16px;font-weight:600;color:var(--md-on-surface);">${safeCat}</div>
                            <div style="font-size:13px;color:var(--md-on-surface-variant);margin-top:4px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${safeReason}</div>
                        </div>
                        <div style="text-align:right;flex-shrink:0;">
                            <div style="font-size:18px;font-weight:600;color:var(--md-on-surface);">₹${fmtNum(p.predicted)}</div>
                            <div style="display:inline-flex;align-items:center;gap:4px;margin-top:6px;background:${trendBg};padding:4px 8px;border-radius:8px;">
                                <span class="material-symbols-rounded" style="font-size:14px;color:${trendColor};">${trendIcon}</span>
                                <span style="font-size:12px;font-weight:600;color:${trendColor};text-transform:capitalize;">${escapeHtml(p.trend)}</span>
                            </div>
                        </div>
                    </div>`;
        });
        html += `</div>`;
        showHubReport(html);
    } catch (e) {
        showHubReport(`<div style="padding:16px;color:var(--md-error);text-align:center;">Failed to generate prediction. Check API keys.</div>`);
    }
}

async function openWealthBlueprint(alreadyOpen = false) {
    if (!alreadyOpen) {
        openAIHub('reports');
    }
    window.activeChatSession = { id: 'report_' + Date.now(), title: 'Wealth Blueprint', messages: [], type: 'report' };
    generateWealthBlueprint(alreadyOpen);
}

async function generateWealthBlueprint(alreadyOpen = false) {
    if (!alreadyOpen) openAIHub('reports');
    if (!db.geminiKey && !db.groqKey) {
        showHubReport(`<div style="padding:40px;text-align:center;color:var(--md-error);">Add API Key in Settings to generate Wealth Blueprint.</div>`);
        return;
    }

    showHubReport(`<div style="padding:40px; text-align:center;">
        <span class="material-symbols-rounded ai-loading-icon" style="font-size:48px; color:var(--md-primary);">psychology</span>
        <div style="margin-top:16px; font-weight:500;">Drafting your personalized wealth strategy...</div>
    </div>`);

    let portfolioData = {
        totalNetWorth: currentTotalNW,
        categoryBreakdown: currentTypeTotals,
        monthlyIncome: db.userProfile.salary / 12,
        monthlyExpenses: db.userProfile.monthlyExpense || 0,
        recurringSips: db.recurring,
        taxSaved: db.investments.filter(i => db.categories[i.type] && db.categories[i.type].is80c && isCurrentFY(i.date)).reduce((s, i) => s + i.amount, 0),
        goals: db.goals
    };

    let prompt = `Act as an elite Wealth Manager. Perform a Full Wealth Audit.
    User Data: ${JSON.stringify(portfolioData)}.
    Current State: Analyze net worth vs monthly expenses (${portfolioData.monthlyExpenses}).
    Future Planning: Suggest actions for next 12 months.
    Safety Net: Evaluate if Emergency Fund covers 6-12 months of expenses.
    80C Status: User has saved ₹${portfolioData.taxSaved} out of ₹1.5L limit.
    Requirements:
    1. Provide a "Portfolio Health Score" (0-100).
    2. Identify top 3 strengths and top 3 weaknesses.
    3. Suggest specific asset rebalancing.
    4. Provide a "Wealth Projection" for 5, 10, and 20 years.
    5. Action Plan: 3 immediate steps.
    
    Output Format: HTML with MD3 styling. Use cards, progress bars, and tables. No markdown code blocks. Keep it premium and visual.`;

    try {
        let report = await callAIApi(prompt, "You are a master of financial aesthetics. Use clean HTML/CSS.");
        showHubReport(report);
    } catch (e) {
        showHubReport(`<div style="padding:40px;text-align:center;color:var(--md-error);">Failed to generate blueprint. Check connection.</div>`);
    }
}

async function autoSetGoalsViaAI() {
    haptic(40);
    if (!db.geminiKey && !db.groqKey) { showSnackbar("API Key Required", "key"); return; }
    showSnackbar("AI calculating optimal goals...", "auto_awesome");
    let sal = db.userProfile.salary || 0;
    let exp = db.userProfile.monthlyExpense || 0;

    if (sal === 0) return showSnackbar("Please set Salary in Settings first.", "error");

    let prompt = `User earns ₹${sal} annually. Monthly expenses are ₹${exp}.
    Calculate targets:
    1. Emergency Fund: 6x Monthly Expenses.
    2. Liquid Cash: 1.5x Monthly Expenses.
    3. Annual Tax Goal: If regime is 'old', suggested is 1.5L for 80C.
    Return ONLY valid JSON: {"Emergency Fund": <value>, "Liquid Cash": <value>, "Tax Savings": <value>}. No other text.`;

    try {
        let res = await callAIApi(prompt, "You return only JSON.");
        let data = JSON.parse(res);

        const syncGoal = (name, target, cat) => {
            let g = db.goals.find(x => x.name === name);
            if (g) g.target = target;
            else db.goals.push({ id: generateUniqueId(), name: name, target: target, saved: 0, linkedCategory: cat });
        };

        syncGoal("Emergency Fund", data["Emergency Fund"], "Liquid");
        syncGoal("Liquid Cash", data["Liquid Cash"], "Cash");
        syncGoal("Tax Savings", data["Tax Savings"], "PF");

        saveData(); renderAll(); showSnackbar("Goals Auto-Synced!", "check_circle");
    } catch (e) { showSnackbar("AI Sync Failed", "error"); }
}

async function askAIEngine(context, alreadyOpen = false) {
    haptic(40);
    if (!db.geminiKey && !db.groqKey) {
        showSnackbar("Save API Key First", "key");
        setTimeout(openSettings, 1000);
        return;
    }

    if (!alreadyOpen) openAIHub('reports');

    let loadingLabel = "Analyzing Data...";
    if (context === 'full_report') loadingLabel = "Conducting Strategic Wealth Audit...";
    if (context === 'allocation') loadingLabel = "Analyzing Asset Distribution & Risk...";
    if (context === 'ledger') loadingLabel = "Auditing Behavioral Spending Habits...";

    showHubReport(`
        <div style="padding:40px 24px; text-align:center; color:var(--md-primary);">
            <span class="material-symbols-rounded ai-loading-icon" style="font-size:48px;">cognition</span>
            <div style="margin-top:16px; font-weight:500;">${loadingLabel}</div>
            <div style="font-size:12px; opacity:0.7; margin-top:8px;">Deep-diving into your financial telemetry.</div>
        </div>`);

    // 1. DATA PREP (Shared Context)
    const now = new Date();
    const payload = {
        netWorth: currentTotalNW,
        burnRate: db.userProfile.monthlyExpense || 0,
        salary: db.userProfile.salary,
        allocation: currentTypeTotals,
        targets: db.allocTargets,
        recentHistory: db.investments.slice(-40), // More context for deeper analysis
        taxSaved: db.investments.filter(i => db.categories[i.type]?.is80c && isCurrentFY(i.date)).reduce((s, i) => s + i.amount, 0),
        goals: db.goals
    };

    let catMonthly = {};
    Object.keys(db.categories).forEach(cat => { catMonthly[cat] = []; });
    for (let i = 2; i >= 0; i--) {
        let m = now.getMonth() - i; let y = now.getFullYear();
        if (m < 0) { m += 12; y -= 1; }
        Object.keys(db.categories).forEach(cat => {
            let sum = db.investments.filter(inv => { let d = parseDate(inv.date); return inv.type === cat && d.getMonth() === m && d.getFullYear() === y; }).reduce((s, i) => s + i.amount, 0);
            catMonthly[cat].push(sum);
        });
    }
    let autoSips = {};
    db.recurring.forEach(r => { autoSips[r.type] = (autoSips[r.type] || 0) + r.amount; });

    let promptBase = "";

    // 2. CONTEXT-SPECIFIC STRATEGIC PROMPTS
    if (context === 'full_report') {
        promptBase = `You are an Elite Financial Strategist. Your goal is to provide a "Brutal & Brilliant" wealth audit. Do not sugarcoat. Analyze the provided telemetry and deliver a masterclass in wealth management.
        GIVE AN INDIAN FORMAYED MIDDLE CLASS USERS CAN UNDERSTAND THAT SIMPLE AND EASY LANGUAGE REPSONSES
        <CONTEXT_TELEMETRY>
        - Comprehensive Portfolio: ${JSON.stringify(payload)}
        - Monthly Investment Velocity: ${JSON.stringify(catMonthly)}
        - Recurring Commitments (SIPs): ${JSON.stringify(autoSips)}
        - Target Allocations: ${JSON.stringify(db.allocTargets)}
        </CONTEXT_TELEMETRY>

        <STRATEGIC_MANDATE>
        Execute a 4-dimensional analysis:
        1. THE CURRENT REALITY: Analyze the delta between Salary, Expenses, and Net Worth. Is the user actually building wealth or just moving money? Evaluate the Emergency Fund safety (6-12 month runway).
        2. THE BEHAVIORAL AUDIT: Based on the last 20 transactions, identify "Discipline Hits" (Wins) and "Leaks" (Losses). What habits are invisible to the user but visible in the data?
        3. THE 5-YEAR PROJECTION (THE "CHANGE" BENEFIT): Calculate the compound impact of current changes. Contrast the "As-Is" trajectory with the "Optimized" trajectory if they fix their current mistakes today.
        4. TACTICAL BLUEPRINT: What exactly must happen in the next 90 days to secure the next 5 years?
        </STRATEGIC_MANDATE>

        <OUTPUT_SCHEMA_RULES>
        Format using MD3 (Material Design 3) logic: Use bold headers, No markdown and emphasized blockquotes.
        Output Format: HTML with MD3 styling. Use cards, progress bars, and tables. No markdown code blocks. Keep it premium and visual.
        Make sure table are designed for mobile UI, AND gaps between the topics are correct.

        # Wealth Intelligence & Strategic Audit
        > **Executive Summary:** A 5-10 sentence high-level verdict on the user's current financial trajectory.

        ## 1. The Reality Check: Current State in table html designed for mobile and dynamcially update for laptop
        **Portfolio Health Score: [X/100]**
        | Metric | Value | Verdict |
        | :--- | :--- | :--- |
        | Net Worth | ₹${fmtNum(payload.netWorth)} | [Analysis] |
        | Savings Rate | [Calculated %] | [Efficient/Inefficient] |
        | Tax Efficiency | ₹${payload.taxSaved}/1.5L | [Warning/Good] |

        ## 2. The Mirror: What You're Doing Right & Wrong
        ### 🟢 Winning Habits (The Green List)
        - [Identify specific patterns from the last 20 transactions and SIPs that are building wealth]
        ### 🔴 Current Friction Points (The Red List)
        - [Identify specific mistakes: Over-concentration, inconsistent SIPs, or high expense ratios]

        ## 3. The 5-Year Vision: The Cost of Inaction vs. Action
        - **The "As-Is" Path:** If habits don't change, where will the user be in 2031?
        - **The "Optimized" Path:** If the user implements your suggestions today, what is the ₹[Amount] difference in 5 years?
        - **Strategic Benefit:** How current changes in allocation will bulletproof them against market volatility.

        ## 4. The 90-Day Tactical Blueprint
        ### Phase 1: Immediate Stabilization (Next 30 Days)
        - [3 specific tasks: e.g., "Top up 80C by ₹X", "Rebalance Category Y"]
        ### Phase 2: Growth Acceleration (Next 60-90 Days)
        - [Strategic moves for future planning and goal hitting]

        ## 5. Next-Month Predictive Forecast
        | Category | Predicted Action | Rationale | Trend |
        | :--- | :--- | :--- | :--- |
        [Populate from catMonthly velocity]


        ##6. overall feels about user profile
        </OUTPUT_SCHEMA_RULES>
        `;
    }
    else if (context === 'allocation') {
        promptBase = `Act as a Risk & Portfolio Manager. DATA: ${JSON.stringify({ current: payload.allocation, targets: payload.targets })}.
        Analyze current distribution vs targets. 
        1. Identify Concentration Risks (where user is over-exposed).
        2. Identify Opportunity Gaps (where user is under-invested).
        3. Strategic Rebalancing: Provide a step-by-step plan to reach target parity.
        4. How these changes bulletproof the portfolio for the next 5 years.
        Format: Direct, analytical, using MD3 cards/tables.`;
    }
    else if (context === 'ledger') {
        promptBase = `Act as a Forensic Financial Auditor. DATA: ${JSON.stringify(payload.recentHistory)}.
        Deep-dive into the last 40 transactions.
        1. Behavioral Patterns: Is the user impulsive or disciplined? 
        2. Hidden Leaks: Identify recurring friction or spending "clutter".
        3. Winning Streaks: Highlight the best financial decisions seen in the ledger.
        4. Habit Shift: Suggest 3 psychological shifts to improve cash flow next month.
        Format: Professional and investigative.`;
    }

    try {
        const response = await callAIApi(promptBase, "You are a top-tier Financial AI. Your responses are deep, informative, and strategically superior.");
        if (context === 'full_report') {
            let cleanedResponse = response.replace(/```(html|markdown)?|```/gi, '').trim();
            showHubReport(cleanedResponse);
        } else {
            showHubReport(formatAIResponse(response));
        }
        haptic([30, 50]);
    } catch (e) {
        console.error("AI Engine Error:", e);
        showHubReport(`<div style="color:var(--md-error); padding:20px;">Analysis failed. Check your connection or API keys.</div>`);
    }
}