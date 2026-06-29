/**
 * OMNI ENGINE APP CONTROLLER
 * Real Event Bindings, Sync Engine, Per-File Status Management.
 */

const themeBtn = document.getElementById('themeToggle');
const htmlElement = document.documentElement;
htmlElement.classList.remove('dark');

themeBtn.addEventListener('click', () => {
    htmlElement.classList.toggle('dark');
    updateSliderVisual();
});

const $ = id => document.getElementById(id);

const UI = {
    tConv: $('tabConvert'),
    tComp: $('tabCompress'),
    upBox: $('uploadContainer'),
    ph: $('dropZonePlaceholder'),
    gridDisp: $('fileGridDisplay'),
    fileIn: $('fileInput'),
    pConv: $('panelConvert'),
    pComp: $('panelCompress'),
    grid: $('formatGrid'),
    fmtWrap: $('formatGridWrapper'),
    btnConv: $('btnRunConvert'),
    btnComp: $('btnRunCompress'),
    sldNum: $('compNum'),
    sldRange: $('compSlider'),
    vWrap: $('viewerWrapper'),
    detailsBox: $('dynamicDetailsBox'),
    dtlName: $('dtlName'),
    dtlFormat: $('dtlFormat'),
    dtlSize: $('dtlSize'),
    dtlEstRow: $('dtlEstRow'),
    dtlEstSize: $('dtlEstSize'),
    lOrig: $('lblOrigSize'),
    lOpt: $('lblOptSize'),
    iBef: $('imgBefore'),
    iAft: $('imgAfter'),
    sLine: $('splitLine'),
    sHand: $('splitHandle'),
    sCtrl: $('splitControl'),
    exifToggle: $('exifToggle'),
    tDrop: $('targetDropdown'),
    cTargetDiv: $('customTargetDiv'),
    cTarget: $('customTargetInput')
};

let appWorker = null;
if (window.Worker) {
    appWorker = new Worker('worker.js');
    appWorker.onmessage = (e) => {
        if(e.data.type === 'ANALYSIS_COMPLETE') console.log(`Worker Verified: Status: ${e.data.data.statusMsg}`);
    };
}

function getActiveFiles() { return STATE.mode === 'convert' ? STATE.convertFiles : STATE.compressFiles; }
function getActiveId() { return STATE.mode === 'convert' ? STATE.activeConvertId : STATE.activeCompressId; }
function setActiveId(id) { if(STATE.mode === 'convert') STATE.activeConvertId = id; else STATE.activeCompressId = id; }
function getActiveFileObj() { return getActiveFiles().find(f => f.id === getActiveId()); }

function setMode(m) {
    STATE.mode = m;
    const act = "flex-1 py-3 rounded-lg text-xs font-bold uppercase transition-all bg-omni-600 text-white shadow-md";
    const ina = "flex-1 py-3 rounded-lg text-xs font-bold uppercase transition-all text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white";
    UI.tConv.className = m === 'convert' ? act : ina;
    UI.tComp.className = m === 'compress' ? act : ina;
    updateFileGridUI();
    renderPanels();
    updateDetailsBox();
}

UI.tConv.onclick = () => setMode('convert');
UI.tComp.onclick = () => setMode('compress');

function renderPanels() {
    const files = getActiveFiles();
    if (files.length === 0) {
        UI.pConv.classList.add('hidden');
        UI.pComp.classList.add('hidden');
        UI.detailsBox.classList.add('hidden');
        return;
    }
    const actObj = getActiveFileObj();
    
    if (STATE.mode === 'convert') {
        UI.pConv.classList.remove('hidden'); UI.pConv.classList.add('flex');
        UI.pComp.classList.add('hidden'); UI.pComp.classList.remove('flex');
        UI.dtlEstRow.classList.add('hidden'); // Hide estimate in converter
        if(actObj) {
            UI.exifToggle.checked = actObj.settings.stripMeta;
        }
        buildGrid();
    } else {
        UI.pComp.classList.remove('hidden'); UI.pComp.classList.add('flex');
        UI.pConv.classList.add('hidden'); UI.pConv.classList.remove('flex');
        UI.dtlEstRow.classList.remove('hidden'); // Show estimate in compressor
        if(actObj) {
            // Restore active file settings into UI
            UI.sldRange.value = actObj.settings.quality;
            UI.sldNum.value = actObj.settings.quality;
            
            if(actObj.settings.exactTargetKB === null) UI.tDrop.value = "none";
            else if([20,50,100].includes(actObj.settings.exactTargetKB)) UI.tDrop.value = actObj.settings.exactTargetKB.toString();
            else {
                UI.tDrop.value = "custom";
                UI.cTarget.value = actObj.settings.exactTargetKB;
            }
            toggleCustomTargetDiv();
            updateSliderVisual();
        }
        triggerLivePreview();
    }
    UI.detailsBox.classList.remove('hidden');
}

