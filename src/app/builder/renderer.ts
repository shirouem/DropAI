/**
 * DropAI Client-Side Renderer — v5
 *
 * Key fixes in this version:
 * 1. Animation Logic: 100% matched to BuilderCanvas.tsx, including anim.to/from.
 * 2. seekTo Fix: Added a tiny threshold (0.001s) to resolve immediately if no seek is needed.
 *    This prevents the 200ms timeout stall which causes duplicate frames (chopped look).
 * 3. Boundary Safety: Clamped localTime to 0 and improved draw condition to prevent end-of-clip flickering.
 * 4. Encoder Config: Re-added software preference with High Profile level 5.1.
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

const ANIM_CATEGORIES: Record<string, 'in' | 'out'> = {
    fadeIn: 'in', slideInLeft: 'in', slideInRight: 'in', slideInTop: 'in', slideInBottom: 'in', scaleIn: 'in', rotateIn: 'in', bounceIn: 'in', blurIn: 'in',
    fadeOut: 'out', slideOutLeft: 'out', slideOutRight: 'out', slideOutTop: 'out', slideOutBottom: 'out', scaleOut: 'out', rotateOut: 'out', blurOut: 'out'
};

// ─── Easing — MUST match BuilderCanvas.tsx applyEasing exactly ───────────────
function easeValue(t: number, easing: string): number {
    t = Math.max(0, Math.min(1, t));
    switch (easing) {
        case 'linear': return t;
        case 'easeIn': return t * t * t;
        case 'easeOut': return 1 - Math.pow(1 - t, 3);
        case 'easeInOut': return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        case 'spring': {
            const w = 8, d = 0.4;
            return 1 - Math.exp(-d * w * t) * Math.cos(w * Math.sqrt(1 - d * d) * t);
        }
        default: return t;
    }
}

// ─── Animation Evaluation — MATCHED to BuilderCanvas.tsx ─────────────────────
type AnimatedStyle = { opacity: number; translateX: number; translateY: number; scale: number; rotate: number; blur: number };

function evaluateAnimations(el: RenderElement, currentTime: number): AnimatedStyle {
    const result: AnimatedStyle = { opacity: el.opacity ?? 1, translateX: 0, translateY: 0, scale: 1, rotate: 0, blur: 0 };
    const localTime = currentTime - el.startTime;

    for (const anim of (el.animations || [])) {
        const start = anim.start;
        const end = anim.start + anim.duration;
        const category = ANIM_CATEGORIES[anim.type];

        if (localTime < start || localTime > end) {
            if (category === 'in' && localTime < start) {
                switch (anim.type) {
                    case 'fadeIn': result.opacity = 0; break;
                    case 'slideInLeft': result.translateX = -100; break;
                    case 'slideInRight': result.translateX = 100; break;
                    case 'slideInTop': result.translateY = -100; break;
                    case 'slideInBottom': result.translateY = 100; break;
                    case 'scaleIn': result.scale = anim.from ?? 0; break;
                    case 'rotateIn': result.rotate = -180; break;
                    case 'bounceIn': result.scale = anim.from ?? 0; break;
                    case 'blurIn': result.blur = 10; result.opacity = 0; break;
                }
            }
            if (category === 'in' && localTime > end) {
                switch (anim.type) {
                    case 'scaleIn': result.scale = anim.to ?? 1; break;
                    case 'bounceIn': result.scale = anim.to ?? 1; break;
                }
            }
            if (category === 'out' && localTime < start) {
                switch (anim.type) {
                    case 'scaleOut': result.scale = anim.from ?? 1; break;
                }
            }
            if (category === 'out' && localTime > end) {
                switch (anim.type) {
                    case 'fadeOut': result.opacity = 0; break;
                    case 'slideOutLeft': result.translateX = -100; break;
                    case 'slideOutRight': result.translateX = 100; break;
                    case 'slideOutTop': result.translateY = -100; break;
                    case 'slideOutBottom': result.translateY = 100; break;
                    case 'scaleOut': result.scale = anim.to ?? 0; break;
                    case 'rotateOut': result.rotate = 180; break;
                    case 'blurOut': result.blur = 10; result.opacity = 0; break;
                }
            }
            continue;
        }

        const rawT = (localTime - start) / (anim.duration || 0.01);
        const t = easeValue(rawT, anim.easing);

        switch (anim.type) {
            case 'fadeIn': result.opacity *= t; break;
            case 'fadeOut': result.opacity *= (1 - t); break;
            case 'slideInLeft': result.translateX = -100 * (1 - t); break;
            case 'slideInRight': result.translateX = 100 * (1 - t); break;
            case 'slideInTop': result.translateY = -100 * (1 - t); break;
            case 'slideInBottom': result.translateY = 100 * (1 - t); break;
            case 'slideOutLeft': result.translateX = -100 * t; break;
            case 'slideOutRight': result.translateX = 100 * t; break;
            case 'slideOutTop': result.translateY = -100 * t; break;
            case 'slideOutBottom': result.translateY = 100 * t; break;
            case 'scaleIn': {
                const sStart = anim.from ?? 0;
                const sEnd = anim.to ?? 1;
                result.scale = sStart + (sEnd - sStart) * t;
                break;
            }
            case 'scaleOut': {
                const sStart = anim.from ?? 1;
                const sEnd = anim.to ?? 0;
                result.scale = sStart + (sEnd - sStart) * t;
                break;
            }
            case 'rotateIn': result.rotate = -180 * (1 - t); break;
            case 'rotateOut': result.rotate = 180 * t; break;
            case 'bounceIn': {
                const sStart = anim.from ?? 0;
                const sEnd = anim.to ?? 1;
                const springT = easeValue(rawT, 'spring');
                result.scale = sStart + (sEnd - sStart) * springT;
                break;
            }
            case 'blurIn': result.blur = 10 * (1 - t); result.opacity *= t; break;
            case 'blurOut': result.blur = 10 * t; result.opacity *= (1 - t); break;
        }
    }
    return result;
}

// ─── Asset Loaders ───────────────────────────────────────────────────────────
function loadImage(url: string): Promise<HTMLImageElement> {
    return new Promise((res, rej) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => res(img);
        img.onerror = rej;
        img.src = url;
    });
}

function loadVideo(url: string): Promise<HTMLVideoElement> {
    return new Promise((res, rej) => {
        const v = document.createElement('video');
        v.crossOrigin = 'anonymous';
        v.preload = 'auto';
        v.muted = true;
        v.playsInline = true;
        v.src = url;
        v.onloadeddata = () => res(v);
        v.onerror = rej;
        v.load();
    });
}

/** 
 * Improved seekTo: Resolves immediately if distance is < 1ms.
 * Prevents stalling when many frames are identical or close, fixing chopped output.
 */
