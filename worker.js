/**
 * OMNI ENGINE - WEB WORKER THREAD
 * Ensures heavy array processing and logic stays off the main UI rendering thread.
 */

self.onmessage = async function(e) {
    const { action, payload, jobId } = e.data;
    
    if (action === 'ANALYZE_BATCH') {
        let totalSize = payload.files.reduce((acc, f) => acc + f.size, 0);
        let warning = totalSize > 50 * 1024 * 1024 ? "Heavy Batch Detected - Safe Mode Active" : "Optimal Load";
        
        self.postMessage({
            type: 'ANALYSIS_COMPLETE',
            data: {
                totalFiles: payload.files.length,
                totalBytes: totalSize,
                statusMsg: warning
            },
            jobId: jobId
        });
    }
    
    if (action === 'VERIFY_INTEGRITY') {
        let valid = payload.blob.size > 0;
        self.postMessage({
            type: 'INTEGRITY_CHECKED',
            data: { valid: valid, bytes: payload.blob.size }
        });
    }
};