UI.ph.onclick = (e) => { e.stopPropagation(); UI.fileIn.click(); };
UI.upBox.ondragover = e => { e.preventDefault(); UI.upBox.classList.add('dragover'); };
UI.upBox.ondragleave = () => UI.upBox.classList.remove('dragover');
UI.upBox.ondrop = e => { e.preventDefault(); UI.upBox.classList.remove('dragover'); handleFiles(e.dataTransfer.files); };
UI.fileIn.onchange = e => { handleFiles(e.target.files); e.target.value = ''; };

function handleFiles(newFiles) {
    if(!newFiles.length) return;
    const targetArray = getActiveFiles();
    Array.from(newFiles).forEach(nf => {
        if(!targetArray.some(f => f.name === nf.name && f.size === nf.size)) {
            const ext = getExt(nf.name);
            const type = resolveFileType(ext);
            const fileObj = {
                id: Math.random().toString(36).substring(2, 11),
                nativeFile: nf,
                name: nf.name,
                size: nf.size,
                extension: ext,
                type: type,
                thumbnailUrl: isImg(type) ? URL.createObjectURL(nf) : null,
                // PER-FILE SETTINGS (Anti-Khichdi)
                settings: {
                    format: '',
                    quality: 15,
                    exactTargetKB: null,
                    stripMeta: true
                }
            };
            targetArray.push(fileObj);
        }
    });
    
    if (appWorker && targetArray.length > 0) appWorker.postMessage({ action: 'ANALYZE_BATCH', payload: { files: targetArray.map(f => ({size: f.size})) } });
    if (!getActiveId() && targetArray.length > 0) setActiveId(targetArray[0].id);
    updateFileGridUI(); renderPanels(); updateDetailsBox();
}

function setActiveCard(id) {
    setActiveId(id);
    updateFileGridUI();
    renderPanels();
    updateDetailsBox();
}

function removeFileAtIndex(id, index) {
    const targetArray = getActiveFiles();
    if(targetArray[index].thumbnailUrl) URL.revokeObjectURL(targetArray[index].thumbnailUrl);
    targetArray.splice(index, 1);
    if (getActiveId() === id) setActiveId(targetArray.length > 0 ? targetArray[0].id : null);
    updateFileGridUI(); renderPanels(); updateDetailsBox();
}

function updateFileGridUI() {
    UI.gridDisp.innerHTML = "";
    const files = getActiveFiles();
    if(files.length === 0) {
        UI.gridDisp.classList.add('hidden');
        UI.ph.classList.remove('hidden');
        return;
    }
    UI.ph.classList.add('hidden');
    UI.gridDisp.classList.remove('hidden');
    
    files.forEach((f, idx) => {
        let shortName = f.name.length > 20 ? f.name.substring(0, 18) + '...' : f.name;
        const safeName = shortName.replace(/</g, "&lt;").replace(/>/g, "&gt;");
        const card = document.createElement('div');
        card.className = `file-card-item relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 flex flex-col justify-between group shadow-sm hover:border-omni-500/50 transition-all cursor-pointer min-h-[90px] ${f.id === getActiveId() ? 'card-active' : ''}`;
        card.onclick = () => setActiveCard(f.id);
        
        let iconDisplay = f.thumbnailUrl 
            ? `<img src="${f.thumbnailUrl}" class="card-thumb" alt="thumb">` 
            : `<svg class="w-8 h-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>`;
        
        card.innerHTML = `
            <button class="absolute top-2 right-2 text-slate-400 hover:text-red-500 font-bold w-5 h-5 flex items-center justify-center bg-slate-50 dark:bg-slate-950 rounded-full border border-slate-200 dark:border-slate-800 text-xs z-30" aria-label="Remove File" onclick="event.stopPropagation(); removeFileAtIndex('${f.id}', ${idx})">&times;</button>
            <div class="flex items-center gap-3">
                <div class="shrink-0 rounded bg-slate-50 dark:bg-slate-950 p-1 border border-slate-100 dark:border-slate-800">${iconDisplay}</div>
                <div class="flex flex-col overflow-hidden">
                    <span class="text-xs font-bold text-slate-800 dark:text-white truncate">${safeName}</span>
                    <span class="text-[10px] font-mono tracking-wider text-slate-500 uppercase">${formatBytes(f.size)} &bull; ${f.extension}</span>
                </div>
            </div>
        `;
        UI.gridDisp.appendChild(card);
    });

    const addCard = document.createElement('div');
    addCard.className = "border-2 dashed border-slate-200 dark:border-slate-800 hover:border-omni-500 bg-slate-50/50 dark:bg-slate-900/30 rounded-xl flex flex-col items-center justify-center cursor-pointer min-h-[90px] transition-all group";
    addCard.innerHTML = `<span class="text-[11px] font-black tracking-widest text-slate-400 dark:text-slate-500 group-hover:text-omni-500 uppercase">+ ADD MORE</span>`;
    addCard.onclick = (e) => { e.stopPropagation(); UI.fileIn.click(); };
    UI.gridDisp.appendChild(addCard);
}

