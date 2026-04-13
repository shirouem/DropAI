import { AbsoluteFill, Img, Video, Audio, Sequence, useCurrentFrame, useVideoConfig } from 'remotion';
import React from 'react';
import { z } from 'zod';

export const animationSchema = z.object({
    id: z.string(),
    type: z.string(),
    start: z.number(),
    duration: z.number(),
    easing: z.string(),
    from: z.number().optional(),
    to: z.number().optional(),
});

export const elementSchema = z.object({
    elementId: z.string(),
    collectionType: z.enum(['text', 'image', 'video', 'audio']),
    startTime: z.number(),
    duration: z.number(),
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
    rotation: z.number().optional(),
    opacity: z.number().optional(),
    content: z.string().optional(),
    mediaUrl: z.string().optional(),
    mediaOffset: z.number().optional(),
    volume: z.number().optional(),
    zIndex: z.number(),
    fontSize: z.number().optional(),
    fontWeight: z.string().optional(),
    fontStyle: z.string().optional(),
    textDecoration: z.string().optional(),
    letterSpacing: z.number().optional(),
    lineHeight: z.number().optional(),
    textAlign: z.enum(['left', 'center', 'right']).optional(),
    animations: z.array(animationSchema),
});

export const myCompSchema = z.object({
    elements: z.array(elementSchema),
    totalDuration: z.number(),
});

type ElementProps = z.infer<typeof elementSchema>;

const ANIM_CATEGORIES: Record<string, 'in' | 'out'> = {
    fadeIn: 'in', slideInLeft: 'in', slideInRight: 'in', slideInTop: 'in', slideInBottom: 'in', scaleIn: 'in', rotateIn: 'in', bounceIn: 'in', blurIn: 'in',
    fadeOut: 'out', slideOutLeft: 'out', slideOutRight: 'out', slideOutTop: 'out', slideOutBottom: 'out', scaleOut: 'out', rotateOut: 'out', blurOut: 'out'
};

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

type AnimatedStyle = { opacity: number; translateX: number; translateY: number; scale: number; rotate: number; blur: number };

function evaluateAnimations(el: ElementProps, localTime: number): AnimatedStyle {
    const result: AnimatedStyle = { opacity: el.opacity ?? 1, translateX: 0, translateY: 0, scale: 1, rotate: 0, blur: 0 };

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
            case 'scaleIn': { const sStart = anim.from ?? 0; const sEnd = anim.to ?? 1; result.scale = sStart + (sEnd - sStart) * t; break; }
            case 'scaleOut': { const sStart = anim.from ?? 1; const sEnd = anim.to ?? 0; result.scale = sStart + (sEnd - sStart) * t; break; }
            case 'rotateIn': result.rotate = -180 * (1 - t); break;
            case 'rotateOut': result.rotate = 180 * t; break;
            case 'bounceIn': { const sStart = anim.from ?? 0; const sEnd = anim.to ?? 1; const springT = easeValue(rawT, 'spring'); result.scale = sStart + (sEnd - sStart) * springT; break; }
            case 'blurIn': result.blur = 10 * (1 - t); result.opacity *= t; break;
            case 'blurOut': result.blur = 10 * t; result.opacity *= (1 - t); break;
        }
    }
    return result;
}

const RenderedElement: React.FC<{ el: ElementProps }> = ({ el }) => {
    const frame = useCurrentFrame();
    const { fps, width } = useVideoConfig();

    const localTime = frame / fps;
    const anims = evaluateAnimations(el, localTime);

    if (anims.opacity <= 0.001) return null;

    const baseStyle: React.CSSProperties = {
        position: 'absolute',
        left: `${el.x}%`,
        top: `${el.y}%`,
        width: `${el.width}%`,
        height: `${el.height}%`,
        zIndex: el.zIndex,
        opacity: Math.max(0, Math.min(1, anims.opacity)),
        transform: `
            translate(-50%, -50%)
            translate(${anims.translateX}%, ${anims.translateY}%)
            rotate(${(el.rotation ?? 0) + anims.rotate}deg)
            scale(${Math.max(0.001, anims.scale)})
        `,
        transformOrigin: 'top left',
        filter: anims.blur > 0 ? `blur(${anims.blur}px)` : undefined,
    };

    if (el.collectionType === 'image' && el.mediaUrl) {
        return <Img src={el.mediaUrl} style={{ ...baseStyle, objectFit: 'cover' }} />;
    } else if (el.collectionType === 'video' && el.mediaUrl) {
        return (
            <Video
                src={el.mediaUrl}
                style={{ ...baseStyle, objectFit: 'cover' }}
                startFrom={Math.floor((el.mediaOffset || 0) * fps)}
                volume={el.volume ?? 1}
            />
        );
    } else if (el.collectionType === 'audio' && el.mediaUrl) {
        return (
            <Audio
                src={el.mediaUrl}
                startFrom={Math.floor((el.mediaOffset || 0) * fps)}
                volume={el.volume ?? 1}
            />
        );
    } else if (el.collectionType === 'text') {
        const pxFontSize = ((el.fontSize ?? 16) / 320) * width;
        return (
            <div
                style={{
                    ...baseStyle,
                    fontFamily: 'Inter, sans-serif',
                    fontSize: `${pxFontSize}px`,
                    fontWeight: el.fontWeight ?? 'bold',
                    fontStyle: el.fontStyle ?? 'normal',
                    textAlign: el.textAlign ?? 'center',
                    lineHeight: el.lineHeight ?? 1.2,
                    color: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: el.textAlign === 'left' ? 'flex-start' : el.textAlign === 'right' ? 'flex-end' : 'center',
                    whiteSpace: 'pre-wrap',
                }}
            >
                {el.content}
            </div>
        );
    }

    return null;
};

export const MyComposition: React.FC<z.infer<typeof myCompSchema>> = ({ elements }) => {
    const { fps } = useVideoConfig();
    const sorted = [...elements].sort((a, b) => a.zIndex - b.zIndex);

    return (
        <AbsoluteFill style={{ backgroundColor: 'black' }}>
            {sorted.map((el, i) => {
                const startFrame = Math.floor(el.startTime * fps);
                const durationInFrames = Math.max(1, Math.floor(el.duration * fps));

                return (
                    <Sequence key={`${el.elementId}-${i}`} from={startFrame} durationInFrames={durationInFrames}>
                        <RenderedElement el={el} />
                    </Sequence>
                );
            })}
        </AbsoluteFill>
    );
};