import os
import subprocess
import sys
import shutil
import time
import threading
import requests
from datetime import datetime, timezone
from flask import Flask, request, jsonify, send_from_directory, redirect
from supabase import create_client, Client

app = Flask(__name__, static_folder='.')

# ==========================================
# KONFIGURASI SUPABASE
# ==========================================
SUPABASE_URL = "https://hnzgvqckjwgjvockcawp.supabase.co"
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
BUCKET_NAME = "audio-stems"

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_FOLDER = os.path.join(BASE_DIR, 'upload')
OUTPUT_FOLDER = os.path.join(BASE_DIR, 'output')

os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(OUTPUT_FOLDER, exist_ok=True)

# Kunci antrean (WAJIB ADA untuk RAM 512MB)
ai_lock = threading.Lock()

def hapus_file_lama(max_age_seconds=3600): 
    # 1. BERSIHKAN FILE LOKAL (Dari fitur Tools/Edit)
    now = time.time()
    for folder in [UPLOAD_FOLDER, OUTPUT_FOLDER]:
        if not os.path.exists(folder): continue
        for filename in os.listdir(folder):
            file_path = os.path.join(folder, filename)
            try:
                if os.path.getmtime(file_path) < now - max_age_seconds:
                    if os.path.isdir(file_path): shutil.rmtree(file_path)
                    else: os.remove(file_path)
            except: pass
            
    # 2. BERSIHKAN FILE DI SUPABASE (Dari fitur Splitter)
    try:
        # Ambil daftar semua folder lagu di bucket
        folders = supabase.storage.from_(BUCKET_NAME).list()
        for folder in folders:
            folder_name = folder['name']
            if folder_name.startswith('.'): continue # Lewati file placeholder sistem
            
            # Ambil daftar file stem (vokal, bass, dll) di dalam folder tersebut
            files = supabase.storage.from_(BUCKET_NAME).list(folder_name)
            files_to_remove = []
            
            for f in files:
                file_name = f['name']
                created_at_str = f.get('created_at')
                
                if created_at_str:
                    # Ambil 19 karakter pertama (Format: YYYY-MM-DDTHH:MM:SS)
                    clean_time_str = created_at_str[:19]
                    created_time = datetime.strptime(clean_time_str, "%Y-%m-%dT%H:%M:%S")
                    created_time = created_time.replace(tzinfo=timezone.utc)
                    
                    # Hitung umur file dalam detik
                    age_seconds = (datetime.now(timezone.utc) - created_time).total_seconds()
                    
                    # Jika umur file > 1 jam, masukkan ke daftar hapus
                    if age_seconds > max_age_seconds:
                        files_to_remove.append(f"{folder_name}/{file_name}")
            
            # Eksekusi penghapusan massal ke Supabase
            if files_to_remove:
                supabase.storage.from_(BUCKET_NAME).remove(files_to_remove)
                print(f"[CLEANUP] Menghapus {len(files_to_remove)} file lama dari Supabase folder: {folder_name}")
    except Exception as e:
        print(f"[CLEANUP ERROR] Gagal menghapus file Supabase: {e}")

def map_stem_name(stem_name):
    mapping = {'vokal': 'vocals', 'drum': 'drums', 'gitar': 'guitar', 'piano': 'piano', 'instrumen': 'other', 'bass': 'bass'}
    return mapping.get(stem_name, stem_name)

# ==========================================
# ROUTING HALAMAN WEB (FRONTEND)
# ==========================================
@app.route('/')
@app.route('/index.html')
def index(): return send_from_directory('.', 'index.html')
@app.route('/splitter.html')
def splitter_page(): return send_from_directory('.', 'splitter.html')
@app.route('/tools.js')
def tools_script(): return send_from_directory('.', 'tools.js')
@app.route('/splitter.js')
def splitter_script(): return send_from_directory('.', 'splitter.js')

# ==========================================
# 1. API AUDIO SPLITTER (DEMUCS & SUPABASE)
# ==========================================
@app.route('/api/process', methods=['POST'])
def process_audio():
    # Cek & Hapus file lama sebelum memproses yang baru
    hapus_file_lama() 
    
    if not ai_lock.acquire(blocking=False):
        return jsonify({'error': 'Server AI sedang penuh, silakan antre'}), 429

    try:
        if 'audio_file' not in request.files: 
            return jsonify({'error': 'Tidak ada file'}), 400
        
        file = request.files['audio_file']
        folder_name = os.path.splitext(file.filename)[0]
        filepath = os.path.join(UPLOAD_FOLDER, file.filename)
        file.save(filepath)
        
        print(f"\n[SERVER] Memulai AI Demucs untuk: {file.filename}")
        command = [sys.executable, "-m", "demucs", "-n", "htdemucs_6s", "-o", OUTPUT_FOLDER, filepath, "--float32"]
        subprocess.run(command, check=True)
        
        # PROSES UPLOAD KE SUPABASE
        print(f"[SERVER] Mengunggah hasil ke Supabase...")
        target_dir = os.path.join(OUTPUT_FOLDER, 'htdemucs_6s', folder_name)
        stems = ['vocals.wav', 'drums.wav', 'bass.wav', 'guitar.wav', 'piano.wav', 'other.wav']
        
        for stem in stems:
            stem_path = os.path.join(target_dir, stem)
            if os.path.exists(stem_path):
                # Upload ke Supabase Storage (Menimpa file jika nama sama)
                supabase.storage.from_(BUCKET_NAME).upload(
                    path=f"{folder_name}/{stem}", 
                    file=stem_path, 
                    file_options={"upsert": "true", "content-type": "audio/wav"}
                )
        
        # HAPUS PERMANEN DARI SERVER LOKAL RENDER SECARA INSTAN
        shutil.rmtree(target_dir, ignore_errors=True)
        os.remove(filepath)
        
        return jsonify({'message': 'Sukses', 'folder_name': folder_name})
        
    except Exception as e: 
        print(f"[SERVER] Error: {e}")
        return jsonify({'error': str(e)}), 500
    finally:
        ai_lock.release()

