// Shared AI Provider Router — single function used by all pages
// Fallback chain: Gemini → Groq → OpenRouter(free) → Cerebras → GitHub Models(gpt-4o-mini)

function isValidGeminiKey(key) {
    return /^[A-Za-z0-9_-]{35,}$/.test(key);
}
function isValidGroqKey(key) {
    return /^gsk_[A-Za-z0-9_-]{48,}$/.test(key);
}
function isValidOpenRouterKey(key) {
    return /^sk-or-v1-[A-Za-z0-9_-]{40,}$/.test(key);
}
function isValidCerebrasKey(key) {
    return key.length > 20 && (key.startsWith('cerebras_') || key.length > 30);
}
function isValidGitHubKey(key) {
    return key.length > 10 && (key.startsWith('github_pat_') || key.startsWith('ghp_') || key.length > 20);
}

const _sanitize = typeof DOMPurify !== 'undefined'
    ? (s) => DOMPurify.sanitize(s, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] })
    : (s) => s.replace(/<[^>]*>/g, '').replace(/javascript:/gi, '').replace(/on\w+\s*=/gi, '');

function sanitizeInput(input) {
    if (typeof input !== 'string') return '';
    return _sanitize(input).trim();
}

async function getErrorMessage(response) {
    try {
        const text = await response.text();
        return (text || response.statusText || 'Unknown error').slice(0, 200);
    } catch (e) {
        return response.statusText || 'Unknown error';
    }
}

// keys: { geminiKey, groqKey, openrouterKey, cerebrasKey, githubKey }
// Returns response text or throws
async function callAIProvider(keys, promptText, systemPrompt) {
    if (window.__aiEnabled === false) throw new Error('AI features disabled in Settings');
    if (!keys || typeof keys !== 'object') throw new Error('Invalid keys object');
    const active = {};
    for (const k of ['geminiKey', 'groqKey', 'openrouterKey', 'cerebrasKey', 'githubKey']) {
        active[k] = !!(keys[k] && keys[k].trim().length > 0);
    }
    if (!Object.values(active).some(Boolean)) throw new Error('No API key configured');

    if (active.geminiKey && !isValidGeminiKey(keys.geminiKey)) active.geminiKey = false;
    if (active.groqKey && !isValidGroqKey(keys.groqKey)) active.groqKey = false;
    if (active.openrouterKey && !isValidOpenRouterKey(keys.openrouterKey)) active.openrouterKey = false;
    if (active.cerebrasKey && !isValidCerebrasKey(keys.cerebrasKey)) active.cerebrasKey = false;
    if (active.githubKey && !isValidGitHubKey(keys.githubKey)) active.githubKey = false;

    const sanitizedPrompt = sanitizeInput(promptText);
    const sanitizedSystem = systemPrompt ? sanitizeInput(systemPrompt) : '';
    const maxRetries = 2;
    const timeoutMs = 30000;

    let responseText = null;
    let lastError = null;
    const fetchOpts = { mode: 'cors' };

    async function tryFetch(name, url, headers, body) {
        for (let attempt = 0; attempt <= maxRetries && !responseText; attempt++) {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
            try {
                const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal, ...fetchOpts });
                clearTimeout(timeoutId);
                if (res.ok) {
                    const data = await res.json();
                    if (name === 'Gemini') {
                        if (data.error) throw new Error(`Gemini API Error: ${data.error.message}`);
                        responseText = data.candidates?.[0]?.content?.parts?.[0]?.text;
                    } else {
                        responseText = data.choices?.[0]?.message?.content;
                    }
                    responseText = responseText || 'Sorry, I could not process that request.';
                    return;
                }
                const errorText = await getErrorMessage(res);
                lastError = new Error(`${name} HTTP ${res.status}: ${errorText}`);
            } catch (e) {
                clearTimeout(timeoutId);
                lastError = e;
                if (attempt < maxRetries) await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000));
            }
        }
    }

    // Gemini
    if (active.geminiKey && !responseText) {
        await tryFetch('Gemini',
            'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
            { 'Content-Type': 'application/json', 'x-goog-api-key': keys.geminiKey, 'User-Agent': 'TrackInvest/1.0' },
            { contents: [{ parts: [{ text: (sanitizedSystem || '') + '\n\n' + sanitizedPrompt }] }], generationConfig: { temperature: 0.7, maxOutputTokens: 1000, topK: 40, topP: 0.95 } }
        );
    }

    // Groq
    if (active.groqKey && !responseText) {
        await tryFetch('Groq',
            'https://api.groq.com/openai/v1/chat/completions',
            { 'Authorization': 'Bearer ' + keys.groqKey, 'Content-Type': 'application/json', 'User-Agent': 'TrackInvest/1.0' },
            { model: 'llama-3.3-70b-versatile', messages: [{ role: 'system', content: sanitizedSystem }, { role: 'user', content: sanitizedPrompt }], max_tokens: 1000, temperature: 0.7 }
        );
    }

    // OpenRouter
    if (active.openrouterKey && !responseText) {
        await tryFetch('OpenRouter',
            'https://openrouter.ai/api/v1/chat/completions',
            { 'Authorization': 'Bearer ' + keys.openrouterKey, 'Content-Type': 'application/json', 'HTTP-Referer': (typeof window !== 'undefined' ? window.location.origin : ''), 'X-Title': 'TrackInvest' },
            { model: 'openrouter/free', messages: [{ role: 'system', content: sanitizedSystem }, { role: 'user', content: sanitizedPrompt }], max_tokens: 1000, temperature: 0.7 }
        );
    }

    // Cerebras
    if (active.cerebrasKey && !responseText) {
        await tryFetch('Cerebras',
            'https://api.cerebras.ai/v1/chat/completions',
            { 'Authorization': 'Bearer ' + keys.cerebrasKey, 'Content-Type': 'application/json' },
            { model: 'gpt-oss-120b', messages: [{ role: 'system', content: sanitizedSystem }, { role: 'user', content: sanitizedPrompt }], max_tokens: 1000, temperature: 0.7 }
        );
    }

    // GitHub Models
    if (active.githubKey && !responseText) {
        await tryFetch('GitHub Models',
            'https://models.github.ai/inference/chat/completions',
            { 'Authorization': 'Bearer ' + keys.githubKey, 'Content-Type': 'application/json' },
            { model: 'gpt-4o-mini', messages: [{ role: 'system', content: sanitizedSystem }, { role: 'user', content: sanitizedPrompt }], max_tokens: 1000, temperature: 0.7 }
        );
    }

    if (!responseText) {
        throw lastError || new Error('All AI engines failed to respond.');
    }

    return responseText
        .replace(/(```[\w]*)/gi, '')
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<\/?html[^>]*>/gi, '')
        .replace(/<\/?body[^>]*>/gi, '')
        .replace(/<!DOCTYPE[^>]*>/gi, '')
        .trim();
}