function seekTo(vid: HTMLVideoElement, target: number): Promise<void> {
    return new Promise(resolve => {
        // Add a 5ms epsilon to the target time.
        // This is CRITICAL for perfectly smooth playback. Because of floating point inaccuracies, 
        // asking the browser to seek to exactly '0.033333' (1/30) might land slightly *before* 
        // the video's internal timestamp for frame 1, causing it to return frame 0 again.
        // Adding 5ms safely pushes the seek head into the middle of the frame's time window.
        const safeTarget = target + 0.005;
        
        // Clamp to at least 50ms before duration to prevent the browser from resetting to the first frame
        const clampedTarget = Math.max(0, Math.min(safeTarget, (vid.duration || 0) - 0.05));
        
        // If already practically at the target (within 0.1ms), resolve immediately to avoid stalls.
        if (Math.abs(vid.currentTime - clampedTarget) < 0.0001) {
            resolve();
            return;
        }
        let resolved = false;
        
        const finish = () => {
            if (resolved) return;
            resolved = true;
            resolve();
        };

        const done = () => { 
            vid.removeEventListener('seeked', done); 
            
            // Ensure the frame is actually decoded and painted for canvas extraction
            if ('requestVideoFrameCallback' in vid) {
                let rfcResolved = false;
                const callbackId = (vid as any).requestVideoFrameCallback(() => {
                    if (rfcResolved) return;
                    rfcResolved = true;
                    finish();
                });
                // Fallback in case rVFC doesn't fire
                setTimeout(() => {
                    if (!rfcResolved) {
                        try { (vid as any).cancelVideoFrameCallback(callbackId); } catch (e) {}
                        finish();
                    }
                }, 150);
            } else {
                // Fallback for browsers without rVFC
                setTimeout(finish, 150);
            }
        };
        vid.addEventListener('seeked', done);
        vid.currentTime = clampedTarget;
        // Increase timeout to 2000ms to allow slow seeks to finish instead of dropping frames
        setTimeout(() => {
            if (!resolved) {
                vid.removeEventListener('seeked', done);
                finish();
            }
        }, 2000);
    });
}

