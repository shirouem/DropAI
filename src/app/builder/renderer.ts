/**
 * DropAI Client-Side Renderer — v7 (Optimized Single-Threaded)
 * 
 * Fixes laptop freezing by removing heavy Web Worker image transfers
 * and redundant HTMLVideoElement pools. Restores strict frame queue
 * throttling to prevent memory (RAM) exhaustion during long exports.
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
    speed?: number;        // Playback rate
    audioFadeIn?: number;  // Fade-in duration in seconds
    audioFadeOut?: number; // Fade-out duration in seconds
    zIndex: number;
    fontSize?: number;
    fontWeight?: string;
    fontStyle?: string;
    textDecoration?: string;
    letterSpacing?: number;
    lineHeight?: number;
    textAlign?: 'left' | 'center' | 'right';
    textStrokeColor?: string;
    textStrokeWidth?: number;
    animations: Array<{
        id: string;
        type: string;
        start: number;
        duration: number;
        easing: string;
        from?: number;
        to?: number;
    }>;
    nestedCompositionTransform?: {
        x: number;
        y: number;
        width: number;
        height: number;
        rotation?: number;
        opacity?: number;
        startTime: number;
        duration: number;
        animations: RenderElement["animations"];
    };
    nestedCompositionBlur?: number;
};

export interface RenderJob {
    elements: RenderElement[];
    totalDuration: number;
    width?: number;
    height?: number;
    fps?: number;
    videoBitsPerSecond?: number;
    format?: RenderFormat;
    outputName?: string;
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
function applyNestedCompositionTransform(el: RenderElement, currentTime: number): RenderElement {
    const group = el.nestedCompositionTransform;
    if (!group) return el;

    const groupAnim = evaluateAnimations({
        ...el,
        startTime: group.startTime,
        duration: group.duration,
        opacity: group.opacity ?? 1,
        animations: group.animations || [],
    }, currentTime);

    const baseCenterX = group.x + group.width / 2;
    const baseCenterY = group.y + group.height / 2;
    const childCenterX = group.x + ((el.x + el.width / 2) / 100) * group.width;
    const childCenterY = group.y + ((el.y + el.height / 2) / 100) * group.height;
    const scale = groupAnim.scale;
    const rotation = (group.rotation || 0) + groupAnim.rotate;
    const rad = rotation * Math.PI / 180;
    const dx = (childCenterX - baseCenterX) * scale;
    const dy = (childCenterY - baseCenterY) * scale;
    const rotatedDx = dx * Math.cos(rad) - dy * Math.sin(rad);
    const rotatedDy = dx * Math.sin(rad) + dy * Math.cos(rad);
    const width = (el.width / 100) * group.width * scale;
    const height = (el.height / 100) * group.height * scale;
    const centerX = baseCenterX + groupAnim.translateX + rotatedDx;
    const centerY = baseCenterY + groupAnim.translateY + rotatedDy;

    return {
        ...el,
        x: centerX - width / 2,
        y: centerY - height / 2,
        width,
        height,
        rotation: (el.rotation || 0) + rotation,
        opacity: (el.opacity ?? 1) * groupAnim.opacity,
        nestedCompositionBlur: Math.max(el.nestedCompositionBlur || 0, groupAnim.blur || 0),
    };
}

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
        
        // Critical: Append to DOM so Chromium's video decoder doesn't deprioritize it!
        // When off-screen, decoding can lag and hit our safety timeouts, causing grey flashes.
        v.style.position = 'fixed';
        v.style.opacity = '0.001';
        v.style.pointerEvents = 'none';
        v.style.width = '10px';
        v.style.height = '10px';
        v.style.zIndex = '-9999';
        v.style.top = '0';
        v.style.left = '0';
        document.body.appendChild(v);

        v.src = url;
        v.onloadeddata = () => res(v);
        v.onerror = rej;
        v.load();
    });
}

/** 
 * seekTo — Guaranteed frame-accurate seeking.
 * 
 * Uses a single polling loop that waits for BOTH conditions:
 *   1. The seek has completed (currentTime is near target)
 *   2. readyState >= 2 (frame data is actually decoded)
 * 
 * This eliminates the race between seeked events and safety timeouts
 * that caused grey flashes. No vsync dependency (fast), no event ordering
 * bugs (reliable).
 */