function updateDetailsBox() {
    const activeFile = getActiveFileObj();
    if(!activeFile) { UI.detailsBox.classList.add('hidden'); return; }
    UI.detailsBox.classList.remove('hidden');
    UI.dtlName.innerText = activeFile.name;
    UI.dtlFormat.innerText = activeFile.extension;
    UI.dtlSize.innerText = formatBytes(activeFile.size);

    const files = getActiveFiles();
    if(files.length >= 2) {
        let total = files.reduce((acc, f) => acc + f.size, 0);
        $('dtlTotalRow').classList.remove('hidden');
        $('dtlTotalRow').classList.add('flex');
        $('dtlTotalSize').innerText = formatBytes(total);
    } else {
        $('dtlTotalRow').classList.add('hidden');
        $('dtlTotalRow').classList.remove('flex');
    }
}

function buildGrid() {
    UI.grid.innerHTML = "";
    const activeFile = getActiveFileObj();
    if (!activeFile) return;

    const baseExt = activeFile.extension.toUpperCase();
    const allowedFormats = STATE.matrix[activeFile.type] || ["BIN"];
    
    let selectedAny = false;
    allowedFormats.forEach(f => {
        if(f === baseExt || (baseExt === 'JPEG' && f === 'JPG')) return;
        const btn = document.createElement('button');
        btn.innerText = f;
        btn.className = "fmt-btn p-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 hover:border-omni-500 hover:text-omni-500 dark:hover:text-omni-400 text-slate-600 dark:text-slate-300 text-xs font-black transition-all text-center";
        
        btn.onclick = () => {
            activeFile.settings.format = f;
            document.querySelectorAll('.fmt-btn').forEach(b => {
                b.classList.remove('border-omni-500', 'text-omni-600', 'bg-omni-50', 'dark:bg-omni-950/40', 'dark:text-omni-400');
                b.classList.add('border-slate-200', 'bg-slate-50', 'text-slate-600', 'dark:border-slate-800', 'dark:bg-slate-900', 'dark:text-slate-300');
            });
            btn.classList.remove('border-slate-200', 'bg-slate-50', 'text-slate-600', 'dark:border-slate-800', 'dark:bg-slate-900', 'dark:text-slate-300');
            btn.classList.add('border-omni-500', 'text-omni-600', 'bg-omni-50', 'dark:bg-omni-950/40', 'dark:text-omni-400');
        };
        
        if(f === activeFile.settings.format) { btn.click(); selectedAny = true; }
        UI.grid.appendChild(btn);
    });

    if(!selectedAny) {
        const fallbackBtn = UI.grid.querySelector('.fmt-btn');
        if(fallbackBtn) fallbackBtn.click(); else activeFile.settings.format = '';
    }
}

UI.exifToggle.onchange = (e) => {
    const act = getActiveFileObj();
    if(act) act.settings.stripMeta = e.target.checked;
}

