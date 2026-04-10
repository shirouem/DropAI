/**
 * DropAI Client-Side Renderer
 *
 * Records the composition by:
 * 1. Creating a hidden OffscreenCanvas (or on-screen fallback)
 * 2. Scrubbing through time at a fixed FPS using requestAnimationFrame
 * 3. Capturing each frame via canvas.captureStream()
 * 4. Mixing audio tracks via WebAudio and routing into MediaRecorder
 * 5. Encoding to WebM and downloading
 */

export type RenderElement = {
    elementId: string;
    collectionType: 'text' | 'image' | 'video' | 'audio';
    startTime: number;
    duration: number;
    x: number; // percent of canvas width
    y: number; // percent of canvas height
    width: number;  // percent
    height: number; // percent
    rotation?: number;
    opacity?: number;
    content?: string;
    mediaUrl?: string;       // resolved URL for this variant
    mediaOffset?: number;    // trim offset in seconds
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
}

export type RenderProgress = {
    phase: 'preparing' | 'rendering' | 'encoding' | 'done' | 'error';
    progress: number; // 0-1
    message: string;
    error?: string;
};

type ProgressCallback = (progress: RenderProgress) => void;

// ─── Easing helpers ────────────────────────────────────────────────────────
function applyEasing(t: number, easing: string): number {
    t = Math.max(0, Math.min(1, t));
    switch (easing) {
        case 'easeIn': return t * t;
        case 'easeOut': return 1 - (1 - t) * (1 - t);
        case 'easeInOut': return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        case 'spring': {
            const c4 = (2 * Math.PI) / 3;
            return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
        }
        default: return t;
    }
}

type AnimStyle = { opacity: number; translateX: number; translateY: number; scale: number; rotate: number; blur: number };

function evaluateAnimations(el: RenderElement, currentTime: number): AnimStyle {
    const result: AnimStyle = { opacity: el.opacity ?? 1, translateX: 0, translateY: 0, scale: 1, rotate: 0, blur: 0 };
    const localTime = currentTime - el.startTime;
    const IN_TYPES = new Set(['fadeIn', 'slideInLeft', 'slideInRight', 'slideInTop', 'slideInBottom', 'scaleIn', 'rotateIn', 'bounceIn', 'blurIn']);
    const OUT_TYPES = new Set(['fadeOut', 'slideOutLeft', 'slideOutRight', 'slideOutTop', 'slideOutBottom', 'scaleOut', 'rotateOut', 'blurOut']);

    for (const anim of el.animations ?? []) {
        const animEnd = anim.start + anim.duration;
        const isIn = IN_TYPES.has(anim.type);
        const isOut = OUT_TYPES.has(anim.type);

        if (localTime < anim.start) {
            if (isIn) applyStartState(anim.type, result, anim);
            continue;
        }
        if (localTime > animEnd) {
            if (isOut) applyEndState(anim.type, result, anim);
            continue;
        }
        const rawT = (localTime - anim.start) / (anim.duration || 0.01);
        const t = applyEasing(rawT, anim.easing);
        applyMid(anim.type, t, rawT, result, anim);
    }
    return result;
}

