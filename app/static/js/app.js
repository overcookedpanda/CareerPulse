// === API Client ===
const api = {
    async request(method, path, body = null) {
        const opts = { method, headers: {} };
        if (body) {
            opts.headers['Content-Type'] = 'application/json';
            opts.body = JSON.stringify(body);
        }
        const res = await fetch(path, opts);
        if (!res.ok) {
            const err = await res.json().catch(() => ({ detail: res.statusText }));
            throw new Error(err.detail || `Request failed: ${res.status}`);
        }
        return res.json();
    },

    getJobs(params = {}) {
        const qs = new URLSearchParams();
        Object.entries(params).forEach(([k, v]) => {
            if (v !== null && v !== undefined && v !== '') qs.set(k, v);
        });
        return this.request('GET', `/api/jobs?${qs}`);
    },

    getJob(id) {
        return this.request('GET', `/api/jobs/${id}`);
    },

    getStats() {
        return this.request('GET', '/api/stats');
    },

    dismissJob(id) {
        return this.request('POST', `/api/jobs/${id}/dismiss`);
    },

    prepareApplication(id) {
        return this.request('POST', `/api/jobs/${id}/prepare`);
    },

    updateApplication(id, status, notes = '') {
        const qs = new URLSearchParams({ status, notes });
        return this.request('POST', `/api/jobs/${id}/application?${qs}`);
    },

    triggerScrape() {
        return this.request('POST', '/api/scrape');
    },

    draftEmail(id) {
        return this.request('POST', `/api/jobs/${id}/email`);
    },
};

// === Utilities ===
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('toast-dismiss');
        toast.addEventListener('animationend', () => toast.remove());
    }, 3000);
}

async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        showToast('Copied to clipboard!', 'info');
    } catch {
        showToast('Failed to copy', 'error');
    }
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const now = new Date();
    const diff = now - d;
    const days = Math.floor(diff / 86400000);
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days}d ago`;
    if (days < 30) return `${Math.floor(days / 7)}w ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatSalary(min, max) {
    if (!min && !max) return null;
    const fmt = (n) => {
        if (n >= 1000) return `$${Math.round(n / 1000)}k`;
        return `$${n}`;
    };
    if (min && max) return `${fmt(min)} - ${fmt(max)}`;
    if (min) return `${fmt(min)}+`;
    return `Up to ${fmt(max)}`;
}

function getScoreClass(score) {
    if (score === null || score === undefined) return 'score-badge-none';
    if (score >= 80) return 'score-badge-green';
    if (score >= 60) return 'score-badge-amber';
    return 'score-badge-gray';
}

function escapeHtml(str) {
    if (!str) return '';
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
}

function isNew(createdAt) {
    const lastVisit = localStorage.getItem('jf_last_visit');
    if (!lastVisit) return false;
    return new Date(createdAt) > new Date(lastVisit);
}

// === State ===
let currentJobs = [];
let currentOffset = 0;
const PAGE_SIZE = 50;

// === Router ===
function getRoute() {
    const hash = window.location.hash || '#/';
    if (hash.startsWith('#/job/')) {
        const id = hash.slice(6);
        return { view: 'detail', id: parseInt(id, 10) };
    }
    if (hash === '#/stats') return { view: 'stats' };
    return { view: 'feed' };
}

function navigate(hash) {
    window.location.hash = hash;
}

function updateActiveNav() {
    const route = getRoute();
    document.querySelectorAll('.nav-link').forEach(link => {
        const r = link.dataset.route;
        link.classList.toggle('active',
            (r === 'feed' && route.view === 'feed') ||
            (r === 'stats' && route.view === 'stats')
        );
    });
}

async function handleRoute() {
    const route = getRoute();
    updateActiveNav();
    const app = document.getElementById('app');

    if (route.view === 'detail') {
        await renderJobDetail(app, route.id);
    } else if (route.view === 'stats') {
        await renderStats(app);
    } else {
        await renderFeed(app);
    }
}

