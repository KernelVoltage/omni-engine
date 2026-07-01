/**
 * OMNI ENGINE CORE LOGIC v2.0 (Real Processing)
 * ---------------------------------------------
 * 1. Native Canvas Data Manipulation
 * 2. Binary Loop Target Exact-Size Search
 * 3. Real ArrayBuffer EXIF Erasure
 */

const STATE = {
    mode: 'convert',
    convertFiles: [],
    compressFiles: [],
    activeConvertId: null,
    activeCompressId: null,
    imgOrigUrl: null,
    imgOptUrl: null,
    matrix: {
        image: ["PNG", "JPG", "WEBP", "AVIF"]
    },
    isProcessing: false
};

const formatBytes = b => {
    if(b === 0) return '0 B';
    const k = 1024, s = ['B','KB','MB','GB'], i = Math.floor(Math.log(b)/Math.log(k));
    return parseFloat((b/Math.pow(k,i)).toFixed(2))+' '+s[i];
};
const getExt = n => n.split('.').pop().toUpperCase();
const isImg = type => type === 'image';
const resolveFileType = (ext) => {
    const uExt = ext.toUpperCase();
    if (STATE.matrix.image && STATE.matrix.image.includes(uExt) || uExt === 'JPEG') return 'image';
    return 'document'; 
};

async function stripExifFromBlob(blob) {
    if (blob.type !== 'image/jpeg') return blob; 
    const arrayBuffer = await blob.arrayBuffer();
    const dataView = new DataView(arrayBuffer);
    let offset = 0;
    
    if (dataView.getUint16(0) !== 0xFFD8) return blob; 
    offset += 2;
    
    const chunks = [new Uint8Array(arrayBuffer, 0, 2)];
    
    while (offset < dataView.byteLength) {
        if (offset + 4 > dataView.byteLength) break;
        const marker = dataView.getUint16(offset);
        const length = dataView.getUint16(offset + 2);
        
        if (marker === 0xFFE1 || marker === 0xFFE2) {
            offset += 2 + length; 
        } else {
            chunks.push(new Uint8Array(arrayBuffer, offset, 2 + length));
            offset += 2 + length;
        }
        if (marker === 0xFFDA) {
            chunks.push(new Uint8Array(arrayBuffer, offset));
            break;
        }
    }
    return new Blob(chunks, { type: 'image/jpeg' });
}

async function processImageCanvas(fileObj, targetFormat, quality, stripMeta = true) {
    return new Promise(async (resolve, reject) => {
        try {
            const img = new Image();
            img.onload = () => {
                const cv = document.createElement('canvas');
                cv.width = img.width; cv.height = img.height;
                const ctx = cv.getContext('2d');
                
                if(targetFormat === 'JPG' || targetFormat === 'JPEG') {
                    ctx.fillStyle = "#FFFFFF"; 
                    ctx.fillRect(0,0, cv.width, cv.height);
                } else {
                    ctx.clearRect(0,0, cv.width, cv.height);
                }
                ctx.drawImage(img, 0, 0, cv.width, cv.height);
                
                let mime = (targetFormat === 'JPG' || targetFormat === 'JPEG') ? 'image/jpeg' : `image/${targetFormat.toLowerCase()}`;
                if (targetFormat === 'PNG') quality = undefined;
                
                cv.toBlob(async (blob) => {
                    if(!blob) return resolve(null);
                    let finalBlob = blob;
                    if(stripMeta && mime === 'image/jpeg') {
                        finalBlob = await stripExifFromBlob(blob);
                    }
                    if (STATE.mode === 'compress' && finalBlob.size > fileObj.size) {
                        resolve(fileObj.nativeFile);
                    } else {
                        resolve(finalBlob);
                    }
                }, mime, quality);
            };
            img.onerror = () => resolve(null);
            img.src = fileObj.thumbnailUrl || URL.createObjectURL(fileObj.nativeFile);
        } catch (e) {
            console.error("Canvas Processing Error:", e);
            resolve(null);
        }
    });
}

async function binarySearchCompress(fileObj, targetKB) {
    // FIX: Removed Forced WEBP conversion. Keep native format.
    let targetFormat = fileObj.extension; 
    let minQ = 0.05;
    let maxQ = 1.0;
    let bestBlob = null;
    let iterations = 0;
    let maxIterations = 7; 
    
    let testBlob = await processImageCanvas(fileObj, targetFormat, maxQ);
    if(testBlob && (testBlob.size / 1024) <= targetKB) {
        return testBlob.size > fileObj.size ? fileObj.nativeFile : testBlob;
    }
    
    while(iterations < maxIterations) {
        iterations++;
        let midQ = (minQ + maxQ) / 2;
        let blob = await processImageCanvas(fileObj, targetFormat, midQ);
        
        if(!blob) break;
        let sizeKB = blob.size / 1024;
        
        if (sizeKB <= targetKB) {
            bestBlob = blob; 
            minQ = midQ; 
        } else {
            maxQ = midQ; 
        }
    }
    
    if (!bestBlob) {
       bestBlob = await processImageCanvas(fileObj, targetFormat, 0.1); 
    }
    return (bestBlob && bestBlob.size > fileObj.size) ? fileObj.nativeFile : bestBlob;
}

function download(blob, name) {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 3000); 
}

function showStatus(msg, type="info") {
    const badge = document.getElementById('statusBadge');
    badge.className = `w-full p-3 rounded-lg border text-sm font-bold flex items-center justify-center gap-2 transition-all mt-4 ${
        type === 'error' ? 'bg-red-50 text-red-600 border-red-200 dark:bg-red-900/30 dark:border-red-800' :
        type === 'success' ? 'bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-900/30 dark:border-emerald-800' :
        'bg-omni-50 text-omni-600 border-omni-200 dark:bg-omni-900/30 dark:border-omni-800'
    }`;
    badge.innerHTML = msg;
    badge.classList.remove('hidden');
    setTimeout(() => badge.classList.add('hidden'), 4000);
}
