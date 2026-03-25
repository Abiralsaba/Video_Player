#!/usr/bin/env python3
"""
Video Gallery Server — Python backend that serves a frontend (HTML/CSS/JS)
and provides API endpoints for browsing, streaming, and downloading videos.

The server reads videos from ~/Desktop/mission_feed on a Linux machine.

Usage:
    python server.py                         # defaults: 0.0.0.0:3000
    python server.py --host 192.168.1.120 --port 8080
"""

import os
import sys
import json
import argparse
import mimetypes
import datetime
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import unquote

# ──────────────────────────── Configuration ────────────────────────────
DEFAULT_HOST = "192.168.1.120"
DEFAULT_PORT = 3000

# Video directory on the Linux server
VIDEOS_DIR = os.path.expanduser("~/Desktop/mission_feed")

SUPPORTED_EXTENSIONS = {
    ".mp4", ".webm", ".ogg", ".mov", ".mkv", ".avi", ".m4v", ".flv", ".wmv"
}

# Path to the static frontend files (same directory as this script)
STATIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")

# MIME type mapping for static files
MIME_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css":  "text/css; charset=utf-8",
    ".js":   "application/javascript; charset=utf-8",
    ".png":  "image/png",
    ".jpg":  "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg":  "image/svg+xml",
    ".ico":  "image/x-icon",
    ".json": "application/json",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
}


# ──────────────────────────── Helpers ──────────────────────────────────

def scan_videos():
    """Return a list of {name, size} dicts for all supported video files."""
    if not os.path.isdir(VIDEOS_DIR):
        return []
    videos = []
    for f in sorted(os.listdir(VIDEOS_DIR), reverse=True):
        ext = os.path.splitext(f)[1].lower()
        if ext in SUPPORTED_EXTENSIONS:
            full = os.path.join(VIDEOS_DIR, f)
            if os.path.isfile(full):
                mtime = os.path.getmtime(full)
                dt_str = datetime.datetime.fromtimestamp(mtime).strftime("%Y-%m-%d %H:%M:%S")
                videos.append({
                    "name": f, 
                    "size": os.path.getsize(full), 
                    "date": dt_str,
                    "timestamp": mtime
                })
    return videos


def safe_video_path(name):
    """Resolve a filename and ensure it stays inside VIDEOS_DIR."""
    if "/" in name or "\\" in name or ".." in name:
        return None
    filepath = os.path.join(VIDEOS_DIR, name)
    real = os.path.realpath(filepath)
    if not real.startswith(os.path.realpath(VIDEOS_DIR)):
        return None
    if not os.path.isfile(real):
        return None
    return real


# ──────────────────────────── Request Handler ─────────────────────────