UI.btnConv.onclick = async () => {
    if(STATE.isProcessing) return;
    const files = getActiveFiles();
    if(!files.length) return;
    
    STATE.isProcessing = true;
    UI.btnConv.classList.add('engine-active');
    const origTxt = UI.btnConv.innerText;
    UI.btnConv.innerHTML = `<span class="relative z-10 flex items-center justify-center gap-2"><svg class="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> WORKING...</span>`;
    
    try {
        if(files.length === 1) {
            const f = files[0];
            const ext = f.settings.format;
            if(!ext) { throw new Error("No format selected"); }
            
            let outBlob = f.nativeFile;
            if(isImg(f.type) || ["PNG","JPG","JPEG","WEBP","AVIF"].includes(ext)) {
                outBlob = await processImageCanvas(f, ext, 0.92, f.settings.stripMeta);
            }
            if (outBlob) download(outBlob, `${f.name.split('.')[0]}_omni.${ext.toLowerCase()}`);
            else throw new Error("Canvas Failed");
        } else {
            const zip = new JSZip();
            for(let i = 0; i < files.length; i++) {
                const f = files[i];
                const ext = f.settings.format;
                if(!ext) continue;
                let outBlob = f.nativeFile;
                if(isImg(f.type) || ["PNG","JPG","JPEG","WEBP","AVIF"].includes(ext)) {
                    outBlob = await processImageCanvas(f, ext, 0.92, f.settings.stripMeta);
                }
                if (outBlob) zip.file(`${f.name.split('.')[0]}_omni.${ext.toLowerCase()}`, outBlob);
            }
            if (Object.keys(zip.files).length > 0) {
                const zb = await zip.generateAsync({type: "blob", compression: "STORE"});
                download(zb, "OmniEngine_Converted_Batch.zip");
            } else {
                throw new Error("No files processed successfully.");
            }
        }
        showStatus("Conversion Successful!", "success");
    } catch(err) {
        console.error(err);
        showStatus("Format not selected or error encountered.", "error");
    }
    
    STATE.isProcessing = false;
    UI.btnConv.innerText = origTxt;
    UI.btnConv.classList.remove('engine-active');
};

// --- SYNC & EXACT TARGET LOGIC ---
function toggleCustomTargetDiv() {
    if(UI.tDrop.value === 'custom') UI.cTargetDiv.classList.remove('hidden');
    else UI.cTargetDiv.classList.add('hidden');
}

UI.tDrop.addEventListener('change', (e) => {
    toggleCustomTargetDiv();
    const actObj = getActiveFileObj();
    if(!actObj) return;
    
    if(e.target.value === 'none') actObj.settings.exactTargetKB = null;
    else if(e.target.value === 'custom') actObj.settings.exactTargetKB = UI.cTarget.value ? parseInt(UI.cTarget.value) : null;
    else actObj.settings.exactTargetKB = parseInt(e.target.value);
    triggerLivePreview();
});

UI.cTarget.addEventListener('input', (e) => {
    const actObj = getActiveFileObj();
    if(!actObj) return;
    if(e.target.value && !isNaN(e.target.value)) actObj.settings.exactTargetKB = parseInt(e.target.value);
    else actObj.settings.exactTargetKB = null;
    triggerLivePreview();
});

let debounceTimer;

function updateSliderVisual() {
    let val = UI.sldRange.value;
    let bg = htmlElement.classList.contains('dark') ? '#1e293b' : '#cbd5e1';
    UI.sldRange.style.setProperty('--track-bg', `linear-gradient(to right, #0ea5e9 ${val}%, ${bg} ${val}%)`);
}

function syncSliderToData(val) {
    const actObj = getActiveFileObj();
    if(actObj) {
        actObj.settings.quality = val;
        actObj.settings.exactTargetKB = null; // moving slider turns off exact target
    }
    UI.tDrop.value = "none"; 
    toggleCustomTargetDiv();
    
    UI.sldNum.value = val;
    UI.sldRange.value = val;
    updateSliderVisual();
    triggerLivePreview();
}

UI.sldRange.addEventListener('input', (e) => syncSliderToData(parseInt(e.target.value)));
UI.sldNum.addEventListener('input', (e) => {
    if (e.target.value === '') return;
    let val = parseInt(e.target.value);
    if (!isNaN(val)) syncSliderToData(Math.max(1, Math.min(100, val)));
});