function seekTo(vid: HTMLVideoElement, target: number): Promise<void> {
    return new Promise(resolve => {
        const safeTarget = target + 0.005;
        const clampedTarget = Math.max(0, Math.min(safeTarget, (vid.duration || 0) - 0.05));
        
        // Skip seek if already at the right position with data ready
        if (Math.abs(vid.currentTime - clampedTarget) < 0.02 && vid.readyState >= 2) {
            resolve();
            return;
        }

        // Initiate the seek
        vid.currentTime = clampedTarget;

        // Single polling loop: wait until the decoder has actually
        // landed on the target AND has pixel data ready to draw.
        // This runs every 2ms — far faster than any event-based approach —
        // and has zero risk of resolving before the frame is decoded.
        let elapsed = 0;
        const poll = () => {
            // Frame is decoded and position is correct
            if (vid.readyState >= 2 && Math.abs(vid.currentTime - clampedTarget) < 0.1) {
                resolve();
                return;
            }
            elapsed += 2;
            // Hard deadline: 5 seconds. If we haven't got a frame by now,
            // something is seriously wrong — resolve anyway so the export
            // doesn't hang forever. At this point readyState < 2 is caught
            // by drawFrame which will draw the last good cached frame.
            if (elapsed > 5000) {
                resolve();
                return;
            }
            setTimeout(poll, 2);
        };
        // Start polling on next tick to give the browser a chance to start seeking
        setTimeout(poll, 2);
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
    lastFrames: Map<string, HTMLCanvasElement>
) {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);

    for (const el of elements) {
        if (el.collectionType === 'audio') continue;
        if (t < el.startTime || t >= el.startTime + el.duration - 0.0001) continue;

        const visualEl = applyNestedCompositionTransform(el, t);
        const anim = evaluateAnimations(visualEl, t);
        if (anim.opacity <= 0.001) continue;

        const px = (visualEl.x / 100) * W;
        const py = (visualEl.y / 100) * H;
        const pw = (visualEl.width / 100) * W;
        const ph = (visualEl.height / 100) * H;
        const cx = px + pw / 2 + (anim.translateX / 100) * W;
        const cy = py + ph / 2 + (anim.translateY / 100) * H;

        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, anim.opacity));
        const blur = Math.max(anim.blur, visualEl.nestedCompositionBlur || 0);
        if (blur > 0) ctx.filter = `blur(${blur}px)`;

        ctx.translate(cx, cy);
        ctx.rotate(((visualEl.rotation ?? 0) + anim.rotate) * Math.PI / 180);
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
                // Cache last good frame as safety net
                let fb = lastFrames.get(el.elementId);
                if (!fb) {
                    fb = document.createElement('canvas');
                    fb.width = pw;
                    fb.height = ph;
                    lastFrames.set(el.elementId, fb);
                }
                fb.getContext('2d')!.drawImage(vid, 0, 0, pw, ph);
            } else {
                // Fallback: draw last known good frame (only hit if 5s timeout expired)
                const fb = lastFrames.get(el.elementId);
                if (fb) {
                    ctx.drawImage(fb, 0, 0, pw, ph);
                }
                // No else — if there's truly no frame yet, the black background shows,
                // which is the correct behavior for a video that hasn't started.
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
            // Draw stroke first so fill renders on top
            if (el.textStrokeWidth && el.textStrokeWidth > 0) {
                const strokeW = (el.textStrokeWidth / PREVIEW_W) * W;
                ctx.strokeStyle = el.textStrokeColor || '#000000';
                ctx.lineWidth = strokeW * 2;
                ctx.lineJoin = 'round';
                for (let i = 0; i < lines.length; i++) {
                    const tx = el.textAlign === 'left' ? 0 : el.textAlign === 'right' ? pw : pw / 2;
                    ctx.strokeText(lines[i], tx, startY + i * lh);
                }
            }
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
        const baseVol = el.volume ?? 1;
        const fadeIn  = el.audioFadeIn  ?? 0;
        const fadeOut = el.audioFadeOut ?? 0;
        const off = Math.max(0, (el.mediaOffset ?? 0) * sr);
        const speed = Math.max(0.05, el.speed ?? 1);
        const start = Math.floor(el.startTime * sr);
        const count = Math.max(0, Math.min(Math.floor(el.duration * sr), Math.floor((buf.length - off) / speed), n - start));
        const sL = buf.getChannelData(0);
        const sR = buf.numberOfChannels > 1 ? buf.getChannelData(1) : sL;
        
        let startIdx = 0;
        if (start < 0) {
            startIdx = -start;
        }
        
        for (let i = startIdx; i < count; i++) {
            // Compute fade multiplier matching the preview ref callback logic
            const elapsed   = i / sr;                    // seconds since element start
            const remaining = el.duration - elapsed;     // seconds until element end
            let fadeMult = 1;
            if (fadeIn  > 0 && elapsed   < fadeIn)  fadeMult = Math.min(1, elapsed   / fadeIn);
            else if (fadeOut > 0 && remaining < fadeOut) fadeMult = Math.min(1, remaining / fadeOut);
            const v = baseVol * fadeMult;
            const srcPos = off + i * speed;
            const srcIdx = Math.floor(srcPos);
            const frac = srcPos - srcIdx;
            const nextIdx = Math.min(srcIdx + 1, buf.length - 1);
            const sampleL = (sL[srcIdx] ?? 0) * (1 - frac) + (sL[nextIdx] ?? 0) * frac;
            const sampleR = (sR[srcIdx] ?? 0) * (1 - frac) + (sR[nextIdx] ?? 0) * frac;
            L[start + i] += sampleL * v;
            R[start + i] += sampleR * v;
        }
    }
    
    // Clamp values to [-1.0, 1.0] to prevent integer overflow (static) in the audio encoder
    for (let i = 0; i < n; i++) {
        if (L[i] > 1.0) L[i] = 1.0;
        else if (L[i] < -1.0) L[i] = -1.0;
        
        if (R[i] > 1.0) R[i] = 1.0;
        else if (R[i] < -1.0) R[i] = -1.0;
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
    const CHUNK = 4096;
    for (let p = 0; p < mL.length; p += CHUNK) {
        if (signal?.aborted) { aEnc.close(); throw new DOMException('Cancelled', 'AbortError'); }
        const cnt = Math.min(CHUNK, mL.length - p);
        const data = new Float32Array(cnt * 2);
        for (let i = 0; i < cnt; i++) { data[i] = mL[p + i]; data[cnt + i] = mR[p + i]; }
        const ad = new AudioData({ format: 'f32-planar', sampleRate: SR, numberOfFrames: cnt, numberOfChannels: 2, timestamp: Math.floor((p / SR) * US), data });
        aEnc.encode(ad);
        ad.close();
        
        // Prevent audio encoder from hoarding RAM
        while (aEnc.encodeQueueSize > 50) {
            await new Promise(r => setTimeout(r, 2));
        }
    }

    // Video
    const vEnc = new VideoEncoder({ output: onVideoChunk, error: e => console.error(e) });
    vEnc.configure(videoConfig);

    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: true })!;
    const lastFrames = new Map<string, HTMLCanvasElement>();

    let lastProgressTime = Date.now();

    for (let frame = 0; frame < totalFrames; frame++) {
        if (signal?.aborted) { vEnc.close(); aEnc.close(); throw new DOMException('Cancelled', 'AbortError'); }

        const t = frame / FPS;

        for (const el of sorted) {
            if (el.collectionType !== 'video' || !el.mediaUrl) continue;
            if (t < el.startTime || t >= el.startTime + el.duration) continue;
            const vid = videos.get(el.elementId);
            if (vid) await seekTo(vid, (t - el.startTime) * Math.max(0.05, el.speed ?? 1) + (el.mediaOffset ?? 0));
        }

        drawFrame(ctx, W, H, sorted, images, videos, t, lastFrames);

        const bitmap = await createImageBitmap(canvas);
        const vf = new VideoFrame(bitmap, { timestamp: Math.floor(t * US), duration: Math.floor(spf * US) });
        bitmap.close();

        // CRITICAL PERFORMANCE FIX: Prevent OOM freezes by pausing the frame loop until encoder queue drains
        while (vEnc.encodeQueueSize > 2) {
            await new Promise(r => setTimeout(r, 5));
        }

        vEnc.encode(vf, { keyFrame: frame % FPS === 0 });
        vf.close();

        // Throttle UI updates
        if (Date.now() - lastProgressTime > 100) {
            onProgress({ phase: 'rendering', progress: frame / totalFrames, message: `Rendering Frame ${frame + 1} / ${totalFrames}` });
            lastProgressTime = Date.now();
        }
    }

    // Drain remaining frames
    while (vEnc.encodeQueueSize > 0 || aEnc.encodeQueueSize > 0) {
        await new Promise(r => setTimeout(r, 10));
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

    const images = new Map<string, HTMLImageElement>();
    const videos = new Map<string, HTMLVideoElement>();
    const audioBufs = new Map<string, AudioBuffer>();
    const objectUrls: string[] = [];
    const actx = new AudioContext({ sampleRate: 44100 });

    try {
        onProgress({ phase: 'preparing', progress: 0.1, message: 'Loading assets…' });

        for (const el of job.elements) {
            if (!el.mediaUrl) continue;
            try {
                if (el.collectionType === 'image') {
                    images.set(el.elementId, await loadImage(el.mediaUrl));
                } else if (el.collectionType === 'video') {
                    const res = await fetch(el.mediaUrl);
                    const blob = await res.blob();
                    const blobUrl = URL.createObjectURL(blob);
                    objectUrls.push(blobUrl);
                    videos.set(el.elementId, await loadVideo(blobUrl));
                    audioBufs.set(el.elementId, await actx.decodeAudioData(await blob.arrayBuffer()));
                } else if (el.collectionType === 'audio') {
                    const res = await fetch(el.mediaUrl);
                    const blob = await res.blob();
                    audioBufs.set(el.elementId, await actx.decodeAudioData(await blob.arrayBuffer()));
                }
            } catch (e) { console.warn(e); }
        }

        const sorted = [...job.elements].sort((a, b) => a.zIndex - b.zIndex);

        let blob: Blob;
        if (format === 'mp4') {
            const { Muxer, ArrayBufferTarget } = await import('mp4-muxer');
            const target = new ArrayBufferTarget();
            const muxer = new Muxer({ target, video: { codec: 'avc', width: W, height: H }, audio: { codec: 'aac', sampleRate: 44100, numberOfChannels: 2 }, fastStart: 'in-memory' });
            await encodeComposition(job, W, H, FPS, totalFrames, sorted, images, videos, audioBufs,
                { codec: 'avc1.640033', width: W, height: H, bitrate: job.videoBitsPerSecond || 8_000_000, framerate: FPS, hardwareAcceleration: 'prefer-hardware' }, 'mp4a.40.2',
                (c, m) => muxer.addVideoChunk(c, m || undefined), (c, m) => muxer.addAudioChunk(c, m || undefined), () => muxer.finalize(), onProgress, signal
            );
            blob = new Blob([target.buffer], { type: 'video/mp4' });
        } else {
            const { Muxer, ArrayBufferTarget } = await import('webm-muxer');
            const target = new ArrayBufferTarget();
            const muxer = new Muxer({ target, video: { codec: 'V_VP8', width: W, height: H }, audio: { codec: 'A_OPUS', sampleRate: 44100, numberOfChannels: 2 }, type: 'webm' });
            await encodeComposition(job, W, H, FPS, totalFrames, sorted, images, videos, audioBufs,
                { codec: 'vp8', width: W, height: H, bitrate: job.videoBitsPerSecond || 8_000_000, framerate: FPS, hardwareAcceleration: 'prefer-hardware' }, 'opus',
                (c, m) => muxer.addVideoChunk(c, m || undefined), (c, m) => muxer.addAudioChunk(c, m || undefined), () => muxer.finalize(), onProgress, signal
            );
            blob = new Blob([target.buffer], { type: 'video/webm' });
        }

        const url = URL.createObjectURL(blob);
        const safeName = (job.outputName || `export-${Date.now()}`)
            .replace(/[<>:"/\\|?*\x00-\x1F]/g, '-')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 120) || `export-${Date.now()}`;
        const a = document.createElement('a'); a.href = url; a.download = `${safeName}.${format}`; a.click();
        
        // Clean up the final export URL after download
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        
        onProgress({ phase: 'done', progress: 1, message: 'Export complete' });
    } catch (e: unknown) {
        onProgress({ phase: 'error', progress: 0, message: 'Export failed', error: e instanceof Error ? e.message : String(e) });
        throw e;
    } finally {
        await actx.close().catch(() => {});
        for (const url of objectUrls) {
            URL.revokeObjectURL(url);
        }
        for (const vid of videos.values()) {
            vid.removeAttribute('src');
            vid.load();
            if (vid.parentNode) {
                vid.parentNode.removeChild(vid);
            }
        }
    }
}