class VideoHandler(BaseHTTPRequestHandler):

    def log_message(self, fmt, *args):
        sys.stderr.write(f"[VideoServer] {self.requestline} → {args[0]}\n")

    # ── CORS headers for cross-origin frontend → backend ──
    def _send_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS, DELETE")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Range")

    def do_OPTIONS(self):
        self.send_response(204)
        self._send_cors_headers()
        self.end_headers()

    def do_DELETE(self):
        path = self.path.split("?")[0]
        if path.startswith("/api/video/"):
            self._delete_video(unquote(path[len("/api/video/"):]))
        else:
            self.send_error(404, "Endpoint not found")

    def do_GET(self):
        path = self.path.split("?")[0]

        # ── API endpoints ──
        if path == "/api/videos":
            self._serve_api_videos()
        elif path.startswith("/api/video/"):
            self._serve_video(unquote(path[len("/api/video/"):]))
        elif path.startswith("/api/download/"):
            self._serve_download(unquote(path[len("/api/download/"):]))

        # ── Static frontend files ──
        elif path == "/" or path == "":
            self._serve_static("index.html")
        else:
            # Strip leading slash and serve from static/
            self._serve_static(path.lstrip("/"))

    # ── API: list videos ──
    def _serve_api_videos(self):
        videos = scan_videos()
        payload = json.dumps(videos).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self._send_cors_headers()
        self.end_headers()
        self.wfile.write(payload)

    # ── API: stream a video ──
    def _serve_video(self, name):
        filepath = safe_video_path(name)
        if not filepath:
            self.send_error(404, "Video not found")
            return

        file_size = os.path.getsize(filepath)
        mime = mimetypes.guess_type(filepath)[0] or "video/mp4"

        range_header = self.headers.get("Range")
        if range_header:
            self._serve_partial(filepath, file_size, mime, range_header)
        else:
            self.send_response(200)
            self.send_header("Content-Type", mime)
            self.send_header("Content-Length", str(file_size))
            self.send_header("Accept-Ranges", "bytes")
            self._send_cors_headers()
            self.end_headers()
            self._stream_file(filepath, 0, file_size)

    def _serve_partial(self, filepath, file_size, mime, range_header):
        try:
            byte_range = range_header.replace("bytes=", "").strip()
            parts = byte_range.split("-")
            start = int(parts[0]) if parts[0] else 0
            end = int(parts[1]) if len(parts) > 1 and parts[1] else file_size - 1
        except (ValueError, IndexError):
            self.send_error(416, "Invalid range")
            return

        if start >= file_size or start < 0:
            self.send_error(416, "Range not satisfiable")
            return

        end = min(end, file_size - 1)
        length = end - start + 1

        self.send_response(206)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Range", f"bytes {start}-{end}/{file_size}")
        self.send_header("Content-Length", str(length))
        self.send_header("Accept-Ranges", "bytes")
        self._send_cors_headers()
        self.end_headers()
        self._stream_file(filepath, start, length)

    # ── API: delete a video ──
    def _delete_video(self, name):
        filepath = safe_video_path(name)
        if not filepath:
            self.send_error(404, "Video not found")
            return
        
        try:
            os.remove(filepath)
            self.send_response(200)
            self._send_cors_headers()
            self.end_headers()
            self.wfile.write(b"OK")
        except OSError as e:
            self.send_error(500, "Deletion failed")

    # ── API: download a video ──
    def _serve_download(self, name):
        filepath = safe_video_path(name)
        if not filepath:
            self.send_error(404, "Video not found")
            return

        file_size = os.path.getsize(filepath)
        basename = os.path.basename(filepath)

        self.send_response(200)
        self.send_header("Content-Type", "application/octet-stream")
        self.send_header("Content-Disposition", f'attachment; filename="{basename}"')
        self.send_header("Content-Length", str(file_size))
        self._send_cors_headers()
        self.end_headers()
        self._stream_file(filepath, 0, file_size)

    # ── Serve static frontend files ──
    def _serve_static(self, filename):
        filepath = os.path.join(STATIC_DIR, filename)
        real = os.path.realpath(filepath)

        if not real.startswith(os.path.realpath(STATIC_DIR)):
            self.send_error(403, "Forbidden")
            return
        if not os.path.isfile(real):
            self.send_error(404, "File not found")
            return

        ext = os.path.splitext(real)[1].lower()
        content_type = MIME_TYPES.get(ext, "application/octet-stream")

        with open(real, "rb") as f:
            data = f.read()

        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    # ── Streaming helper ──
    def _stream_file(self, filepath, start, length):
        try:
            with open(filepath, "rb") as f:
                f.seek(start)
                remaining = length
                while remaining > 0:
                    chunk_size = min(65536, remaining)
                    data = f.read(chunk_size)
                    if not data:
                        break
                    self.wfile.write(data)
                    remaining -= len(data)
        except (BrokenPipeError, ConnectionResetError):
            pass


# ──────────────────────────── Main ─────────────────────────────────────

def main():
    global VIDEOS_DIR

    parser = argparse.ArgumentParser(description="Video Gallery Server")
    parser.add_argument("port", type=int, nargs="?", default=DEFAULT_PORT, help="Port to run on (default: 3000)")
    parser.add_argument("--videos-dir", default=None, help=f"Videos directory (default: {VIDEOS_DIR})")
    args = parser.parse_args()

    if args.videos_dir:
        VIDEOS_DIR = args.videos_dir
    os.makedirs(VIDEOS_DIR, exist_ok=True)

    # Use defaults to start instantly in the background
    user_ip = "0.0.0.0"
    user_port = args.port

    class VideoServer(HTTPServer):
        allow_reuse_address = True

    while True:
        try:
            server = VideoServer((user_ip, user_port), VideoHandler)
            break
        except OSError as e:
            if e.errno == 48: # Address already in use
                print(f"[!] Port {user_port} is frozen in the background. Auto-switching to port {user_port + 1}...")
                user_port += 1
            elif e.errno == 49 and user_ip != "0.0.0.0": # Can't assign requested address
                print(f"\n[!] Cannot bind to {user_ip}. Falling back to 0.0.0.0...")
                user_ip = "0.0.0.0"
            else:
                raise

    count = len(scan_videos())

    display_ip = "localhost" if user_ip == "0.0.0.0" else user_ip

    print(f"""
╔══════════════════════════════════════════════════╗
║          🎬  Video Gallery Server  🎬            ║
╠══════════════════════════════════════════════════╣
║  Address : http://{display_ip}:{user_port}
║  Videos  : {VIDEOS_DIR}
║  Found   : {count} video(s)
║  Static  : {STATIC_DIR}
╚══════════════════════════════════════════════════╝
    """)

    if count == 0:
        print(f"  ⚠  No videos found. Add files to:\n     {VIDEOS_DIR}\n")

    print("Server is running. Press Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n👋 Server stopped.")
        server.server_close()

if __name__ == "__main__":
    main()