// === Feed View ===
async function renderFeed(container) {
    currentOffset = 0;
    container.innerHTML = `
        <div class="filter-bar">
            <input type="text" class="search-input" id="filter-search" placeholder="Search jobs...">
            <select class="filter-select" id="filter-score">
                <option value="">All scores</option>
                <option value="60">60+</option>
                <option value="80">80+</option>
            </select>
            <select class="filter-select" id="filter-sort">
                <option value="score">Sort by score</option>
                <option value="date">Sort by date</option>
            </select>
        </div>
        <div class="job-list" id="job-list"></div>
        <div id="load-more-container" style="padding:24px 0;text-align:center;display:none">
            <button class="btn btn-secondary" id="load-more-btn">Load More</button>
        </div>
    `;

    const searchInput = document.getElementById('filter-search');
    const scoreSelect = document.getElementById('filter-score');
    const sortSelect = document.getElementById('filter-sort');
    const loadMoreBtn = document.getElementById('load-more-btn');

    let debounceTimer;
    const reload = () => {
        currentOffset = 0;
        loadJobs(false);
    };

    searchInput.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(reload, 300);
    });
    scoreSelect.addEventListener('change', reload);
    sortSelect.addEventListener('change', reload);
    loadMoreBtn.addEventListener('click', () => loadJobs(true));

    await loadJobs(false);

    // Save last visit after loading
    localStorage.setItem('jf_last_visit', new Date().toISOString());
}

async function loadJobs(append) {
    const list = document.getElementById('job-list');
    const loadMoreContainer = document.getElementById('load-more-container');

    if (!append) {
        currentOffset = 0;
        list.innerHTML = `<div class="loading-container"><div class="spinner spinner-lg"></div><span>Loading jobs...</span></div>`;
    }

    const params = {
        limit: PAGE_SIZE,
        offset: currentOffset,
        search: document.getElementById('filter-search')?.value || '',
        min_score: document.getElementById('filter-score')?.value || '',
        sort: document.getElementById('filter-sort')?.value || 'score',
    };

    try {
        const data = await api.getJobs(params);
        const jobs = data.jobs || [];

        if (!append) list.innerHTML = '';

        if (jobs.length === 0 && currentOffset === 0) {
            list.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">&#128270;</div>
                    <div class="empty-state-title">No jobs found</div>
                    <div class="empty-state-desc">Try adjusting your filters or click "Scrape Now" to fetch new listings.</div>
                </div>
            `;
            loadMoreContainer.style.display = 'none';
            return;
        }

        jobs.forEach(job => {
            list.appendChild(createJobCard(job));
        });

        currentOffset += jobs.length;
        loadMoreContainer.style.display = jobs.length >= PAGE_SIZE ? '' : 'none';
    } catch (err) {
        showToast(err.message, 'error');
        if (!append) list.innerHTML = '';
    }
}

function createJobCard(job) {
    const card = document.createElement('div');
    card.className = 'card card-interactive job-card';
    card.dataset.jobId = job.id;

    const score = job.match_score;
    const salary = formatSalary(job.salary_min, job.salary_max);
    const scoreClass = getScoreClass(score);
    const newTag = isNew(job.created_at) ? `<span class="new-indicator">New</span>` : '';
    const statusTag = job.app_status ? `<span class="status-badge status-${job.app_status}">${job.app_status}</span>` : '';

    card.innerHTML = `
        <div class="job-card-content">
            <div class="job-card-header">
                <span class="job-card-title text-truncate">${escapeHtml(job.title)}</span>
                ${newTag}
                ${statusTag}
            </div>
            <span class="job-card-company">${escapeHtml(job.company)}</span>
            <div class="job-card-meta">
                ${job.location ? `<span>${escapeHtml(job.location)}</span>` : ''}
                ${salary ? `<span>${salary}</span>` : ''}
                <span>${formatDate(job.created_at)}</span>
            </div>
        </div>
        <div class="job-card-actions">
            <span class="score-badge ${scoreClass}">${score !== null && score !== undefined ? score : '--'}</span>
            <div class="job-card-quick-actions">
                <button class="btn btn-danger btn-sm dismiss-btn" title="Dismiss">Dismiss</button>
            </div>
        </div>
    `;

    card.addEventListener('click', (e) => {
        if (e.target.closest('.dismiss-btn')) return;
        navigate(`#/job/${job.id}`);
    });

    card.querySelector('.dismiss-btn').addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
            await api.dismissJob(job.id);
            card.classList.add('job-card-dismiss');
            card.addEventListener('animationend', () => card.remove());
            showToast('Job dismissed', 'info');
        } catch (err) {
            showToast(err.message, 'error');
        }
    });

    return card;
}