function applyStartState(type: string, r: AnimStyle, anim: { from?: number; to?: number }) {
    if (type === 'fadeIn') r.opacity = 0;
    else if (type === 'slideInLeft') r.translateX = -100;
    else if (type === 'slideInRight') r.translateX = 100;
    else if (type === 'slideInTop') r.translateY = -100;
    else if (type === 'slideInBottom') r.translateY = 100;
    else if (type === 'scaleIn' || type === 'bounceIn') r.scale = anim.from ?? 0;
    else if (type === 'rotateIn') r.rotate = -180;
    else if (type === 'blurIn') { r.blur = 10; r.opacity = 0; }
}
function applyEndState(type: string, r: AnimStyle, anim: { from?: number; to?: number }) {
    if (type === 'fadeOut') r.opacity = 0;
    else if (type === 'slideOutLeft') r.translateX = -100;
    else if (type === 'slideOutRight') r.translateX = 100;
    else if (type === 'slideOutTop') r.translateY = -100;
    else if (type === 'slideOutBottom') r.translateY = 100;
    else if (type === 'scaleOut') r.scale = anim.to ?? 0;
    else if (type === 'rotateOut') r.rotate = 180;
    else if (type === 'blurOut') { r.blur = 10; r.opacity = 0; }
}
function applyMid(type: string, t: number, rawT: number, r: AnimStyle, anim: { from?: number; to?: number }) {
    if (type === 'fadeIn') r.opacity *= t;
    else if (type === 'fadeOut') r.opacity *= (1 - t);
    else if (type === 'slideInLeft') r.translateX = -100 * (1 - t);
    else if (type === 'slideInRight') r.translateX = 100 * (1 - t);
    else if (type === 'slideInTop') r.translateY = -100 * (1 - t);
    else if (type === 'slideInBottom') r.translateY = 100 * (1 - t);
    else if (type === 'slideOutLeft') r.translateX = -100 * t;
    else if (type === 'slideOutRight') r.translateX = 100 * t;
    else if (type === 'slideOutTop') r.translateY = -100 * t;
    else if (type === 'slideOutBottom') r.translateY = 100 * t;
    else if (type === 'scaleIn' || type === 'scaleOut' || type === 'bounceIn') {
        const s0 = anim.from ?? (type === 'scaleIn' || type === 'bounceIn' ? 0 : 1);
        const s1 = anim.to ?? (type === 'scaleIn' || type === 'bounceIn' ? 1 : 0);
        const st = type === 'bounceIn' ? applyEasing(rawT, 'spring') : t;
        r.scale = s0 + (s1 - s0) * st;
    }
    else if (type === 'rotateIn') r.rotate = -180 * (1 - t);
    else if (type === 'rotateOut') r.rotate = 180 * t;
    else if (type === 'blurIn') { r.blur = 10 * (1 - t); r.opacity *= t; }
    else if (type === 'blurOut') { r.blur = 10 * t; r.opacity *= (1 - t); }
}

// ─── Media preloading ────────────────────────────────────────────────────────
async function preloadImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = url;
    });
}

async function preloadVideo(url: string, offset: number = 0): Promise<HTMLVideoElement> {
    return new Promise((resolve, reject) => {
        const v = document.createElement('video');
        v.crossOrigin = 'anonymous';
        v.preload = 'auto';
        v.muted = true; // audio handled separately via WebAudio
        v.src = url;
        v.onloadeddata = () => {
            v.currentTime = offset;
            resolve(v);
        };
        v.onerror = reject;
        v.load();
    });
}

