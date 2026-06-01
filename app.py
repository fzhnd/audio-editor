import os
import subprocess
import sys
import shutil
import time
from flask import Flask, request, jsonify, send_from_directory

app = Flask(__name__, static_folder='.')

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_FOLDER = os.path.join(BASE_DIR, 'upload')
OUTPUT_FOLDER = os.path.join(BASE_DIR, 'output')

os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(OUTPUT_FOLDER, exist_ok=True)

def hapus_file_lama(max_age_seconds=3600): 
    now = time.time()
    for folder in [UPLOAD_FOLDER, os.path.join(OUTPUT_FOLDER, 'htdemucs_6s'), OUTPUT_FOLDER]:
        if not os.path.exists(folder): continue
        for filename in os.listdir(folder):
            file_path = os.path.join(folder, filename)
            try:
                if os.path.getmtime(file_path) < now - max_age_seconds:
                    if os.path.isdir(file_path): shutil.rmtree(file_path)
                    else: os.remove(file_path)
            except: pass

def map_stem_name(stem_name):
    mapping = {'vokal': 'vocals', 'drum': 'drums', 'gitar': 'guitar', 'piano': 'piano', 'instrumen': 'other', 'bass': 'bass'}
    return mapping.get(stem_name, stem_name)

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
# 1. API AUDIO SPLITTER (DEMUCS)
# ==========================================
@app.route('/api/process', methods=['POST'])
def process_audio():
    hapus_file_lama() 
    if 'audio_file' not in request.files: return jsonify({'error': 'Tidak ada file'}), 400
    
    file = request.files['audio_file']
    filepath = os.path.join(UPLOAD_FOLDER, file.filename)
    file.save(filepath)
    
    print(f"\n[SERVER] Memulai AI Demucs untuk: {file.filename}")
    command = [sys.executable, "-m", "demucs", "-n", "htdemucs_6s", "-o", OUTPUT_FOLDER, filepath, "--float32"]
    
    try:
        subprocess.run(command, check=True)
        return jsonify({'message': 'Sukses', 'folder_name': os.path.splitext(file.filename)[0]})
    except subprocess.CalledProcessError as e: 
        print(f"[SERVER] Error Demucs: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/files/<folder_name>/<stem_name>')
def get_file(folder_name, stem_name):
    return send_from_directory(os.path.join(OUTPUT_FOLDER, 'htdemucs_6s', folder_name), f"{map_stem_name(stem_name)}.wav")

@app.route('/api/download/<folder_name>/<stem_name>')
def download_file(folder_name, stem_name):
    fmt = request.args.get('format', 'wav').replace('.', '')
    target_dir = os.path.join(OUTPUT_FOLDER, 'htdemucs_6s', folder_name)
    wav_path = os.path.join(target_dir, f"{map_stem_name(stem_name)}.wav")
    
    if not os.path.exists(wav_path): return "File terhapus", 404
    
    if fmt != 'wav':
        out = os.path.join(target_dir, f"{stem_name}.{fmt}")
        if not os.path.exists(out): subprocess.run(["ffmpeg", "-y", "-i", wav_path, out], check=True)
        return send_from_directory(target_dir, f"{stem_name}.{fmt}", as_attachment=True)
        
    return send_from_directory(target_dir, f"{map_stem_name(stem_name)}.wav", as_attachment=True, download_name=f"{stem_name}.wav")

# ==========================================
# 2. API AUDIO EDITOR (FFMPEG)
# ==========================================
@app.route('/api/edit', methods=['POST'])
def edit_audio():
    hapus_file_lama()
    if 'audio_file' not in request.files: return jsonify({'error': 'No file'}), 400

    file = request.files['audio_file']
    input_path = os.path.join(UPLOAD_FOLDER, f"temp_{file.filename}")
    file.save(input_path)

    vol = int(request.form.get('volume', '0'))
    speed = request.form.get('speed', '1.0')
    pitch = float(request.form.get('pitch', '0'))
    eq_string = request.form.get('eq', '0,0,0,0,0,0,0,0,0,0')
    fmt = request.form.get('format', 'wav')

    filters = []
    
    # Filter Volume
    vol_ratio = (vol + 100) / 100.0
    filters.append(f"volume={vol_ratio}")
    
    # Filter Pitch
    if pitch != 0:
        semitones = float(pitch)
        rate = 2 ** (semitones / 12.0)
        filters.append(f"asetrate=44100*{rate},atempo=1/{rate}")
        
    # Filter Speed
    if float(speed) != 1.0: filters.append(f"atempo={speed}")

    # Filter Equalizer
    eq_vals = eq_string.split(',')
    freqs = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]
    for i, gain in enumerate(eq_vals):
        if float(gain) != 0:
            filters.append(f"equalizer=f={freqs[i]}:width_type=o:w=1:g={gain}")

    output_name = f"edited_{os.path.splitext(file.filename)[0]}.{fmt}"
    output_path = os.path.join(OUTPUT_FOLDER, output_name)

    command = ["ffmpeg", "-y", "-i", input_path, "-af", ",".join(filters), output_path]
    try:
        subprocess.run(command, check=True)
        return send_from_directory(OUTPUT_FOLDER, output_name, as_attachment=True)
    except:
        return jsonify({'error': 'Edit Gagal'}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)