# Audio Editor & Splitter Web App

AI-driven web application for editing audio and separating music stems. Built with a responsive UI and optimized for servers with limited resources by implementing smart queuing and auto-deletion.

## Features

### 1. Audio Tools (Browser-based DSP)
* **Trim / Cut:** Easily crop audio files using an intuitive visual waveform with fade-in and fade-out options.
* **Audio Manipulation:** Safely modify volume, playback speed, and pitch (semitones).
* **Band Equalizer:** Customize frequencies with built-in presets (Bass, Pop, Rock, Acoustic, etc.) or custom adjustments.
* **Multi-Track Support:** Load up to 5 audio files simultaneously (Max 50 MB per file) to edit in one session.
* **Multiple Export Formats:** Download edited audio as `.wav`, `.mp3`, `.flac`, `.m4a`, `.ogg`, or `.aac`.

### 2. Audio Splitter (AI Stem Separation)
* **Demucs AI Integration:** Precisely separate any song into 6 distinct stems: *Vocals, Bass, Drums, Guitar, Piano, and Other Instruments*.
* **Smart Queueing System:** Prevents server crashes by handling concurrent users smoothly. If the AI is busy, users are automatically placed in a waiting queue (HTTP 429 Handling) until the process is free.
* **Auto-Cleanup:** Output files are temporarily stored and automatically deleted after 1 hour (3600 seconds) to maintain storage health.

---

## Tech Stack

**Frontend:**
* HTML5 & Vanilla JavaScript
* [Tailwind CSS](https://tailwindcss.com/) (Styling)
* [WaveSurfer.js v7](https://wavesurfer-js.org/) (Audio visualization and playback)

**Backend:**
* Python 3
* [Flask](https://flask.palletsprojects.com/) (Web Server)
* [FFmpeg](https://ffmpeg.org/) (Digital Signal Processing & Format Conversion)
* [Demucs](https://github.com/facebookresearch/demucs) (Music Source Separation AI)
* [Gunicorn](https://gunicorn.org/) (Production WSGI HTTP Server)

---

## Local Setup & Installation

Follow these steps to run the application on your local machine.

### Prerequisites
1. **Python 3.8+** installed.
2. **FFmpeg** installed and added to your system's PATH.

### Installation Steps

1. **Clone the repository**
```bash
git clone [https://github.com/fzhnd/audio-editor.git](https://github.com/fzhnd/audio-editor.git)
cd audio-editor

```


2. **Install dependencies**
Create a virtual environment (recommended) and install the required Python packages:
```bash
pip install -r requirements.txt

```


3. **Run the server**
```bash
python app.py

```


4. **Access the application**
Open your browser and navigate to: `http://localhost:5000`

---

## Deployment Guide (Render)

If deploying to a cloud platform like Render, configure the following settings:

* **Build Command:** `pip install -r requirements.txt`
* **Start Command:** `gunicorn app:app --timeout 300` *(The 300s timeout is required to prevent Gunicorn from terminating the long-running AI separation process).*

---

## Project Structure

```text
audio-editor
 ┣ 📜 index.html        # Audio Tools UI
 ┣ 📜 tools.js          # Audio Tools Logic
 ┣ 📜 splitter.html     # Audio Splitter UI
 ┣ 📜 splitter.js       # Audio Splitter Logic
 ┣ 📂 upload            # Temporary directory for uploaded files (Auto-generated)
 ┣ 📂 output            # Temporary directory for AI outputs (Auto-generated)
 ┣ 📜 app.py            # Main Flask application and API endpoints
 ┣ 📜 requirements.txt  # Python dependencies
 ┗ 📜 README.md

```
