let globalWsRegions = null;
let wavesurferInstance = null;
let audioCtx = null; 
let eqFilters = [];
let masterGainNode = null;
let allTracks = []; 
let activeTrackId = null; 

// Click outside untuk popup
document.addEventListener('click', (e) => {
    const fadeInBtn = document.getElementById('btn-fadein');
    const fadeInPopup = document.getElementById('popup-fadein');
    if (fadeInBtn && fadeInPopup && !fadeInBtn.contains(e.target) && !fadeInPopup.contains(e.target) && fadeInPopup.classList.contains('active')) {
        fadeInPopup.classList.remove('active');
    }
    
    const fadeOutBtn = document.getElementById('btn-fadeout');
    const fadeOutPopup = document.getElementById('popup-fadeout');
    if (fadeOutBtn && fadeOutPopup && !fadeOutBtn.contains(e.target) && !fadeOutPopup.contains(e.target) && fadeOutPopup.classList.contains('active')) {
        fadeOutPopup.classList.remove('active');
    }
    
    const mobileBtn = document.getElementById('btn-mobile-menu');
    const toolsContainer = document.getElementById('tools-container');
    if (mobileBtn && toolsContainer && !mobileBtn.contains(e.target) && !toolsContainer.contains(e.target)) {
        if (window.innerWidth < 1024) toolsContainer.classList.add('hidden');
    }
});

// Kontrol trim manual
window.adjustTrim = function(type, amount) {
    if(!globalWsRegions || globalWsRegions.getRegions().length === 0) return;
    const region = globalWsRegions.getRegions()[0];
    let newStart = region.start; let newEnd = region.end;
    
    if(type === 'start') newStart = Math.max(0, Math.round((newStart + amount)*10)/10);
    if(type === 'end') newEnd = Math.min(wavesurferInstance.getDuration(), Math.round((newEnd + amount)*10)/10);
    if(newStart >= newEnd - 0.1) return; 
    
    region.setOptions({ start: newStart, end: newEnd });

    if (type === 'start' && wavesurferInstance && !wavesurferInstance.isPlaying()) {
        wavesurferInstance.setTime(newStart);
    }
    
    const speed = getActiveTrack() ? (getActiveTrack().speed || 1) : 1;
    
    document.getElementById('trim-start').innerText = formatTimeDecimal(newStart / speed);
    document.getElementById('trim-end').innerText = formatTimeDecimal(newEnd / speed);
    
    const track = getActiveTrack();
    if(track) {
        const trackDiv = document.getElementById(track.id);
        if(trackDiv) {
            const startEl = trackDiv.querySelector('.wf-bound-start');
            const endEl = trackDiv.querySelector('.wf-bound-end');
            if(startEl) startEl.innerText = formatTimeDecimal(newStart / speed);
            if(endEl) endEl.innerText = formatTimeDecimal(newEnd / speed);
        }
    }
    
    if (typeof window.triggerEditState === 'function') window.triggerEditState();
}

// Fungsi Format Waktu
function formatTimeDecimal(seconds) {
    if (isNaN(seconds) || !isFinite(seconds)) return "00:00.0";
    const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
    const secs = Math.floor(seconds % 60).toString().padStart(2, '0');
    const ms = Math.floor((seconds % 1) * 10); 
    return `${mins}:${secs}.${ms}`;
}

// Fungsi Penomoran & Durasu Total Trek
window.renumberTracks = function() {
    const container = document.getElementById('tracks-container');
    const items = container.querySelectorAll('.track-item');
    items.forEach((item, index) => {
        const numSpan = item.querySelector('.track-number');
        if(numSpan) numSpan.innerText = (index + 1) + '.';
    });
    updateTotalDuration();
}

function updateTotalDuration() {
    let total = 0;
    allTracks.forEach(t => { 
        const speed = t.speed || 1;
        if(t.ws && t.ws.getDuration) total += (t.ws.getDuration() || 0) / speed; 
    });
    document.getElementById('file-duration').innerText = `Total Durasi: ${formatTimeDecimal(total)}`;
}

function getActiveTrack() {
    return allTracks.find(t => t.id === activeTrackId);
}

// Fungsi Converter Audio ke WAV
function audioBufferToWav(buffer) {
    let numOfChan = buffer.numberOfChannels, 
        length = buffer.length * numOfChan * 2 + 44,
        bufferArray = new ArrayBuffer(length), 
        view = new DataView(bufferArray),
        channels = [], i, sample, offset = 0, pos = 0;
        
    function setUint16(data) { view.setUint16(pos, data, true); pos += 2; }
    function setUint32(data) { view.setUint32(pos, data, true); pos += 4; }
    
    setUint32(0x46464952); setUint32(length - 8); setUint32(0x45564157); 
    setUint32(0x20746d66); setUint32(16); setUint16(1); setUint16(numOfChan); 
    setUint32(buffer.sampleRate); setUint32(buffer.sampleRate * 2 * numOfChan); 
    setUint16(numOfChan * 2); setUint16(16); setUint32(0x61746164); setUint32(length - pos - 4);
    
    for(i = 0; i < buffer.numberOfChannels; i++) channels.push(buffer.getChannelData(i));
    
    while(pos < length) {
        for(i = 0; i < numOfChan; i++) {
            sample = Math.max(-1, Math.min(1, channels[i][offset])); 
            sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767)|0; 
            view.setInt16(pos, sample, true); 
            pos += 2;
        } 
        offset++;
    } 
    return new Blob([bufferArray], {type: "audio/wav"});
}

