/* ═══════════════════════════════════════════════════════════════
   Mission Feed — Video Gallery Client
   ═══════════════════════════════════════════════════════════════ */

// ── State ──
let SERVER_BASE = '';   // e.g. "http://192.168.1.120:3000"
let ALL_VIDEOS = [];

// ── DOM refs ──
const connectOverlay = document.getElementById('connectOverlay');
const connectBtn     = document.getElementById('connectBtn');
const connectError   = document.getElementById('connectError');
const ipInput        = document.getElementById('serverIp');
const portInput      = document.getElementById('serverPort');

const app            = document.getElementById('app');
const loading        = document.getElementById('loading');
const grid           = document.getElementById('videoGrid');
const countEl        = document.getElementById('videoCount');
const serverLabel    = document.getElementById('serverLabel');
const disconnectBtn  = document.getElementById('disconnectBtn');
const connectionStatusUI = document.getElementById('connectionStatusUI');

const modal          = document.getElementById('modal');
const modalVideo     = document.getElementById('modalVideo');
const modalTitle     = document.getElementById('modalTitle');
const modalClose     = document.getElementById('modalClose');


/* ═══════════════════════════════════════════════
   1. Connection
   ═══════════════════════════════════════════════ */

// Initialization
connectOverlay.style.display = 'flex';
app.style.display = 'none';

// Check localStorage for saved connection
(function checkSaved() {
    const saved = localStorage.getItem('mf_server');
    if (saved) {
        try {
            const { ip, port } = JSON.parse(saved);
            ipInput.value = ip;
            portInput.value = port;
            // Auto-connect instantly on refresh
            attemptConnect();
        } catch (e) { /* ignore */ }
    }
})();

// Connect button
connectBtn.addEventListener('click', attemptConnect);

// Allow Enter key to submit
ipInput.addEventListener('keydown', e => { if (e.key === 'Enter') attemptConnect(); });
portInput.addEventListener('keydown', e => { if (e.key === 'Enter') attemptConnect(); });

async function attemptConnect() {
    const ip   = ipInput.value.trim();
    const port = portInput.value.trim();

    if (!ip || !port) {
        showConnectError('Please enter both IP and port.');
        return;
    }

    connectBtn.disabled = true;
    connectBtn.innerHTML = '<span class="spinner" style="width:18px;height:18px;border-width:2px;"></span> Connecting…';
    connectError.textContent = '';

    SERVER_BASE = `http://${ip}:${port}`;

    try {
        // Use AbortController for cross-browser compatible 5s timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const res = await fetch(`${SERVER_BASE}/api/videos`, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!res.ok) throw new Error(`Server returned ${res.status}`);
        ALL_VIDEOS = await res.json();

        // Save successful connection so it persists on refresh
        localStorage.setItem('mf_server', JSON.stringify({ ip, port }));

        // Transition to app
        connectOverlay.style.display = 'none';
        app.style.display = 'block';
        connectionStatusUI.style.display = 'flex';
        loading.style.display = 'none';
        serverLabel.textContent = `${ip}:${port}`;
        applyFilter();
    } catch (err) {
        let msg = 'Could not connect to server.';
        if (err.name === 'TimeoutError') msg = 'Connection timed out — is the server running?';
        else if (err.message) msg += ' ' + err.message;
        showConnectError(msg);
    }

    connectBtn.disabled = false;
    connectBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg> Connect';
}

function showConnectError(msg) {
    connectError.textContent = msg;
    connectError.style.animation = 'none';
    connectError.offsetHeight; // reflow
    connectError.style.animation = 'shake 0.4s ease';
}

// Disconnect
disconnectBtn.addEventListener('click', () => {
    localStorage.removeItem('mf_server');
    SERVER_BASE = '';
    ALL_VIDEOS = [];
    app.style.display = 'none';
    connectionStatusUI.style.display = 'none';
    connectOverlay.style.display = 'flex';
    connectError.textContent = '';
    grid.innerHTML = '';
});


/* ═══════════════════════════════════════════════
   2. Helpers
   ═══════════════════════════════════════════════ */

function formatSize(bytes) {
    if (bytes < 1024)       return bytes + ' B';
    if (bytes < 1048576)    return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB';
    return (bytes / 1073741824).toFixed(2) + ' GB';
}

function titleFromFilename(name) {
    return name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
}

function escapeHTML(str) {
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
              .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}


/* ═══════════════════════════════════════════════
   3. Rendering
   ═══════════════════════════════════════════════ */

