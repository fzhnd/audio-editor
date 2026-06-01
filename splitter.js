document.addEventListener('DOMContentLoaded', () => {
    const wavesurfers = {};
    let isPlaying = false, isReady = false, currentFolderName = "";

    const formatTime = (s) => {
        if (isNaN(s) || !isFinite(s)) return "00:00";
        return `${Math.floor(s/60).toString().padStart(2,'0')}:${Math.floor(s%60).toString().padStart(2,'0')}`;
    };

    const setupAll = () => {
        if (Object.keys(wavesurfers).length > 0) {
            Object.values(wavesurfers).forEach(ws => ws.destroy());
        }

        const tracks = ['vokal', 'bass', 'drum', 'gitar', 'piano', 'instrumen'];
        
        const colors = { 
            vokal: '#2474f6', 
            bass: '#ecbb26', 
            drum: '#ed4c4c', 
            gitar: '#fa7e25', 
            piano: '#a37839', 
            instrumen: '#2ed600' 
        };

        tracks.forEach(track => {
            wavesurfers[track] = WaveSurfer.create({
                container: `#wf-${track}`,
                waveColor: colors[track] + '80',
                progressColor: colors[track],
                height: 50,
                normalize: true
            });
            
            // Sinkronisasi Kursor saat ditarik
            wavesurfers[track].on('interaction', () => {
                const currentTime = wavesurfers[track].getCurrentTime();
                Object.values(wavesurfers).forEach(w => {
                    if (w !== wavesurfers[track]) {
                        w.setTime(currentTime);
                    }
                });
            });
            
            // Sinkronisasi Teks Waktu
            wavesurfers[track].on('audioprocess', () => {
                const cur = wavesurfers[track].getCurrentTime();
                const dur = wavesurfers[track].getDuration() || 0;
                const timeEl = document.getElementById(`time-${track}`);
                if (timeEl) timeEl.textContent = `${formatTime(cur)} / ${formatTime(dur)}`;
            });

            // Tampilkan Durasi Pertama Kali Saat Load Selesai
            wavesurfers[track].on('ready', () => {
                const cur = wavesurfers[track].getCurrentTime();
                const dur = wavesurfers[track].getDuration() || 0;
                const timeEl = document.getElementById(`time-${track}`);
                if (timeEl) timeEl.textContent = `${formatTime(cur)} / ${formatTime(dur)}`;
            });
        });

        // Set Patokan Durasi Utama di Atas
        wavesurfers.vokal.on('ready', () => { 
            isReady = true; 
            const dur = wavesurfers.vokal.getDuration();
            document.getElementById('file-duration').innerText = `Durasi: ${formatTime(dur)}`; 
        });

        // Kembali ke Play kalau lagu selesai
        wavesurfers.vokal.on('finish', () => {
            isPlaying = false;
            document.getElementById('master-play-icon').className = 'fas fa-play ml-1';
            Object.values(wavesurfers).forEach(ws => ws.setTime(0));
        });
    };

    // Tombol Master Play
    document.getElementById('btn-master-play').addEventListener('click', () => {
        if (!isReady) return;
        isPlaying = !isPlaying;
        Object.values(wavesurfers).forEach(w => isPlaying ? w.play() : w.pause());
        document.getElementById('master-play-icon').className = isPlaying ? 'fas fa-pause' : 'fas fa-play ml-1';
    });

    // Mute / Unmute menggunakan Ikon Speaker
    document.querySelectorAll('.toggle-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const targetBtn = e.currentTarget;
            const track = targetBtn.dataset.track;
            const icon = targetBtn.querySelector('i');
            const row = document.getElementById(`row-${track}`);
            
            if (wavesurfers[track]) {
                const isMuted = wavesurfers[track].getVolume() === 0;
                if (isMuted) {
                    wavesurfers[track].setVolume(1);
                    icon.className = 'fas fa-volume-up text-lg';
                    targetBtn.classList.replace('text-gray-400', 'text-purple-400');
                    row.style.opacity = '1';
                } else {
                    wavesurfers[track].setVolume(0);
                    icon.className = 'fas fa-volume-mute text-lg';
                    targetBtn.classList.replace('text-purple-400', 'text-gray-400');
                    row.style.opacity = '0.5';
                }
            }
        });
    });

    // Proses Upload File dengan Sistem Antrean
    const processFile = (file) => {
        const MAX_SIZE_MB = 50;
        const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

        if (file.size > MAX_SIZE_BYTES) {
            alert(`Gagal memuat "${file.name}". Ukuran file melebihi batas maksimal ${MAX_SIZE_MB}MB.`);
            return;
        }

        const desc = document.getElementById('tools-description');
        if (desc) desc.classList.add('hidden');

        document.getElementById('upload-section').classList.add('hidden');
        document.getElementById('loader-section').classList.remove('hidden');
        
        const loadingText = document.getElementById('loading-text');
        loadingText.innerText = "Memproses audio dengan AI...";
        
        const fd = new FormData(); 
        fd.append('audio_file', file);
        
        let progress = 0;
        const interval = setInterval(() => {
            if (progress < 95) progress += 1;
            document.getElementById('progress-bar').style.width = `${progress}%`;
        }, 500);

        // Fungsi Rekursif (Memanggil diri sendiri jika server membalas 429 / Penuh)
        function sendRequestToAI() {
            fetch('/api/process', { method: 'POST', body: fd })
                .then(response => {
                    if (response.status === 429) {
                        loadingText.innerText = "Menunggu antrean...";
                        setTimeout(sendRequestToAI, 5000); 
                        throw new Error("Sedang antre"); 
                    }
                    if (!response.ok) throw new Error("Server Gagal");
                    
                    loadingText.innerText = "Memproses audio dengan AI...";
                    return response.json();
                })
                .then(data => {
                    clearInterval(interval);
                    document.getElementById('progress-bar').style.width = `100%`;
                    
                    if (data.error) {
                        alert("Gagal memproses: " + data.error);
                        location.reload();
                        return;
                    }
                    
                    setTimeout(() => {
                        document.getElementById('loader-section').classList.add('hidden');
                        document.getElementById('result-section').classList.remove('hidden');
                        document.getElementById('file-name').innerText = file.name;
                        
                        const badge = document.getElementById('status-badge');
                        if (badge) {
                            badge.innerText = "Terpisah";
                            badge.className = "flex-shrink-0 bg-pink-100 text-theme-primary border border-pink-200 text-xs px-4 py-1.5 rounded-full font-bold shadow-sm";
                        }
                        
                        currentFolderName = data.folder_name;
                        setupAll();
                        
                        // Memuat file dari Backend
                        wavesurfers.vokal.load(`/api/files/${data.folder_name}/vokal`);
                        wavesurfers.bass.load(`/api/files/${data.folder_name}/bass`);
                        wavesurfers.drum.load(`/api/files/${data.folder_name}/drum`);
                        wavesurfers.gitar.load(`/api/files/${data.folder_name}/gitar`);
                        wavesurfers.piano.load(`/api/files/${data.folder_name}/piano`);
                        wavesurfers.instrumen.load(`/api/files/${data.folder_name}/instrumen`);
                    }, 500);
                })
                .catch(err => {
                    if(err.message !== "Sedang antre") {
                        clearInterval(interval);
                        console.error("Fetch error:", err);
                        alert("Terjadi kesalahan pada jaringan/server.");
                        location.reload();
                    }
                });
        }

        sendRequestToAI();
    };

    // Drag & Drop Listener
    const uploadSection = document.getElementById('upload-section');
    uploadSection.addEventListener('dragover', (e) => { e.preventDefault(); uploadSection.classList.add('border-pink-500'); });
    uploadSection.addEventListener('dragleave', () => { uploadSection.classList.remove('border-pink-500'); });
    uploadSection.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadSection.classList.remove('border-pink-500');
        if (e.dataTransfer.files.length > 0) processFile(e.dataTransfer.files[0]);
    });

    document.getElementById('file-input').addEventListener('change', (e) => {
        if (e.target.files.length) processFile(e.target.files[0]);
    });

    // Fitur Download dan Mengubah Status
    document.getElementById('btn-download').addEventListener('click', () => {
        const stem = document.getElementById('download-stem').value.toLowerCase();
        const fmt = document.getElementById('download-format').value.replace('.', '');
        window.location.href = `/api/download/${currentFolderName}/${stem}?format=${fmt}`;

        const badge = document.getElementById('status-badge');
        if (badge) {
            badge.innerText = "Selesai";
            badge.className = "flex-shrink-0 bg-purple-100 text-purple-700 border border-purple-200 text-xs px-4 py-1.5 rounded-full font-bold shadow-sm";
        }
    });
});