// Setup Awal dan Sinkronisasi
document.addEventListener('DOMContentLoaded', () => {
    let isPlaying = false; 
    let editedBlobUrl = null; 
    let editedFileName = "";
    const eqFrequencies = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

    // Fungsi Trigger Edit State
    window.triggerEditState = function() {
        const badge = document.getElementById('status-badge');
        badge.innerText = "Diproses"; 
        badge.className = 'flex-shrink-0 bg-pink-100 text-theme-primary border border-pink-200 text-[10px] sm:text-xs px-3 sm:px-4 py-1.5 rounded-full font-bold shadow-sm';
    }

    // Fungsi Update Titik Merah Penanda Fitur
    function updateFeatureDots() {
        const vol = parseInt(document.getElementById('slider-volume').value);
        const speed = parseFloat(document.getElementById('slider-speed').value);
        const pitch = parseFloat(document.getElementById('slider-pitch').value);
        
        let eqChanged = false; 
        document.querySelectorAll('.eq-band').forEach(b => { 
            if(parseFloat(b.value) !== 0) eqChanged = true; 
        });

        document.getElementById('dot-volume').style.display = vol !== 0 ? 'block' : 'none';
        document.getElementById('dot-speed').style.display = speed !== 1.0 ? 'block' : 'none';
        document.getElementById('dot-pitch').style.display = pitch !== 0 ? 'block' : 'none';
        document.getElementById('dot-equalizer').style.display = eqChanged ? 'block' : 'none';
        
        const track = getActiveTrack();
        if (track && track.history && track.history[track.historyIndex]) {
            document.getElementById('dot-trim').style.display = track.history[track.historyIndex].isEditedWave ? 'block' : 'none';
        }

        const activeToolDisplay = document.getElementById('active-tool-display');
        const activeBtn = document.querySelector('.tool-btn.active');
        if (activeToolDisplay && activeBtn) {
            let clone = activeBtn.cloneNode(true); 
            let dot = clone.querySelector('.dot-indicator');
            if(dot) dot.remove(); 
            activeToolDisplay.innerHTML = clone.innerHTML.trim();
        }
    }

    // Fungsi Save State (Memori Undo/Redo)
    function saveState(blob, isNewLoad = false, hasEditedWaveform = false) {
        const track = getActiveTrack(); 
        if(!track) return;
        
        const eqVals = Array.from(document.querySelectorAll('.eq-band')).map(s => s.value);
        const state = {
            blob: blob, 
            vol: document.getElementById('slider-volume').value, 
            speed: document.getElementById('slider-speed').value, 
            pitch: document.getElementById('slider-pitch').value,
            eq: eqVals, 
            isEditedWave: hasEditedWaveform, 
            eqPreset: document.getElementById('eq-preset-select').value
        };
        
        if(!isNewLoad) {
            const curr = track.history[track.historyIndex];
            // Mengecek agar tidak duplikat riwayat
            if (curr && curr.vol === state.vol && curr.speed === state.speed && 
                curr.pitch === state.pitch && curr.eq.join(',') === state.eq.join(',') && 
                curr.isEditedWave === state.isEditedWave && curr.blob === state.blob) return; 
                
            track.history = track.history.slice(0, track.historyIndex + 1);
        }
        
        track.history.push(state); 
        track.historyIndex = track.history.length - 1; 
        updateUndoRedoUI(); 
        updateFeatureDots();
    }

    // Fungsi Update Tampilan Tombol Undo/Redo
    function updateUndoRedoUI() {
        const track = getActiveTrack(); 
        const undoBtn = document.getElementById('btn-undo'); 
        const redoBtn = document.getElementById('btn-redo');
        if(!track) return;
        
        if(track.historyIndex > 0) undoBtn.className = 'px-3 py-2 text-gray-700 hover:text-theme-primary cursor-pointer transition-colors';
        else undoBtn.className = 'px-3 py-2 text-gray-300 cursor-not-allowed pointer-events-none transition-colors';
        
        if(track.historyIndex < track.history.length - 1) redoBtn.className = 'px-3 py-2 text-gray-700 hover:text-theme-primary cursor-pointer transition-colors';
        else redoBtn.className = 'px-3 py-2 text-gray-300 cursor-not-allowed pointer-events-none transition-colors';
    }

    // Event Listener Undo/Redo
    document.getElementById('btn-undo').addEventListener('click', () => { 
        const t = getActiveTrack(); 
        if(t && t.historyIndex > 0) { t.historyIndex--; restoreState(t.history[t.historyIndex]); updateUndoRedoUI(); } 
    });
    
    document.getElementById('btn-redo').addEventListener('click', () => { 
        const t = getActiveTrack(); 
        if(t && t.historyIndex < t.history.length - 1) { t.historyIndex++; restoreState(t.history[t.historyIndex]); updateUndoRedoUI(); } 
    });

    // Event Listener Undo/Redo
    document.getElementById('btn-undo').addEventListener('click', () => { 
        if (editedBlobUrl) { 
            window.triggerEditState(); 
            updateUndoRedoUI();
            return;
        }
        const t = getActiveTrack(); 
        if(t && t.historyIndex > 0) { 
            t.historyIndex--; 
            restoreState(t.history[t.historyIndex]); 
            updateUndoRedoUI(); 
        } 
    });
    
    document.getElementById('btn-redo').addEventListener('click', () => { 
        const t = getActiveTrack(); 
        if(t && t.historyIndex < t.history.length - 1) { 
            t.historyIndex++; 
            restoreState(t.history[t.historyIndex]); 
            updateUndoRedoUI(); 
        } 
    });

    // Fungsi Restore State dari History
    function restoreState(state) {
        const track = getActiveTrack(); 
        if(!track) return; 
        
        track.file = state.blob;
        document.getElementById('slider-volume').value = state.vol; 
        document.getElementById('slider-speed').value = state.speed; 
        document.getElementById('slider-pitch').value = state.pitch;
        document.getElementById('eq-preset-select').value = state.eqPreset;
        
        const eqBands = document.querySelectorAll('.eq-band');
        state.eq.forEach((val, i) => { if(eqBands[i]) eqBands[i].value = val; });
        
        document.getElementById('slider-volume').dispatchEvent(new Event('input')); 
        document.getElementById('slider-speed').dispatchEvent(new Event('input')); 
        document.getElementById('slider-pitch').dispatchEvent(new Event('input'));
        
        updateEqualizer(); 
        updateFeatureDots(); 
        window.triggerEditState(); 
        loadWaveformForTrack(track, state.blob); 
    }

    // UI Panel Navigation
    const btnMobileMenu = document.getElementById('btn-mobile-menu'); 
    const toolsContainer = document.getElementById('tools-container');
    if (btnMobileMenu) btnMobileMenu.addEventListener('click', () => { toolsContainer.classList.toggle('hidden'); });

    document.querySelectorAll('.tool-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active')); 
            document.querySelectorAll('.tool-panel').forEach(p => p.classList.remove('active'));
            
            btn.classList.add('active'); 
            document.getElementById(btn.getAttribute('data-target')).classList.add('active');
            
            updateFeatureDots(); 
            if(window.innerWidth < 1024 && toolsContainer) toolsContainer.classList.add('hidden'); 
        });
    });

    // Fade in/Fade out
    const btnFadeIn = document.getElementById('btn-fadein'); 
    const popupFadeIn = document.getElementById('popup-fadein'); 
    const sliderFadeIn = document.getElementById('slider-fadein');
    
    btnFadeIn.addEventListener('click', () => { 
        popupFadeIn.classList.toggle('active'); 
        document.getElementById('popup-fadeout').classList.remove('active'); 
    });
    
    sliderFadeIn.addEventListener('input', (e) => { 
        document.getElementById('text-fadein').innerText = `Fade in: ${e.target.value} sec`; 
        updateSliderFill(sliderFadeIn, e.target.value, 0, 30, null); 
    });
    
    sliderFadeIn.addEventListener('change', (e) => { 
        const val = parseFloat(e.target.value); 
        if(val > 0) applyFadeDestructive('in', val); 
        setTimeout(() => popupFadeIn.classList.remove('active'), 300); 
    });

    const btnFadeOut = document.getElementById('btn-fadeout'); 
    const popupFadeOut = document.getElementById('popup-fadeout'); 
    const sliderFadeOut = document.getElementById('slider-fadeout');
    
    btnFadeOut.addEventListener('click', () => { 
        popupFadeOut.classList.toggle('active'); 
        popupFadeIn.classList.remove('active'); 
    });
    
    sliderFadeOut.addEventListener('input', (e) => { 
        document.getElementById('text-fadeout').innerText = `Fade out: ${e.target.value} sec`; 
        updateSliderFill(sliderFadeOut, e.target.value, 0, 30, null); 
    });
    
    sliderFadeOut.addEventListener('change', (e) => { 
        const val = parseFloat(e.target.value); 
        if(val > 0) applyFadeDestructive('out', val); 
        setTimeout(() => popupFadeOut.classList.remove('active'), 300); 
    });

    function applyFadeDestructive(type, seconds) {
        const track = getActiveTrack();
        if(!track || seconds <= 0 || !track.ws) return;
        
        const buffer = track.ws.getDecodedData(); 
        if(!buffer) return;

        const sampleRate = buffer.sampleRate; 
        const length = buffer.length; 
        const channels = buffer.numberOfChannels;
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const newBuffer = ctx.createBuffer(channels, length, sampleRate);
        const fadeSamples = Math.floor(seconds * sampleRate);

        for(let c = 0; c < channels; c++) {
            const channelData = buffer.getChannelData(c); 
            const newData = newBuffer.getChannelData(c);
            
            for(let i = 0; i < length; i++) {
                let multiplier = 1;
                if(type === 'in' && i < fadeSamples) multiplier = i / fadeSamples;
                else if (type === 'out' && i > length - fadeSamples) multiplier = (length - i) / fadeSamples;
                newData[i] = channelData[i] * multiplier;
            }
        }
        
        const wavBlob = audioBufferToWav(newBuffer); 
        track.file = wavBlob;
        window.triggerEditState(); 
        saveState(wavBlob, false, true); 
        loadWaveformForTrack(track, wavBlob);
    }

    // Slider Background Updater
    function updateSliderFill(slider, value, min, max, defaultValue = null) {
        const percent = ((value - min) / (max - min)) * 100; 
        const colorFill = '#ef2871'; 
        const colorTrack = '#fbcfe8'; 
        
        if (defaultValue !== null) {
            const center = ((defaultValue - min) / (max - min)) * 100; 
            if (percent > center) {
                slider.style.background = `linear-gradient(to right, ${colorTrack} ${center}%, ${colorFill} ${center}%, ${colorFill} ${percent}%, ${colorTrack} ${percent}%)`;
            } else {
                slider.style.background = `linear-gradient(to right, ${colorTrack} ${percent}%, ${colorFill} ${percent}%, ${colorFill} ${center}%, ${colorTrack} ${center}%)`;
            }
        } else { 
            slider.style.background = `linear-gradient(to right, ${colorFill} 0%, ${colorFill} ${percent}%, ${colorTrack} ${percent}%, ${colorTrack} 100%)`; 
        }
    }

    // Equalizer & Gain Volume
    function setupEqualizerFilters() {
        if(!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        
        if(!masterGainNode) {
            masterGainNode = audioCtx.createGain();
            masterGainNode.connect(audioCtx.destination);
        }

        if(eqFilters.length === 0) {
            eqFrequencies.forEach(freq => { 
                const eq = audioCtx.createBiquadFilter(); 
                eq.type = 'peaking'; 
                eq.frequency.value = freq; 
                eq.Q.value = 1; 
                eq.gain.value = 0; 
                eqFilters.push(eq); 
            });
            for(let i=0; i<eqFilters.length-1; i++) {
                eqFilters[i].connect(eqFilters[i+1]);
            }
            eqFilters[eqFilters.length-1].connect(masterGainNode);
        }
    }

    function updateEqualizer() {
        const bands = document.querySelectorAll('.eq-band'); 
        bands.forEach((band, i) => { 
            const val = parseFloat(band.value); 
            if(eqFilters[i]) eqFilters[i].gain.value = val; 
        });
        updateFeatureDots();
    }

    document.querySelectorAll('.eq-band').forEach(band => {
        band.addEventListener('input', () => { 
            document.getElementById('eq-preset-select').value = 'custom'; 
            updateEqualizer(); 
        });
        band.addEventListener('change', () => { 
            window.triggerEditState(); 
            saveState(getActiveTrack().file, false, getActiveTrack().history[getActiveTrack().historyIndex].isEditedWave); 
        });
    });

    document.getElementById('eq-preset-select').addEventListener('change', (e) => {
        if(e.target.value === 'custom') return;
        
        const vals = e.target.value.split(','); 
        const bands = document.querySelectorAll('.eq-band');
        bands.forEach((band, i) => { if(vals[i] !== undefined) band.value = vals[i]; });
        
        updateEqualizer(); 
        window.triggerEditState(); 
        saveState(getActiveTrack().file, false, getActiveTrack().history[getActiveTrack().historyIndex].isEditedWave);
    });

    // Fungsi Kotak Multi-Track
    function selectTrack(trackId) {
        activeTrackId = trackId; 
        const track = getActiveTrack(); 
        if(!track) return;
        
        allTracks.forEach(t => {
            const el = document.getElementById(t.id);
            if (!el) return;
            const header = el.querySelector('.track-header');
            const controls = el.querySelector('.track-controls');
            const wfContainer = el.querySelector('.waveform-container');
            
            if (t.id !== trackId) {
                t.ws.pause();
                
                // Style Trek Inaktif
                el.className = 'track-item relative bg-[#fcf0f4] border border-pink-200 opacity-60 transition-all duration-300 rounded-xl px-4 py-3 shadow-sm cursor-pointer mb-3';
                
                t.ws.setOptions({ height: 35 }); 
                t.wsRegions.getRegions().forEach(r => r.setOptions({ color: 'rgba(0,0,0,0)' }));
                el.querySelector('.track-bounds').style.display = 'none';
                
                if(header) header.style.display = 'none';
                if(controls) controls.style.display = 'none';
                
                if(wfContainer) {
                    wfContainer.classList.remove('mt-12', 'mt-8', 'mt-6', 'mt-2', 'h-24');
                    wfContainer.classList.add('mt-0', 'h-[35px]');
                }
            } else {
                // Style Trek Aktif
                el.className = 'track-item relative bg-white border-2 border-pink-500 transition-all duration-300 rounded-xl px-4 pt-12 pb-2 shadow-md cursor-pointer mb-5';
                
                t.ws.setOptions({ height: 96 }); 
                t.wsRegions.getRegions().forEach(r => r.setOptions({ color: 'rgba(209, 179, 255, 0.4)' }));
                el.querySelector('.track-bounds').style.display = 'flex';
                
                if(header) header.style.display = 'flex';
                if(controls) controls.style.display = 'flex';
                
                if(wfContainer) {
                    wfContainer.classList.remove('mt-0', 'h-[35px]');
                    wfContainer.classList.add('mt-4', 'h-24');
                }
            }
        });

        wavesurferInstance = track.ws; 
        globalWsRegions = track.wsRegions;

        if(track.history.length > 0) {
            const state = track.history[track.historyIndex];
            document.getElementById('slider-volume').value = state.vol; 
            document.getElementById('slider-speed').value = state.speed; 
            document.getElementById('slider-pitch').value = state.pitch; 
            document.getElementById('eq-preset-select').value = state.eqPreset;
            
            const eqBands = document.querySelectorAll('.eq-band');
            state.eq.forEach((val, i) => { if(eqBands[i]) eqBands[i].value = val; });
        } else {
            document.getElementById('slider-volume').value = 0; 
            document.getElementById('slider-speed').value = 1; 
            document.getElementById('slider-pitch').value = 0; 
            document.getElementById('eq-preset-select').value = '0,0,0,0,0,0,0,0,0,0'; 
            document.querySelectorAll('.eq-band').forEach(b => b.value = 0);
        }

        document.getElementById('slider-volume').dispatchEvent(new Event('input')); 
        document.getElementById('slider-speed').dispatchEvent(new Event('input')); 
        document.getElementById('slider-pitch').dispatchEvent(new Event('input'));
        
        updateEqualizer(); 
        updateUndoRedoUI(); 
        updateFeatureDots();
        updateTrackBoundsUI(track);
        
        document.getElementById('play-icon').className = track.ws.isPlaying() ? 'fas fa-pause' : 'fas fa-play ml-1';
    }
    
    function updateTrackBoundsUI(track) {
        if(!track || !track.wsRegions) return;
        const speed = track.speed || 1;
        
        if (track.wsRegions.getRegions().length > 0) {
            const region = track.wsRegions.getRegions()[0];
            document.getElementById('trim-start').innerText = formatTimeDecimal(region.start / speed); 
            document.getElementById('trim-end').innerText = formatTimeDecimal(region.end / speed);
            
            const trackDiv = document.getElementById(track.id);
            if(trackDiv) {
                const startEl = trackDiv.querySelector('.wf-bound-start');
                const endEl = trackDiv.querySelector('.wf-bound-end');
                if(startEl) startEl.innerText = formatTimeDecimal(region.start / speed);
                if(endEl) endEl.innerText = formatTimeDecimal(region.end / speed);
            }
        }
    }

    function addTrackToUI(file) {
        const container = document.getElementById('tracks-container');
        const trackId = 'track-' + Date.now();
        
        const trackDiv = document.createElement('div');
        trackDiv.className = 'track-item relative bg-[#fcf0f4] border-2 border-pink-500 transition-all duration-300 rounded-xl px-4 pt-12 pb-2 shadow-md cursor-pointer mb-5';
        trackDiv.id = trackId;
        
        trackDiv.innerHTML = `
            <div class="track-header absolute top-3 left-4 bg-white px-3 py-1 border border-pink-200 rounded-full text-[10px] sm:text-xs font-bold text-gray-600 shadow-sm z-10 flex items-center gap-1 transition-all">
                <span class="track-number font-bold text-theme-primary"></span>
                <span class="max-w-[120px] sm:max-w-[200px] text-gray-600 truncate" title="${file.name}">${file.name}</span>
            </div>
            
            <div class="track-controls absolute top-3 right-4 bg-white border border-pink-200 rounded-full shadow-sm flex items-center px-2 py-1 gap-2 text-xs z-10 transition-all">
                <button class="btn-move-up text-gray-400 hover:text-theme-primary transition px-1" title="Geser ke Atas"><i class="fas fa-arrow-up"></i></button>
                <div class="w-px h-3 bg-gray-200"></div>
                <button class="btn-move-down text-gray-400 hover:text-theme-primary transition px-1" title="Geser ke Bawah"><i class="fas fa-arrow-down"></i></button>
                <div class="w-px h-3 bg-gray-200"></div>
                <button class="btn-delete text-gray-400 hover:text-red-500 transition px-1" title="Hapus Trek"><i class="fas fa-trash"></i></button>
            </div>
            
            <div class="mx-3 relative">
                <div class="waveform-container w-full h-24 mt-4 transition-all duration-300" id="wf-${trackId}">
                    <div class="playhead-bubble absolute top-0 transform -translate-x-1/2 -translate-y-full mb-1 bg-white text-gray-800 border border-gray-300 shadow-sm text-[10px] font-bold px-1.5 py-0.5 rounded-full font-mono z-20 pointer-events-none hidden whitespace-nowrap">00:00.0</div>
                </div>
            </div>
            
            <div class="track-bounds flex justify-between text-[10px] sm:text-[11px] text-gray-400 font-mono mt-1 w-full px-3">
                <span class="wf-bound-start">00:00.0</span>
                <span class="wf-bound-end">00:00.0</span>
            </div>
        `;
        container.appendChild(trackDiv);
        setupEqualizerFilters();

        const ws = WaveSurfer.create({ 
            container: `#wf-${trackId}`, 
            waveColor: '#f9a8d4', 
            progressColor: '#d81b60', 
            cursorColor: '#4c1d95', 
            barWidth: 2, 
            barRadius: 2, 
            height: 'auto', 
            normalize: true,
            dragToSeek: true 
        });
        
        const wsRegions = ws.registerPlugin(WaveSurfer.Regions.create());
        const trackObj = { id: trackId, file: file, ws: ws, wsRegions: wsRegions, history: [], historyIndex: -1, speed: 1.0 };
        allTracks.push(trackObj);

        ws.load(URL.createObjectURL(file));

        ws.on('ready', () => {
            if(audioCtx) { 
                try { 
                    const source = audioCtx.createMediaElementSource(ws.getMediaElement()); 
                    source.connect(eqFilters[0]); 
                } catch(e){} 
            }
            
            const dur = ws.getDuration();
            wsRegions.addRegion({ start: 0, end: dur, color: 'rgba(209, 179, 255, 0.4)', resize: true, drag: true });
            
            const startEl = trackDiv.querySelector('.wf-bound-start');
            const endEl = trackDiv.querySelector('.wf-bound-end');
            if(startEl) startEl.innerText = formatTimeDecimal(0);
            if(endEl) endEl.innerText = formatTimeDecimal(dur);

            window.renumberTracks();
            selectTrack(trackId);
            if(trackObj.history.length === 0) saveState(file, true, false); 
        });

        const updateBubble = (time) => {
            const speed = trackObj.speed || 1;
            const bubble = trackDiv.querySelector('.playhead-bubble');
            if (bubble && ws.getDuration()) {
                bubble.innerText = formatTimeDecimal(time / speed);
                bubble.style.left = `${(time / ws.getDuration()) * 100}%`;
                if(activeTrackId === trackId) bubble.classList.remove('hidden');
            }
        };

        ws.on('timeupdate', updateBubble);
        ws.on('seeking', updateBubble); 
        
        ws.on('interaction', () => { 
            allTracks.forEach(t => { if(t.id !== trackId) t.ws.pause(); });
            selectTrack(trackId); 
            updateBubble(ws.getCurrentTime());
        });
        
        ws.on('play', () => { 
            if(activeTrackId === trackId) {
                document.getElementById('play-icon').className = 'fas fa-pause'; 
                document.getElementById('btn-play').title = 'Pause';
            }
        });
        
        ws.on('pause', () => { 
            if(activeTrackId === trackId) {
                document.getElementById('play-icon').className = 'fas fa-play ml-1'; 
                document.getElementById('btn-play').title = 'Play';
            }
        });
        
        ws.on('finish', () => { 
            const currentIndex = allTracks.findIndex(t => t.id === trackId);
            
            if (currentIndex !== -1 && currentIndex < allTracks.length - 1) {
                const nextTrack = allTracks[currentIndex + 1];
                selectTrack(nextTrack.id); 
                nextTrack.ws.setTime(0); 
                nextTrack.ws.play(); 
            } else {
                if(activeTrackId === trackId) {
                    document.getElementById('play-icon').className = 'fas fa-play ml-1'; 
                    document.getElementById('btn-play').title = 'Play';
                }
            }
        });

        wsRegions.on('region-updated', (region) => {
            if (activeTrackId !== trackId) selectTrack(trackId);
            updateTrackBoundsUI(trackObj);
            
            if (!ws.isPlaying()) {
                ws.setTime(region.start);
            }
        });

        trackDiv.addEventListener('click', () => selectTrack(trackId));
        trackDiv.querySelector('.btn-delete').addEventListener('click', (e) => { e.stopPropagation(); deleteTrack(trackId); });
        trackDiv.querySelector('.btn-move-up').addEventListener('click', (e) => { e.stopPropagation(); moveTrackDOM(trackDiv, -1); });
        trackDiv.querySelector('.btn-move-down').addEventListener('click', (e) => { e.stopPropagation(); moveTrackDOM(trackDiv, 1); });
    }

    function deleteTrack(id) {
        const trk = document.getElementById(id); 
        if (trk) trk.remove();
        
        const index = allTracks.findIndex(t => t.id === id);
        if (index > -1) { 
            allTracks[index].ws.destroy(); 
            allTracks.splice(index, 1); 
        }
        window.renumberTracks();
        
        if (allTracks.length === 0) {
            document.getElementById('result-section').classList.add('hidden');
            document.getElementById('upload-section').classList.remove('hidden');
            document.getElementById('tools-description').classList.remove('hidden');
        } else { 
            selectTrack(allTracks[0].id); 
        }
    }

    function moveTrackDOM(element, direction) {
        if (direction === -1 && element.previousElementSibling) {
            element.parentNode.insertBefore(element, element.previousElementSibling);
        } else if (direction === 1 && element.nextElementSibling) {
            element.parentNode.insertBefore(element.nextElementSibling, element);
        }
        window.renumberTracks();
    }

    function loadWaveformForTrack(track, blob) {
        track.file = blob; 
        track.ws.load(URL.createObjectURL(blob));
        track.ws.on('ready', () => { 
            const dur = track.ws.getDuration();
            track.wsRegions.clearRegions();
            track.wsRegions.addRegion({ start: 0, end: dur, color: 'rgba(209, 179, 255, 0.4)', resize: true, drag: true });
            
            const trackDiv = document.getElementById(track.id);
            if(trackDiv) {
                const startEl = trackDiv.querySelector('.wf-bound-start');
                const endEl = trackDiv.querySelector('.wf-bound-end');
                const speed = track.speed || 1;
                if(startEl) startEl.innerText = formatTimeDecimal(0);
                if(endEl) endEl.innerText = formatTimeDecimal(dur / speed);
            }
            window.renumberTracks();
        });
    }

    // Fungsi Proses File ke dalam UI
    const processFile = (file, isAddFile = false) => {
        const toolsDesc = document.getElementById('tools-description'); 
        if (toolsDesc) toolsDesc.classList.add('hidden');
        
        if(!isAddFile) {
            document.getElementById('upload-section').classList.add('hidden'); 
            document.getElementById('loader-section').classList.remove('hidden');
            document.getElementById('project-file-name').value = file.name;
        } else {
            document.getElementById('track-loader').classList.remove('hidden');
        }
        
        let progress = 0; 
        const interval = setInterval(() => { 
            progress += 20; 
            if(document.getElementById('progress-bar')) {
                document.getElementById('progress-bar').style.width = `${progress}%`;
            }
        }, 100);

        setTimeout(() => {
            clearInterval(interval);
            addTrackToUI(file);
            if(!isAddFile) {
                document.getElementById('loader-section').classList.add('hidden'); 
                document.getElementById('result-section').classList.remove('hidden');
            } else {
                document.getElementById('track-loader').classList.add('hidden');
            }
        }, 500);
    };

    // Fungsi Limit File
    function handleFileUpload(files, isAddFile) {
        const MAX_FILES = 5;
        const MAX_SIZE_MB = 50;
        const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

        let currentFileCount = allTracks.length;
        let validFiles = [];

        for (let i = 0; i < files.length; i++) {
            const file = files[i];

            // Mengecek ukuran file
            if (file.size > MAX_SIZE_BYTES) {
                alert(`Gagal memuat "${file.name}". Ukuran file melebihi batas maksimal ${MAX_SIZE_MB}MB.`);
                continue; 
            }

            // Mengecek jumlah maksimal file
            if (currentFileCount >= MAX_FILES) {
                alert(`Batas maksimal tercapai: Hanya bisa memuat maksimal ${MAX_FILES} trek audio.`);
                break; 
            }

            validFiles.push(file);
            currentFileCount++;
        }

        validFiles.forEach(f => processFile(f, isAddFile));
    }

    // Fitur Trim/Cut
    document.getElementById('btn-execute-trim').addEventListener('click', () => {
        const track = getActiveTrack(); 
        if(!track || !track.ws) return;
        
        const regions = track.wsRegions.getRegions();
        if(!regions || regions.length === 0) return;
        const region = regions[0];
        
        const buffer = track.ws.getDecodedData();
        const startOffset = Math.floor(region.start * buffer.sampleRate); 
        const endOffset = Math.floor(region.end * buffer.sampleRate);
        const frameCount = endOffset - startOffset;
        if(frameCount <= 0) return;
        
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const croppedBuffer = ctx.createBuffer(buffer.numberOfChannels, frameCount, buffer.sampleRate);
        
        for (let i = 0; i < buffer.numberOfChannels; i++) {
            croppedBuffer.copyToChannel(buffer.getChannelData(i).slice(startOffset, endOffset), i);
        }
        
        const croppedWavBlob = audioBufferToWav(croppedBuffer); 
        track.file = croppedWavBlob; 
        
        window.triggerEditState(); 
        saveState(croppedWavBlob, false, true); 
        loadWaveformForTrack(track, croppedWavBlob);
    });

    // Fitur Slider (Volume, Speed, Pitch)
    function applyPreviewSettings() {
        const track = getActiveTrack(); 
        if (!track || !track.ws) return;
        
        const vol = parseInt(document.getElementById('slider-volume').value);
        const speed = parseFloat(document.getElementById('slider-speed').value);
        const pitch = parseFloat(document.getElementById('slider-pitch').value); 

        const volumeValue = (vol + 100) / 100; 
        
        if (masterGainNode) {
            masterGainNode.gain.value = volumeValue;
            track.ws.setVolume(1);
        } else {
            track.ws.setVolume(Math.min(1, volumeValue)); 
        }
        
        track.ws.setPlaybackRate(speed * Math.pow(2, pitch / 12), false);
    }

    const volSlider = document.getElementById('slider-volume');
    volSlider.addEventListener('input', (e) => { 
        const val = parseInt(e.target.value); 
        document.getElementById('text-volume').innerText = `${val > 0 ? '+' : ''}${val}%`; 
        updateSliderFill(volSlider, val, -100, 200, 0); 
        applyPreviewSettings(); 
        updateFeatureDots(); 
    });
    volSlider.addEventListener('change', () => { 
        const t = getActiveTrack(); 
        window.triggerEditState(); 
        saveState(t.file, false, t.history[t.historyIndex].isEditedWave); 
    });

    const speedSlider = document.getElementById('slider-speed');
    speedSlider.addEventListener('input', (e) => { 
        const val = parseFloat(e.target.value); 
        document.getElementById('text-speed').innerText = `${val.toFixed(1)}x`; 
        updateSliderFill(speedSlider, val, 0.5, 4, 1.0); 
        applyPreviewSettings(); 
        updateFeatureDots(); 
        
        const track = getActiveTrack();
        if(track) {
            track.speed = val;
            updateTrackBoundsUI(track);
            updateTotalDuration();
        }
    });
    speedSlider.addEventListener('change', () => { 
        const t = getActiveTrack(); 
        window.triggerEditState(); 
        saveState(t.file, false, t.history[t.historyIndex].isEditedWave); 
    });

    const pitchSlider = document.getElementById('slider-pitch');
    pitchSlider.addEventListener('input', (e) => { 
        const val = parseFloat(e.target.value); 
        document.getElementById('text-pitch').innerText = `${val > 0 ? '+' : ''}${val.toFixed(1)} semitones`; 
        updateSliderFill(pitchSlider, val, -12, 12, 0); 
        applyPreviewSettings(); 
        updateFeatureDots(); 
    });
    pitchSlider.addEventListener('change', () => { 
        const t = getActiveTrack(); 
        window.triggerEditState(); 
        saveState(t.file, false, t.history[t.historyIndex].isEditedWave); 
    });

    // Play Button Utama
    document.getElementById('btn-play').addEventListener('click', () => {
        if (allTracks.length === 0) return;
        if(audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
        
        const playingTrack = allTracks.find(t => t.ws.isPlaying());
        const btnPlay = document.getElementById('btn-play');
        
        if (playingTrack) {
            playingTrack.ws.pause();
            document.getElementById('play-icon').className = 'fas fa-play ml-1';
            btnPlay.title = 'Play';
        } else {
            const track = getActiveTrack() || allTracks[0];
            if (track.ws.getCurrentTime() >= track.ws.getDuration() - 0.1) {
                track.ws.setTime(0);
            }
            track.ws.play();
            document.getElementById('play-icon').className = 'fas fa-pause';
            btnPlay.title = 'Pause';
        }
    });

    // Input Penambahan File
    document.getElementById('add-file-input').addEventListener('change', (e) => {
        if(e.target.files.length) {
            handleFileUpload(e.target.files, true);
        }
        e.target.value = '';
    });

    // Server Download Fetch API (Sekali Klik Langsung Download)
    document.getElementById('btn-download').addEventListener('click', function() {
        const track = getActiveTrack(); 
        if (!track || !track.file) return alert("Belum ada file audio aktif!");
        const btn = this;

        const originalText = btn.innerHTML; 
        btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Memproses...'; 
        btn.disabled = true;

        const eqVals = Array.from(document.querySelectorAll('.eq-band')).map(s => s.value).join(',');
        const fd = new FormData();
        fd.append('audio_file', track.file); 
        fd.append('volume', parseInt(volSlider.value)); 
        fd.append('speed', speedSlider.value); 
        fd.append('pitch', pitchSlider.value); 
        fd.append('eq', eqVals); 
        fd.append('format', document.getElementById('download-format').value.replace('.', ''));

        fetch('/api/edit', { method: 'POST', body: fd })
            .then(res => { 
                if (!res.ok) throw new Error("Server Gagal"); 
                return res.blob(); 
            })
            .then(blob => {
                // Membuat file virtual untuk memancing download otomatis
                const blobUrl = window.URL.createObjectURL(blob);
                const projectInput = document.getElementById('project-file-name').value;
                const baseName = projectInput.includes('.') ? projectInput.substring(0, projectInput.lastIndexOf('.')) : projectInput;
                const fileName = `${baseName}.${fd.get('format')}`;
                
                // Mengklik link tak terlihat secara otomatis
                const a = document.createElement('a'); 
                a.href = blobUrl; 
                a.download = fileName; 
                document.body.appendChild(a); 
                a.click(); 
                a.remove(); 
                
                // Mengubah status menjadi selesai
                const badge = document.getElementById('status-badge'); 
                badge.innerText = "Selesai"; 
                badge.className = 'flex-shrink-0 bg-purple-100 text-purple-700 border border-purple-200 text-[10px] sm:text-xs px-3 sm:px-4 py-1.5 rounded-full font-bold shadow-sm';
                
                // Mengembalikan tombol ke kondisi semula
                btn.innerHTML = originalText; 
                btn.disabled = false;
            })
            .catch(err => { 
                alert("Terjadi kesalahan Server."); 
                btn.innerHTML = originalText; 
                btn.disabled = false; 
            });
    });

    // Tombol Pilih File Upload Awal
    document.getElementById('file-input').addEventListener('change', (e) => { 
        if (e.target.files.length) {
            handleFileUpload(e.target.files, false);
        }
    });
    
    const uploadSection = document.getElementById('upload-section');
    if(uploadSection) {
        uploadSection.addEventListener('dragover', (e) => { 
            e.preventDefault(); 
            uploadSection.classList.add('border-pink-500'); 
        });
        uploadSection.addEventListener('dragleave', () => { 
            uploadSection.classList.remove('border-pink-500'); 
        });
        uploadSection.addEventListener('drop', (e) => {
            e.preventDefault(); 
            uploadSection.classList.remove('border-pink-500');
            if (e.dataTransfer.files.length > 0) {
                handleFileUpload(e.dataTransfer.files, false);
            }
        });
    }
});