function renderCards(videos) {
    countEl.textContent = videos.length + ' video' + (videos.length !== 1 ? 's' : '');

    if (videos.length === 0) {
        grid.innerHTML = `
            <div class="empty-state">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <rect x="2" y="2" width="20" height="20" rx="2.18"/>
                    <line x1="10" y1="2" x2="10" y2="22"/>
                </svg>
                <h2>No videos found</h2>
                <p>No mission recordings in <code>~/Desktop/mission_feed</code>. 
                   Add video files and refresh.</p>
            </div>`;
        return;
    }

    grid.innerHTML = videos.map((v, i) => {
        const title     = titleFromFilename(v.name);
        const safeTitle = escapeHTML(title);
        const safeName  = escapeHTML(v.name);
        const encoded   = encodeURIComponent(v.name);
        const ext       = v.name.split('.').pop().toUpperCase();
        return `
        <div class="card" style="animation-delay:${i * 45}ms">
            <div class="thumb-wrap" onclick="openPlayer('${encoded}', '${safeTitle}')">
                <video src="${SERVER_BASE}/api/video/${encoded}" preload="metadata" muted></video>
                <div class="play-overlay">
                    <div class="play-btn">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="white"><polygon points="8 5 20 12 8 19"/></svg>
                    </div>
                </div>
            </div>
            <div class="card-body">
                <div class="card-title" title="${safeTitle}">${safeTitle}</div>
                <div class="card-meta">
                    <span>${ext}</span>
                    <span>•</span>
                    <span>${formatSize(v.size)}</span>
                    ${v.date ? `<span>•</span><span>${v.date}</span>` : ''}
                </div>
                <div class="btn-row">
                    <button class="btn btn-play" onclick="openPlayer('${encoded}', '${safeTitle}')">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 3 20 12 6 21"/></svg>
                        Play
                    </button>
                    <a class="btn btn-download" href="${SERVER_BASE}/api/download/${encoded}" download="${v.name}" target="_blank">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                        Save
                    </a>
                    <button class="btn btn-delete" onclick="deleteVideo('${encoded}', '${safeTitle}')" title="Delete Video">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                        Del
                    </button>
                </div>
            </div>
        </div>`;
    }).join('');
}


/* ═══════════════════════════════════════════════
   4. Time Filters
   ═══════════════════════════════════════════════ */

let currentFilter = 'all';

document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        // Toggle active visual class
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        currentFilter = btn.getAttribute('data-filter');
        applyFilter();
    });
});

function applyFilter() {
    if (!ALL_VIDEOS) return;

    if (currentFilter === 'all') {
        renderCards(ALL_VIDEOS);
        return;
    }

    const nowMs = Date.now();
    const filtered = ALL_VIDEOS.filter(v => {
        if (!v.timestamp) return true; // fallback if no timestamp
        const vMs = v.timestamp * 1000; // PHP/Python unix timestamp to JS millisecond
        const diffHours = (nowMs - vMs) / (1000 * 60 * 60);

        if (currentFilter === 'hour') {
            return diffHours <= 1;
        } else if (currentFilter === 'day') {
            return diffHours <= 24;
        }
        return true;
    });

    renderCards(filtered);
}

/* ═══════════════════════════════════════════════
   5. Delete Video
   ═══════════════════════════════════════════════ */

async function deleteVideo(filename, title) {
    if (!confirm(`Are you absolutely sure you want to permanently delete:\n\n${title}\n\nThis cannot be undone!`)) {
        return;
    }

    try {
        const response = await fetch(`${SERVER_BASE}/api/video/${filename}`, {
            method: 'DELETE'
        });
        if (!response.ok) throw new Error('Failed to delete video on the server');
        
        // Re-fetch videos from server automatically to refresh grid
        attemptConnect();
    } catch (err) {
        alert('Delete Exception: ' + err.message);
    }
}


/* ═══════════════════════════════════════════════
   6. Modal Player
   ═══════════════════════════════════════════════ */

function openPlayer(encodedName, title) {
    modalVideo.src = `${SERVER_BASE}/api/video/${encodedName}`;
    modalTitle.textContent = title;
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closePlayer() {
    modal.classList.remove('active');
    modalVideo.pause();
    modalVideo.removeAttribute('src');
    modalVideo.load();
    document.body.style.overflow = '';
}

modalClose.addEventListener('click', closePlayer);
modal.addEventListener('click', e => { if (e.target === modal) closePlayer(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closePlayer(); });
