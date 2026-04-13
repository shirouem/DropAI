/**
 * DropAI Remotion Renderer Integration
 */

export type RenderFormat = 'webm' | 'mp4';

export type RenderElement = {
    elementId: string;
    collectionType: 'text' | 'image' | 'video' | 'audio';
    startTime: number;
    duration: number;
    x: number;
    y: number;
    width: number;
    height: number;
    rotation?: number;
    opacity?: number;
    content?: string;
    mediaUrl?: string;
    mediaOffset?: number;
    volume?: number;
    zIndex: number;
    fontSize?: number;
    fontWeight?: string;
    fontStyle?: string;
    textDecoration?: string;
    letterSpacing?: number;
    lineHeight?: number;
    textAlign?: 'left' | 'center' | 'right';
    animations: Array<{
        id: string;
        type: string;
        start: number;
        duration: number;
        easing: string;
        from?: number;
        to?: number;
    }>;
};

export interface RenderJob {
    elements: RenderElement[];
    totalDuration: number;
    width?: number;
    height?: number;
    fps?: number;
    videoBitsPerSecond?: number;
    format?: RenderFormat;
}

export type RenderProgress = {
    phase: 'preparing' | 'rendering' | 'encoding' | 'done' | 'error';
    progress: number;
    message: string;
    error?: string;
};

type ProgressCb = (p: RenderProgress) => void;

// ─── Main Export function ─────────────────────────────────────────────────────────────
export async function renderComposition(job: RenderJob, onProgress: ProgressCb, signal?: AbortSignal): Promise<void> {
    try {
        onProgress({ phase: 'preparing', progress: 0.1, message: 'Sending to Remotion Rendering Engine...' });

        const response = await fetch('/api/render', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ elements: job.elements, totalDuration: job.totalDuration }),
            signal
        });

        if (!response.ok) {
            let errorMsg = 'Server rendering failed';
            try {
                const err = await response.json();
                if (err.error) errorMsg = err.error;
            } catch (e) {
                // Ignore parse error
            }
            throw new Error(errorMsg);
        }

        onProgress({ phase: 'encoding', progress: 0.8, message: 'Downloading rendered video...' });

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); 
        a.href = url; 
        a.download = `export-${Date.now()}.mp4`; 
        a.click();
        
        onProgress({ phase: 'done', progress: 1, message: 'Export complete!' });
    } catch (e: any) {
        if (e.name === 'AbortError') {
            onProgress({ phase: 'error', progress: 0, message: 'Export cancelled' });
        } else {
            onProgress({ phase: 'error', progress: 0, message: 'Export failed', error: e.message });
        }
    }
}
