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
const searchInput    = document.getElementById('searchInput');
const serverLabel    = document.getElementById('serverLabel');
const disconnectBtn  = document.getElementById('disconnectBtn');

const modal          = document.getElementById('modal');
const modalVideo     = document.getElementById('modalVideo');
const modalTitle     = document.getElementById('modalTitle');
const modalClose     = document.getElementById('modalClose');


/* ═══════════════════════════════════════════════
   1. Connection
   ═══════════════════════════════════════════════ */

// Check localStorage for saved connection
(function checkSaved() {
    const saved = localStorage.getItem('mf_server');
    if (saved) {
        try {
            const { ip, port } = JSON.parse(saved);
            ipInput.value = ip;
            portInput.value = port;
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

        // Save successful connection
        localStorage.setItem('mf_server', JSON.stringify({ ip, port }));

        // Transition to app
        connectOverlay.style.display = 'none';
        app.style.display = 'block';
        loading.style.display = 'none';
        serverLabel.textContent = `${ip}:${port}`;
        renderCards(ALL_VIDEOS);
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
    connectOverlay.style.display = 'flex';
    connectError.textContent = '';
    grid.innerHTML = '';
    searchInput.value = '';
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
                </div>
                <div class="btn-row">
                    <button class="btn btn-play" onclick="openPlayer('${encoded}', '${safeTitle}')">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 3 20 12 6 21"/></svg>
                        Play
                    </button>
                    <button class="btn btn-download" onclick="downloadVideo(event, '${encoded}', '${safeName}')">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                            <polyline points="7 10 12 15 17 10"/>
                            <line x1="12" y1="15" x2="12" y2="3"/>
                        </svg>
                        Download
                    </button>
                </div>
            </div>
        </div>`;
    }).join('');
}


/* ═══════════════════════════════════════════════
   4. Search
   ═══════════════════════════════════════════════ */

searchInput.addEventListener('input', () => {
    const q = searchInput.value.toLowerCase().trim();
    const filtered = q ? ALL_VIDEOS.filter(v => v.name.toLowerCase().includes(q)) : ALL_VIDEOS;
    renderCards(filtered);
});


/* ═══════════════════════════════════════════════
   5. Download
   ═══════════════════════════════════════════════ */

function downloadVideo(evt, encodedName, originalName) {
    const btn = evt.currentTarget;
    const origHTML = btn.innerHTML;
    btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg> Downloading…';
    btn.disabled = true;

    fetch(`${SERVER_BASE}/api/download/${encodedName}`)
        .then(res => {
            if (!res.ok) throw new Error('Server returned ' + res.status);
            return res.blob();
        })
        .then(blob => {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = originalName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            btn.innerHTML = origHTML;
            btn.disabled = false;
        })
        .catch(err => {
            console.error('Download failed:', err);
            btn.innerHTML = origHTML;
            btn.disabled = false;
            alert('Download failed: ' + err.message);
        });
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