// ─── Main render function ────────────────────────────────────────────────────
export async function renderComposition(
    job: RenderJob,
    onProgress: ProgressCallback,
    signal?: AbortSignal
): Promise<void> {
    const W = job.width ?? 1080;
    const H = job.height ?? 1920;
    const FPS = job.fps ?? 30;
    const TOTAL = job.totalDuration;
    const TOTAL_FRAMES = Math.ceil(TOTAL * FPS);

    onProgress({ phase: 'preparing', progress: 0, message: 'Preparing render…' });

    // Create the recording canvas (on-screen, hidden off to side)
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    canvas.style.position = 'fixed';
    canvas.style.top = '-99999px';
    canvas.style.left = '-99999px';
    canvas.style.opacity = '0';
    canvas.style.pointerEvents = 'none';
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d')!;

    // ── Preload all assets ─────────────────────────────────────────────────
    onProgress({ phase: 'preparing', progress: 0.05, message: 'Loading assets…' });

    const imageCache = new Map<string, HTMLImageElement>();
    const videoCache = new Map<string, HTMLVideoElement>();

    const mediaEls = job.elements.filter(e => e.mediaUrl && (e.collectionType === 'video' || e.collectionType === 'image' || e.collectionType === 'audio'));
    let loaded = 0;
    await Promise.all(mediaEls.map(async el => {
        try {
            if (el.collectionType === 'image' && el.mediaUrl) {
                const img = await preloadImage(el.mediaUrl);
                imageCache.set(el.elementId, img);
            } else if ((el.collectionType === 'video') && el.mediaUrl) {
                const vid = await preloadVideo(el.mediaUrl, el.mediaOffset ?? 0);
                videoCache.set(el.elementId, vid);
            }
            // audio handled via WebAudio below
        } catch (e) {
            console.warn(`Failed to preload asset for ${el.elementId}`, e);
        }
        loaded++;
        onProgress({ phase: 'preparing', progress: 0.05 + 0.25 * (loaded / mediaEls.length), message: `Loading assets… (${loaded}/${mediaEls.length})` });
    }));

    // ── WebAudio for mixing audio tracks ──────────────────────────────────
    onProgress({ phase: 'preparing', progress: 0.3, message: 'Setting up audio…' });

    const audioCtx = new AudioContext();
    const audioBufferCache = new Map<string, AudioBuffer>();

    const audioEls = job.elements.filter(e => e.mediaUrl && (e.collectionType === 'audio' || e.collectionType === 'video'));
    for (const el of audioEls) {
        if (el.mediaUrl) {
            try {
                const res = await fetch(el.mediaUrl);
                const arrayBuffer = await res.arrayBuffer();
                const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
                audioBufferCache.set(el.elementId, audioBuffer);
            } catch (e) {
                console.warn(`Could not decode audio for ${el.elementId}`, e);
            }
        }
    }

    // ── Setup MediaRecorder ────────────────────────────────────────────────
    // Canvas video stream
    const canvasStream = canvas.captureStream(FPS);

    // Audio destination stream
    const audioDestination = audioCtx.createMediaStreamDestination();

    // Merge canvas + audio tracks
    const combinedStream = new MediaStream([
        ...canvasStream.getVideoTracks(),
        ...audioDestination.stream.getAudioTracks(),
    ]);

    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
        ? 'video/webm;codecs=vp9,opus'
        : MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
            ? 'video/webm;codecs=vp8,opus'
            : 'video/webm';

    const recorder = new MediaRecorder(combinedStream, {
        mimeType,
        videoBitsPerSecond: job.videoBitsPerSecond ?? 8_000_000,
    });

    const chunks: Blob[] = [];
    recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };

    recorder.start(100); // collect data every 100ms

    // Schedule all audio nodes to play at the right time within the recording
    const recordingStart = audioCtx.currentTime + 0.1; // tiny buffer

    for (const el of audioEls) {
        const buf = audioBufferCache.get(el.elementId);
        if (!buf) continue;

        const gainNode = audioCtx.createGain();
        gainNode.gain.value = el.volume ?? 1;
        gainNode.connect(audioDestination);

        const source = audioCtx.createBufferSource();
        source.buffer = buf;
        source.connect(gainNode);

        const offset = el.mediaOffset ?? 0;
        const startAt = recordingStart + el.startTime;
        const dur = Math.min(el.duration, buf.duration - offset);
        source.start(startAt, offset, dur);
    }

    // ── Frame rendering loop ───────────────────────────────────────────────
    onProgress({ phase: 'rendering', progress: 0, message: 'Rendering frames…' });

    const SPF = 1 / FPS; // seconds per frame
    const sortedElements = [...job.elements].sort((a, b) => a.zIndex - b.zIndex);

    const drawFrame = async (frame: number) => {
        const t = frame * SPF;

        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, W, H);

        for (const el of sortedElements) {
            if (el.collectionType === 'audio') continue; // audio is handled separately
            const isActive = t >= el.startTime && t < el.startTime + el.duration;
            if (!isActive) continue;

            const anim = evaluateAnimations(el, t);
            if (anim.opacity <= 0) continue;

            const px = (el.x / 100) * W;
            const py = (el.y / 100) * H;
            const pw = (el.width / 100) * W;
            const ph = (el.height / 100) * H;
            const cx = px + pw / 2;
            const cy = py + ph / 2;

            ctx.save();
            ctx.globalAlpha = Math.max(0, Math.min(1, anim.opacity));

            if (anim.blur > 0) {
                ctx.filter = `blur(${anim.blur}px)`;
            }

            // Transform: center, rotate, scale, translate
            ctx.translate(cx + (anim.translateX / 100) * W, cy + (anim.translateY / 100) * H);
            ctx.rotate(((el.rotation ?? 0) + anim.rotate) * Math.PI / 180);
            ctx.scale(anim.scale, anim.scale);
            ctx.translate(-pw / 2, -ph / 2);

            if (el.collectionType === 'image' && el.mediaUrl) {
                const img = imageCache.get(el.elementId);
                if (img) {
                    ctx.drawImage(img, 0, 0, pw, ph);
                }
            } else if (el.collectionType === 'video' && el.mediaUrl) {
                const vid = videoCache.get(el.elementId);
                if (vid) {
                    const localTime = t - el.startTime + (el.mediaOffset ?? 0);
                    // Seek video to correct time (synchronous read of canvas from video)
                    vid.currentTime = Math.min(localTime, vid.duration - 0.01);
                    try {
                        ctx.drawImage(vid, 0, 0, pw, ph);
                    } catch { /* stale frame */ }
                } else {
                    // Fallback: purple placeholder
                    ctx.fillStyle = '#7c3aed';
                    ctx.fillRect(0, 0, pw, ph);
                }
            } else if (el.collectionType === 'text' && el.content) {
                const fontSize = el.fontSize ?? 32;
                const scaledFontSize = (fontSize / 100) * W; // convert preview px → render px
                ctx.font = `${el.fontStyle ?? 'normal'} ${el.fontWeight ?? 'bold'} ${scaledFontSize}px Inter, sans-serif`;
                ctx.fillStyle = '#ffffff';
                ctx.textAlign = el.textAlign ?? 'center';
                ctx.textBaseline = 'middle';
                // Simple line wrapping
                const words = el.content.split(' ');
                const lines: string[] = [];
                let current = '';
                for (const word of words) {
                    const test = current ? `${current} ${word}` : word;
                    if (ctx.measureText(test).width > pw * 0.9 && current) {
                        lines.push(current);
                        current = word;
                    } else {
                        current = test;
                    }
                }
                if (current) lines.push(current);
                const lineH = scaledFontSize * (el.lineHeight ?? 1.3);
                const totalTextH = lines.length * lineH;
                const startY = ph / 2 - totalTextH / 2 + lineH / 2;
                for (let i = 0; i < lines.length; i++) {
                    const tx = el.textAlign === 'left' ? 4 : el.textAlign === 'right' ? pw - 4 : pw / 2;
                    ctx.fillText(lines[i], tx, startY + i * lineH);
                }
            }

            ctx.restore();
        }

        // Sync video elements to the correct frame time
        // (already sought above in drawFrame)
    };

    // We can't truly await video seek in a tight loop, so we pace ourselves:
    // For video elements, seek → wait for seeked event → draw.
    // For speed, we do async seek-and-draw per frame.

    const seekVideo = (vid: HTMLVideoElement, time: number): Promise<void> =>
        new Promise(resolve => {
            if (Math.abs(vid.currentTime - time) < 0.05) { resolve(); return; }
            const onSeeked = () => { vid.removeEventListener('seeked', onSeeked); resolve(); };
            vid.addEventListener('seeked', onSeeked);
            vid.currentTime = time;
        });

    for (let frame = 0; frame < TOTAL_FRAMES; frame++) {
        if (signal?.aborted) {
            recorder.stop();
            canvas.remove();
            await audioCtx.close();
            onProgress({ phase: 'error', progress: 0, message: 'Render cancelled', error: 'cancelled' });
            return;
        }

        const t = frame * SPF;

        // Seek all active video elements
        const videoEls = sortedElements.filter(el =>
            el.collectionType === 'video' && el.mediaUrl && t >= el.startTime && t < el.startTime + el.duration
        );
        await Promise.all(videoEls.map(async el => {
            const vid = videoCache.get(el.elementId);
            if (vid) {
                const localTime = t - el.startTime + (el.mediaOffset ?? 0);
                await seekVideo(vid, Math.min(localTime, vid.duration - 0.01));
            }
        }));

        await drawFrame(frame);

        if (frame % 10 === 0) {
            onProgress({
                phase: 'rendering',
                progress: frame / TOTAL_FRAMES,
                message: `Rendering frame ${frame + 1} / ${TOTAL_FRAMES}`,
            });
            // Yield to browser
            await new Promise(r => setTimeout(r, 0));
        }
    }

    // ── Stop recording & download ──────────────────────────────────────────
    onProgress({ phase: 'encoding', progress: 0.95, message: 'Encoding video…' });

    await new Promise<void>(resolve => {
        recorder.onstop = () => resolve();
        recorder.stop();
    });

    await audioCtx.close();
    canvas.remove();

    const blob = new Blob(chunks, { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dropai-export-${Date.now()}.webm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 10_000);

    onProgress({ phase: 'done', progress: 1, message: 'Export complete!' });
}