function triggerLivePreview() {
    clearTimeout(debounceTimer);
    UI.dtlEstSize.innerText = "Working...";
    UI.dtlEstSize.classList.add('animate-pulse');
    
    debounceTimer = setTimeout(async () => {
        const files = getActiveFiles();
        if(!files.length) return;
        const activeFile = getActiveFileObj();
        
        if(!activeFile || !isImg(activeFile.type)) {
            UI.vWrap.classList.add('hidden');
            UI.dtlEstSize.innerText = "Ready";
            UI.dtlEstSize.classList.remove('animate-pulse');
            return;
        }
        
        UI.vWrap.classList.remove('hidden');
        UI.lOrig.innerText = formatBytes(activeFile.size);

        if(STATE.imgOrigUrl && STATE.imgOrigUrl !== activeFile.thumbnailUrl) URL.revokeObjectURL(STATE.imgOptUrl);

        let testBlob = null;
        let targetFormat = activeFile.extension === 'PNG' ? 'WEBP' : activeFile.extension;
        
        if(activeFile.settings.exactTargetKB) {
            testBlob = await binarySearchCompress(activeFile, activeFile.settings.exactTargetKB);
        } else {
            let q = Math.max(0.1, 1.0 - (activeFile.settings.quality / 110));
            testBlob = await processImageCanvas(activeFile, targetFormat, q, activeFile.settings.stripMeta);
        }
        
        if (testBlob) {
            UI.dtlEstSize.innerText = formatBytes(testBlob.size);
            UI.lOpt.innerText = formatBytes(testBlob.size);
            
            if(STATE.imgOptUrl) URL.revokeObjectURL(STATE.imgOptUrl);
            STATE.imgOptUrl = URL.createObjectURL(testBlob);
            
            UI.iBef.src = activeFile.thumbnailUrl;
            UI.iAft.src = STATE.imgOptUrl;
        } else {
            UI.dtlEstSize.innerText = "Error";
        }
        UI.dtlEstSize.classList.remove('animate-pulse');
        
    }, 400);
}

UI.sCtrl.oninput = e => {
    const v = e.target.value;
    UI.iAft.style.clipPath = `inset(0 0 0 ${v}%)`;
    UI.sLine.style.left = `${v}%`;
    UI.sHand.style.left = `${v}%`;
};

UI.btnComp.onclick = async () => {
    if(STATE.isProcessing) return;
    const files = getActiveFiles();
    if(!files.length) return;
    
    STATE.isProcessing = true;
    UI.btnComp.classList.add('engine-active');
    const origTxt = UI.btnComp.innerText;
    UI.btnComp.innerHTML = `<span class="relative z-10 flex items-center justify-center gap-2"><svg class="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> WORKING...</span>`;

    try {
        if(files.length === 1) {
            const f = files[0];
            let outBlob = f.nativeFile;
            
            if(isImg(f.type)) {
                if(f.settings.exactTargetKB) {
                    outBlob = await binarySearchCompress(f, f.settings.exactTargetKB);
                } else {
                    let imgQuality = Math.max(0.1, 1.0 - (f.settings.quality / 110));
                    let targetExt = f.extension === 'PNG' ? 'WEBP' : f.extension;
                    outBlob = await processImageCanvas(f, targetExt, imgQuality, f.settings.stripMeta);
                }
            }
            if(outBlob) download(outBlob, `${f.name.split('.')[0]}_min.${f.extension === 'PNG' ? 'webp' : f.extension.toLowerCase()}`);
        } else {
            const zip = new JSZip();
            for(let i = 0; i < files.length; i++) {
                const f = files[i];
                let outBlob = f.nativeFile;
                if(isImg(f.type)) {
                    if(f.settings.exactTargetKB) {
                        outBlob = await binarySearchCompress(f, f.settings.exactTargetKB);
                    } else {
                        let imgQuality = Math.max(0.1, 1.0 - (f.settings.quality / 110));
                        let targetExt = f.extension === 'PNG' ? 'WEBP' : f.extension;
                        outBlob = await processImageCanvas(f, targetExt, imgQuality, f.settings.stripMeta);
                    }
                }
                if (outBlob) zip.file(f.name.split('.')[0] + "_min." + (f.extension === 'PNG' ? 'webp' : f.extension.toLowerCase()), outBlob);
            }
            if (Object.keys(zip.files).length > 0) {
                // Defaulting to active file slider level for zip compression
                let compLvl = getActiveFileObj() ? getActiveFileObj().settings.quality : 15;
                let zipLevel = Math.max(1, Math.ceil((compLvl / 100) * 9));
                const zBlob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: zipLevel } });
                download(zBlob, "OmniEngine_Compressed_Batch.zip");
            }
        }
        showStatus("Compression Finished.", "success");
    } catch(err) {
        console.error("Compression Engine Crash:", err);
        showStatus("Engine Error while compressing.", "error");
    }

    STATE.isProcessing = false;
    UI.btnComp.innerText = origTxt;
    UI.btnComp.classList.remove('engine-active');
};