@app.route('/api/files/<folder_name>/<stem_name>')
def get_file(folder_name, stem_name):
    # Mengarahkan browser (WaveSurfer) langsung ke link Supabase untuk streaming
    mapped_stem = f"{map_stem_name(stem_name)}.wav"
    file_path_in_bucket = f"{folder_name}/{mapped_stem}"
    public_url = supabase.storage.from_(BUCKET_NAME).get_public_url(file_path_in_bucket)
    return redirect(public_url)

@app.route('/api/download/<folder_name>/<stem_name>')
def download_file(folder_name, stem_name):
    fmt = request.args.get('format', 'wav').replace('.', '')
    mapped_stem = f"{map_stem_name(stem_name)}.wav"
    file_path_in_bucket = f"{folder_name}/{mapped_stem}"
    
    public_url = supabase.storage.from_(BUCKET_NAME).get_public_url(file_path_in_bucket)
    
    # Jika format WAV, pengguna langsung unduh dari Supabase
    if fmt == 'wav':
        return redirect(public_url)
    
    # Jika pengguna meminta MP3/FLAC, Render mengunduh file WAV dari Supabase, melakukan konversi dengan FFmpeg, lalu mengirimnya ke pengguna.
    temp_wav = os.path.join(OUTPUT_FOLDER, f"temp_{folder_name}_{mapped_stem}")
    out_file = os.path.join(OUTPUT_FOLDER, f"{folder_name}_{stem_name}.{fmt}")
    
    if not os.path.exists(out_file):
        r = requests.get(public_url)
        if r.status_code != 200:
            return "File tidak ditemukan di Cloud", 404
        
        with open(temp_wav, 'wb') as f:
            f.write(r.content)
            
        subprocess.run(["ffmpeg", "-y", "-i", temp_wav, out_file], check=True)
        os.remove(temp_wav) # Hapus file wav mentah lokal
        
    return send_from_directory(OUTPUT_FOLDER, f"{folder_name}_{stem_name}.{fmt}", as_attachment=True, download_name=f"{stem_name}.{fmt}")

# ==========================================
# 2. API AUDIO EDITOR (FFMPEG)
# ==========================================
@app.route('/api/edit', methods=['POST'])
def edit_audio():
    hapus_file_lama()
    if 'audio_file' not in request.files: 
        return jsonify({'error': 'No file'}), 400

    file = request.files['audio_file']
    input_path = os.path.join(UPLOAD_FOLDER, f"temp_{file.filename}")
    file.save(input_path)

    vol = int(request.form.get('volume', '0'))
    speed = request.form.get('speed', '1.0')
    pitch = float(request.form.get('pitch', '0'))
    eq_string = request.form.get('eq', '0,0,0,0,0,0,0,0,0,0')
    fmt = request.form.get('format', 'wav')

    filters = []
    if vol != 0:
        vol_ratio = (vol + 100) / 100.0
        filters.append(f"volume={vol_ratio}")
        
    if pitch != 0:
        semitones = float(pitch)
        rate = 2 ** (semitones / 12.0)
        filters.append(f"asetrate=44100*{rate},atempo=1/{rate}")
        
    if float(speed) != 1.0: 
        filters.append(f"atempo={speed}")

    eq_vals = eq_string.split(',')
    freqs = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]
    for i, gain in enumerate(eq_vals):
        if float(gain) != 0:
            filters.append(f"equalizer=f={freqs[i]}:width_type=o:w=1:g={gain}")

    output_name = f"edited_{os.path.splitext(file.filename)[0]}.{fmt}"
    output_path = os.path.join(OUTPUT_FOLDER, output_name)

    command = ["ffmpeg", "-y", "-i", input_path]
    if filters:
        command.extend(["-af", ",".join(filters)])
    command.append(output_path)

    try:
        subprocess.run(command, check=True)
        return send_from_directory(OUTPUT_FOLDER, output_name, as_attachment=True)
    except Exception as e:
        print(f"[SERVER] Error FFmpeg: {e}")
        return jsonify({'error': 'Edit Gagal'}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)