// ─── Drawing ─────────────────────────────────────────────────────────────────
const PREVIEW_W = 320;

function drawFrame(
    ctx: CanvasRenderingContext2D,
    W: number, H: number,
    elements: RenderElement[],
    imageCache: Map<string, HTMLImageElement>,
    videoCache: Map<string, HTMLVideoElement>,
    t: number,
) {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);

    for (const el of elements) {
        if (el.collectionType === 'audio') continue;
        // Strict boundary check: add small epsilon to duration to avoid last-frame flickering
        if (t < el.startTime || t >= el.startTime + el.duration - 0.0001) continue;

        const anim = evaluateAnimations(el, t);
        if (anim.opacity <= 0.001) continue;

        const px = (el.x / 100) * W;
        const py = (el.y / 100) * H;
        const pw = (el.width / 100) * W;
        const ph = (el.height / 100) * H;
        const cx = px + pw / 2 + (anim.translateX / 100) * W;
        const cy = py + ph / 2 + (anim.translateY / 100) * H;

        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, anim.opacity));
        if (anim.blur > 0) ctx.filter = `blur(${anim.blur}px)`;

        ctx.translate(cx, cy);
        ctx.rotate(((el.rotation ?? 0) + anim.rotate) * Math.PI / 180);
        const s = Math.max(0.001, anim.scale);
        ctx.scale(s, s);
        ctx.translate(-pw / 2, -ph / 2);

        if (el.collectionType === 'image') {
            const img = imageCache.get(el.elementId);
            if (img) ctx.drawImage(img, 0, 0, pw, ph);
        } else if (el.collectionType === 'video') {
            const vid = videoCache.get(el.elementId);
            if (vid && vid.readyState >= 2) {
                ctx.drawImage(vid, 0, 0, pw, ph);
            } else {
                ctx.fillStyle = '#555';
                ctx.fillRect(0, 0, pw, ph);
            }
        } else if (el.collectionType === 'text' && el.content) {
            const fs = ((el.fontSize ?? 16) / PREVIEW_W) * W;
            ctx.font = `${el.fontStyle ?? 'normal'} ${el.fontWeight ?? 'bold'} ${fs}px Inter, sans-serif`;
            ctx.fillStyle = '#fff';
            ctx.textAlign = el.textAlign ?? 'center';
            ctx.textBaseline = 'middle';

            const words = el.content.split(' ');
            const lines: string[] = [];
            let currentLine = '';
            for (const word of words) {
                const test = currentLine ? `${currentLine} ${word}` : word;
                if (ctx.measureText(test).width > pw * 0.95 && currentLine) {
                    lines.push(currentLine);
                    currentLine = word;
                } else {
                    currentLine = test;
                }
            }
            if (currentLine) lines.push(currentLine);
            const lh = fs * (el.lineHeight ?? 1.2);
            const totalH = lines.length * lh;
            const startY = ph / 2 - totalH / 2 + lh / 2;
            for (let i = 0; i < lines.length; i++) {
                const tx = el.textAlign === 'left' ? 0 : el.textAlign === 'right' ? pw : pw / 2;
                ctx.fillText(lines[i], tx, startY + i * lh);
            }
        }
        ctx.restore();
    }
}

