# Audio Editor & Splitter Web App

An AI-driven, highly optimized web application for editing audio and separating music stems. Built with a responsive UI and engineered for low-resource environments by implementing smart queueing, cloud storage integration (Supabase), and automated cleanup mechanisms.

## Features

### 1. Audio Tools (Browser-based DSP)
* **Trim / Cut:** Easily crop audio files using an intuitive visual waveform with fade-in and fade-out options.
* **Audio Manipulation:** Safely modify volume, playback speed, and pitch (semitones).
* **Band Equalizer:** Customize frequencies with built-in presets (Bass, Pop, Rock, Acoustic, etc.) or custom adjustments.
* **Smart Export:** Download edited audio as `.wav`, `.mp3`, `.flac`, `.m4a`, `.ogg`, or `.aac`. The export dropdown automatically detects and matches your uploaded file's format.
* **Editable Metadata:** Users can easily rename the output file directly from the UI before downloading.

### 2. Audio Splitter (AI Stem Separation)
* **Demucs AI Integration:** Precisely separate any song into 6 distinct stems: Vocals, Bass, Drums, Guitar, Piano, and Other Instruments.
* **Supabase Cloud Storage:** To maintain absolute server stability and zero local storage footprint, all separated AI audio stems are instantly uploaded to a Supabase bucket and streamed directly to the client.
* **Smart Queueing System:** Prevents server crashes (Out-Of-Memory) by handling concurrent users smoothly. If the AI is busy, users are automatically placed in a waiting queue (HTTP 429 Handling) until the compute resources are free.
* **Automated Cloud & Local Cleanup:** Temporary local files are instantly deleted post-processing. A background cleanup function automatically sweeps the Supabase cloud bucket to delete files older than 1 hour (3600 seconds), ensuring zero storage bloat.

## Tech Stack

**Frontend:**
* HTML5 & Vanilla JavaScript
* Tailwind CSS (Styling)
* WaveSurfer.js v7 (Audio visualization and playback)

**Backend & Cloud:**
* Python 3 & Flask (Web Server)
* FFmpeg (Digital Signal Processing & Format Conversion)
* Demucs (Music Source Separation AI)
* Supabase (Cloud Storage & API)
* Gunicorn (Production WSGI HTTP Server)

## Local Setup & Installation

Follow these steps to run the application on your local machine.

### Prerequisites
* Python 3.8+ installed.
* **FFmpeg** installed and added to your system's PATH.
* A **Supabase** account (Free tier is sufficient).

### Supabase Configuration
1. Create a new project on [Supabase](https://supabase.com/).
2. Navigate to **Storage** and create a new bucket named exactly `audio-stems`.
3. Set the bucket privacy to **Public**.
4. Go to **Project Settings > API Keys** and copy your **Secret Key** (`sb_secret_...`).
5. Open `app.py` in your local project and replace `SUPABASE_KEY` with your Secret Key.

### Installation Steps

**1. Clone the repository**
```bash
git clone [https://github.com/fzhnd/audio-editor.git](https://github.com/fzhnd/audio-editor.git)
cd audio-editor

```

**2. Install dependencies**
Create a virtual environment (recommended) and install the required Python packages:

```bash
pip install -r requirements.txt

```

**3. Run the server**

```bash
python app.py

```

**4. Access the application**
Open your browser and navigate to: `http://127.0.0.1:5000`

## Deployment Guide (Render)

If deploying to a cloud platform like Render, configure the following settings:

* **Build Command:** `pip install -r requirements.txt`
* **Start Command:** `gunicorn app:app --timeout 300` *(The 300s timeout is critical to prevent Gunicorn from terminating the long-running AI separation process).*

*Note: Ensure your Render instance has enough RAM (at least 512MB) to handle the FFmpeg processing and Demucs initialization. The implemented Thread Lock will prevent multiple AI instances from crashing the memory.*

## Project Structure

```text
audio-editor
 ┣ index.html        # Audio Tools UI
 ┣ tools.js          # Audio Tools Logic (with Auto-Format detection)
 ┣ splitter.html     # Audio Splitter UI
 ┣ splitter.js       # Audio Splitter Logic
 ┣ upload            # Temp directory for uploaded files (Auto-cleared)
 ┣ output            # Temp directory for FFmpeg outputs (Auto-cleared)
 ┣ app.py            # Main Flask app, AI Queue, and Supabase Auto-Cleanup
 ┣ requirements.txt  # Python dependencies (Flask, Demucs, Supabase, etc.)
 ┗ README.md         # Documentation