// === Job Detail View ===
async function renderJobDetail(container, jobId) {
    container.innerHTML = `<div class="loading-container"><div class="spinner spinner-lg"></div><span>Loading job details...</span></div>`;

    try {
        const job = await api.getJob(jobId);
        renderJobDetailContent(container, job);
    } catch (err) {
        showToast(err.message, 'error');
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-title">Job not found</div>
                <div class="empty-state-desc">${escapeHtml(err.message)}</div>
            </div>
        `;
    }
}

function renderJobDetailContent(container, job) {
    const score = job.score;
    const matchScore = score?.match_score;
    const scoreClass = getScoreClass(matchScore);
    const salary = formatSalary(job.salary_min, job.salary_max);
    const sources = job.sources || [];
    const application = job.application;

    const reasonsHtml = (score?.match_reasons || []).map(r => `<li>${escapeHtml(r)}</li>`).join('');
    const concernsHtml = (score?.concerns || []).map(c => `<li>${escapeHtml(c)}</li>`).join('');

    const descriptionContent = job.description
        ? (job.description.includes('<') && job.description.includes('>') ? job.description : `<p>${escapeHtml(job.description).replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>')}</p>`)
        : '<p class="text-tertiary">No description available.</p>';

    const appStatus = application?.status || 'interested';

    container.innerHTML = `
        <div class="detail-header">
            <a class="detail-back" id="back-btn">&larr; Back to jobs</a>
            <h1 class="detail-title">${escapeHtml(job.title)}</h1>
            <div class="detail-company">${escapeHtml(job.company)}</div>
            <div class="detail-meta">
                ${job.location ? `<span>${escapeHtml(job.location)}</span>` : ''}
                ${salary ? `<span>${salary}</span>` : ''}
                <span>${formatDate(job.posted_date || job.created_at)}</span>
                ${sources.map(s => `<a href="${escapeHtml(s.source_url || job.url)}" target="_blank" class="source-tag">${escapeHtml(s.source_name)}</a>`).join('')}
            </div>
        </div>
        <div class="detail-layout">
            <div class="card detail-description">
                <h2>Job Description</h2>
                <div class="detail-description-content">${descriptionContent}</div>
            </div>
            <div class="detail-sidebar">
                ${score ? `
                <div class="card sidebar-section">
                    <h3>Match Score</h3>
                    <div class="score-display">
                        <span class="score-badge score-large ${scoreClass}">${matchScore}</span>
                    </div>
                    ${reasonsHtml ? `<ul class="score-reasons">${reasonsHtml}</ul>` : ''}
                    ${concernsHtml ? `<div class="concerns-label">Concerns</div><ul class="score-concerns">${concernsHtml}</ul>` : ''}
                </div>
                ` : ''}
                <div class="card sidebar-section">
                    <h3>Actions</h3>
                    <div class="action-buttons">
                        <button class="btn btn-primary" id="prepare-btn">
                            Prepare Application
                        </button>
                        <a href="${escapeHtml(job.url)}" target="_blank" class="btn btn-secondary">
                            Open Job Listing
                        </a>
                        ${job.contact_email ? `<button class="btn btn-secondary" id="email-btn">Draft Email</button>` : ''}
                    </div>
                    <div class="mt-16">
                        <label class="mb-8" style="display:block;font-size:0.8125rem;font-weight:600;color:var(--text-tertiary)">Status</label>
                        <select class="status-select" id="status-select">
                            ${['interested', 'prepared', 'applied', 'interviewing', 'rejected'].map(s =>
                                `<option value="${s}" ${s === appStatus ? 'selected' : ''}>${s}</option>`
                            ).join('')}
                        </select>
                    </div>
                    <div class="mt-16">
                        <label class="mb-8" style="display:block;font-size:0.8125rem;font-weight:600;color:var(--text-tertiary)">Notes</label>
                        <textarea class="textarea-styled textarea-notes" id="notes-textarea" placeholder="Add notes...">${escapeHtml(application?.notes || '')}</textarea>
                    </div>
                    <div class="mt-16">
                        <button class="btn btn-secondary btn-sm" id="save-status-btn">Save Status & Notes</button>
                    </div>
                </div>
                <div id="prepared-container">
                    ${application?.tailored_resume ? renderPreparedSection(application) : ''}
                </div>
                <div id="email-container">
                    ${application?.email_draft ? renderEmailPreview(JSON.parse(application.email_draft)) : ''}
                </div>
            </div>
        </div>
    `;

    // Wire up events
    document.getElementById('back-btn').addEventListener('click', (e) => {
        e.preventDefault();
        navigate('#/');
    });

    document.getElementById('prepare-btn').addEventListener('click', async () => {
        const btn = document.getElementById('prepare-btn');
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span> Preparing...';
        try {
            const result = await api.prepareApplication(job.id);
            document.getElementById('prepared-container').innerHTML = renderPreparedSection(result);
            attachPreparedListeners();
            showToast('Application prepared!', 'success');
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Prepare Application';
        }
    });

    document.getElementById('save-status-btn').addEventListener('click', async () => {
        const status = document.getElementById('status-select').value;
        const notes = document.getElementById('notes-textarea').value;
        try {
            await api.updateApplication(job.id, status, notes);
            showToast('Status updated', 'success');
        } catch (err) {
            showToast(err.message, 'error');
        }
    });

    const emailBtn = document.getElementById('email-btn');
    if (emailBtn) {
        emailBtn.addEventListener('click', async () => {
            emailBtn.disabled = true;
            emailBtn.innerHTML = '<span class="spinner"></span> Drafting...';
            try {
                const result = await api.draftEmail(job.id);
                document.getElementById('email-container').innerHTML = renderEmailPreview(result.email);
                showToast('Email drafted', 'success');
            } catch (err) {
                showToast(err.message, 'error');
            } finally {
                emailBtn.disabled = false;
                emailBtn.textContent = 'Draft Email';
            }
        });
    }

    attachPreparedListeners();
}

function renderPreparedSection(data) {
    return `
        <div class="card sidebar-section">
            <h3>Tailored Resume</h3>
            <div class="prepared-section">
                <textarea class="textarea-styled" id="resume-textarea">${escapeHtml(data.tailored_resume || '')}</textarea>
                <div class="prepared-actions">
                    <button class="btn btn-secondary btn-sm" id="copy-resume-btn">Copy Resume</button>
                </div>
            </div>
        </div>
        <div class="card sidebar-section">
            <h3>Cover Letter</h3>
            <div class="prepared-section">
                <textarea class="textarea-styled" id="cover-textarea">${escapeHtml(data.cover_letter || '')}</textarea>
                <div class="prepared-actions">
                    <button class="btn btn-secondary btn-sm" id="copy-cover-btn">Copy Cover Letter</button>
                </div>
            </div>
        </div>
    `;
}

function attachPreparedListeners() {
    const copyResume = document.getElementById('copy-resume-btn');
    const copyCover = document.getElementById('copy-cover-btn');
    if (copyResume) {
        copyResume.addEventListener('click', () => {
            copyToClipboard(document.getElementById('resume-textarea').value);
        });
    }
    if (copyCover) {
        copyCover.addEventListener('click', () => {
            copyToClipboard(document.getElementById('cover-textarea').value);
        });
    }
}

function renderEmailPreview(email) {
    if (!email) return '';
    return `
        <div class="card sidebar-section">
            <h3>Email Draft</h3>
            <div class="email-preview">
                <div class="email-field"><span class="email-label">To:</span> ${escapeHtml(email.to || '')}</div>
                <div class="email-field"><span class="email-label">Subject:</span> ${escapeHtml(email.subject || '')}</div>
                <div class="email-body">${escapeHtml(email.body || '')}</div>
            </div>
            <div class="prepared-actions">
                <button class="btn btn-secondary btn-sm" onclick="copyToClipboard(document.querySelector('.email-body')?.textContent || '')">Copy Email</button>
            </div>
        </div>
    `;
}

// === Stats Dashboard View ===
async function renderStats(container) {
    container.innerHTML = `<div class="loading-container"><div class="spinner spinner-lg"></div><span>Loading stats...</span></div>`;

    try {
        const stats = await api.getStats();
        container.innerHTML = `
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px">
                <h1 style="font-size:1.5rem;font-weight:700;letter-spacing:-0.02em">Dashboard</h1>
                <button class="btn btn-primary" id="stats-scrape-btn">Scrape Now</button>
            </div>
            <div class="stats-grid">
                <div class="card stat-card">
                    <div class="stat-number">${stats.total_jobs || 0}</div>
                    <div class="stat-label">Total Jobs</div>
                </div>
                <div class="card stat-card">
                    <div class="stat-number">${stats.total_scored || 0}</div>
                    <div class="stat-label">Scored</div>
                </div>
                <div class="card stat-card">
                    <div class="stat-number">${stats.total_applied || 0}</div>
                    <div class="stat-label">Applied</div>
                </div>
                <div class="card stat-card">
                    <div class="stat-number">${stats.total_interviewing || 0}</div>
                    <div class="stat-label">Interviewing</div>
                </div>
            </div>
            <div class="pipeline-section">
                <h2>Pipeline</h2>
                <div class="pipeline-funnel">
                    <div class="card pipeline-stage">
                        <div class="stage-count">${stats.total_interested || 0}</div>
                        <div class="stage-label">Interested</div>
                    </div>
                    <div class="card pipeline-stage">
                        <div class="stage-count">${(stats.total_scored || 0) - (stats.total_applied || 0) - (stats.total_interviewing || 0)}</div>
                        <div class="stage-label">Prepared</div>
                    </div>
                    <div class="card pipeline-stage">
                        <div class="stage-count">${stats.total_applied || 0}</div>
                        <div class="stage-label">Applied</div>
                    </div>
                    <div class="card pipeline-stage">
                        <div class="stage-count">${stats.total_interviewing || 0}</div>
                        <div class="stage-label">Interviewing</div>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('stats-scrape-btn').addEventListener('click', handleScrape);
    } catch (err) {
        showToast(err.message, 'error');
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-title">Could not load stats</div>
                <div class="empty-state-desc">${escapeHtml(err.message)}</div>
            </div>
        `;
    }
}

// === Scrape Handler ===
async function handleScrape() {
    const btn = document.getElementById('scrape-btn') || document.getElementById('stats-scrape-btn');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span> Scraping...';
    }
    try {
        await api.triggerScrape();
        showToast('Scrape started! New jobs will appear shortly.', 'info');
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Scrape Now';
        }
    }
}

// === Theme Toggle ===
function initTheme() {
    const saved = localStorage.getItem('jf_theme');
    if (saved) {
        document.documentElement.setAttribute('data-theme', saved);
    } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
        document.documentElement.setAttribute('data-theme', 'dark');
    }
}

function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('jf_theme', next);
}

// === Init ===
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    handleRoute();

    window.addEventListener('hashchange', handleRoute);
    document.getElementById('scrape-btn').addEventListener('click', handleScrape);
    document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
});