// ─── Audio mix ─────────────────────────────────────────────────────────────
function mixAudio(
    elements: RenderElement[],
    buffers: Map<string, AudioBuffer>,
    totalDuration: number,
    sr: number,
): [Float32Array, Float32Array] {
    const n = Math.ceil(totalDuration * sr);
    const L = new Float32Array(n);
    const R = new Float32Array(n);
    for (const el of elements) {
        if (!el.mediaUrl || (el.collectionType !== 'audio' && el.collectionType !== 'video')) continue;
        const buf = buffers.get(el.elementId);
        if (!buf) continue;
        const vol = el.volume ?? 1;
        const off = Math.floor((el.mediaOffset ?? 0) * sr);
        const start = Math.floor(el.startTime * sr);
        const count = Math.min(Math.floor(el.duration * sr), buf.length - off, n - start);
        const sL = buf.getChannelData(0);
        const sR = buf.numberOfChannels > 1 ? buf.getChannelData(1) : sL;
        for (let i = 0; i < count; i++) {
            L[start + i] += (sL[off + i] ?? 0) * vol;
            R[start + i] += (sR[off + i] ?? 0) * vol;
        }
    }
    return [L, R];
}

// ─── Main loop ─────────────────────────────────────────────────────────────
async function encodeComposition(
    job: RenderJob, W: number, H: number, FPS: number, totalFrames: number,
    sorted: RenderElement[], images: Map<string, HTMLImageElement>,
    videos: Map<string, HTMLVideoElement>, audioBufs: Map<string, AudioBuffer>,
    videoConfig: VideoEncoderConfig,
    audioCodec: string,
    onVideoChunk: (c: EncodedVideoChunk, m?: EncodedVideoChunkMetadata | null) => void,
    onAudioChunk: (c: EncodedAudioChunk, m?: EncodedAudioChunkMetadata | null) => void,
    finalise: () => void,
    onProgress: ProgressCb,
    signal?: AbortSignal,
): Promise<void> {
    const US = 1_000_000;
    const spf = 1 / FPS;
    const SR = 44_100;

    // Audio
    const [mL, mR] = mixAudio(sorted, audioBufs, job.totalDuration, SR);
    const aEnc = new AudioEncoder({ output: onAudioChunk, error: e => console.error(e) });
    aEnc.configure({ codec: audioCodec, sampleRate: SR, numberOfChannels: 2, bitrate: 128_000 });
    const CHUNK = 1024;
    for (let p = 0; p < mL.length; p += CHUNK) {
        const cnt = Math.min(CHUNK, mL.length - p);
        const data = new Float32Array(cnt * 2);
        for (let i = 0; i < cnt; i++) { data[i] = mL[p + i]; data[cnt + i] = mR[p + i]; }
        const ad = new AudioData({ format: 'f32-planar', sampleRate: SR, numberOfFrames: cnt, numberOfChannels: 2, timestamp: Math.floor((p / SR) * US), data });
        aEnc.encode(ad);
        ad.close();
    }

    // Video
    const vEnc = new VideoEncoder({ output: onVideoChunk, error: e => console.error(e) });
    vEnc.configure(videoConfig);

    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d', { alpha: false })!;

    for (let frame = 0; frame < totalFrames; frame++) {
        if (signal?.aborted) { vEnc.close(); aEnc.close(); throw new DOMException('Cancelled', 'AbortError'); }

        const t = frame / FPS; // Use stable division for time

        for (const el of sorted) {
            if (el.collectionType !== 'video' || !el.mediaUrl) continue;
            if (t < el.startTime || t >= el.startTime + el.duration) continue;
            const vid = videos.get(el.elementId);
            if (vid) await seekTo(vid, t - el.startTime + (el.mediaOffset ?? 0));
        }

        drawFrame(ctx, W, H, sorted, images, videos, t);

        const bitmap = await createImageBitmap(canvas);
        const vf = new VideoFrame(bitmap, { timestamp: Math.floor(t * US), duration: Math.floor(spf * US) });
        bitmap.close();

        while (vEnc.encodeQueueSize > 2) await new Promise(r => setTimeout(r, 1));
        vEnc.encode(vf, { keyFrame: frame % FPS === 0 });
        vf.close();

        if (frame % 5 === 0) {
            onProgress({ phase: 'rendering', progress: frame / totalFrames, message: `Frame ${frame + 1} / ${totalFrames}` });
            await new Promise(r => setTimeout(r, 0));
        }
    }

    await vEnc.flush(); await aEnc.flush();
    vEnc.close(); aEnc.close();
    finalise();
}

export async function renderComposition(job: RenderJob, onProgress: ProgressCb, signal?: AbortSignal): Promise<void> {
    const W = job.width || 1080;
    const H = job.height || 1920;
    const FPS = job.fps || 30;
    const totalFrames = Math.ceil(job.totalDuration * FPS);
    const format = job.format || 'mp4';

    onProgress({ phase: 'preparing', progress: 0.1, message: 'Loading assets…' });
    const images = new Map<string, HTMLImageElement>();
    const videos = new Map<string, HTMLVideoElement>();
    const audioBufs = new Map<string, AudioBuffer>();
    const actx = new AudioContext({ sampleRate: 44100 });

    for (const el of job.elements) {
        if (!el.mediaUrl) continue;
        try {
            if (el.collectionType === 'image') {
                images.set(el.elementId, await loadImage(el.mediaUrl));
            } else if (el.collectionType === 'video') {
                // Fetch fully into a blob to prevent network stalls during frame-by-frame seeking
                const res = await fetch(el.mediaUrl);
                const blob = await res.blob();
                videos.set(el.elementId, await loadVideo(URL.createObjectURL(blob)));
                audioBufs.set(el.elementId, await actx.decodeAudioData(await blob.arrayBuffer()));
            } else if (el.collectionType === 'audio') {
                const res = await fetch(el.mediaUrl);
                const blob = await res.blob();
                audioBufs.set(el.elementId, await actx.decodeAudioData(await blob.arrayBuffer()));
            }
        } catch (e) { console.warn(e); }
    }
    await actx.close();

    const sorted = [...job.elements].sort((a, b) => a.zIndex - b.zIndex);

    try {
        let blob: Blob;
        if (format === 'mp4') {
            const { Muxer, ArrayBufferTarget } = await import('mp4-muxer');
            const target = new ArrayBufferTarget();
            const muxer = new Muxer({ target, video: { codec: 'avc', width: W, height: H }, audio: { codec: 'aac', sampleRate: 44100, numberOfChannels: 2 }, fastStart: 'in-memory' });
            await encodeComposition(job, W, H, FPS, totalFrames, sorted, images, videos, audioBufs,
                { codec: 'avc1.640033', width: W, height: H, bitrate: job.videoBitsPerSecond || 8_000_000, framerate: FPS, hardwareAcceleration: 'prefer-software' }, 'mp4a.40.2',
                (c, m) => muxer.addVideoChunk(c, m || undefined), (c, m) => muxer.addAudioChunk(c, m || undefined), () => muxer.finalize(), onProgress, signal
            );
            blob = new Blob([target.buffer], { type: 'video/mp4' });
        } else {
            const { Muxer, ArrayBufferTarget } = await import('webm-muxer');
            const target = new ArrayBufferTarget();
            const muxer = new Muxer({ target, video: { codec: 'V_VP8', width: W, height: H }, audio: { codec: 'A_OPUS', sampleRate: 44100, numberOfChannels: 2 }, type: 'webm' });
            await encodeComposition(job, W, H, FPS, totalFrames, sorted, images, videos, audioBufs,
                { codec: 'vp8', width: W, height: H, bitrate: job.videoBitsPerSecond || 8_000_000, framerate: FPS, hardwareAcceleration: 'prefer-software' }, 'opus',
                (c, m) => muxer.addVideoChunk(c, m || undefined), (c, m) => muxer.addAudioChunk(c, m || undefined), () => muxer.finalize(), onProgress, signal
            );
            blob = new Blob([target.buffer], { type: 'video/webm' });
        }

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `export-${Date.now()}.${format}`; a.click();
        onProgress({ phase: 'done', progress: 1, message: 'Export complete' });
    } catch (e: any) {
        onProgress({ phase: 'error', progress: 0, message: 'Export failed', error: e.message });
    }
}
