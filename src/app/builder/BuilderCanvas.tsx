"use client";

import React, { useState, useEffect, useRef, useId, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    Play, Pause, Plus, Image as ImageIcon, Music, Download, Upload,
    Layers, X, Type, MonitorPlay, SlidersHorizontal, GripVertical, Shuffle, SkipBack, Video, Trash2, Sparkles, ChevronDown, Eye, EyeOff,
    Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight, Scissors, MousePointer2, Settings, Lock, Unlock, ArrowUp, ArrowDown,
    Film, Loader2, CheckCircle2, AlertCircle, Clapperboard, ListPlus
} from "lucide-react";
import Link from "next/link";
import { renderComposition, type RenderProgress, type RenderElement, type RenderFormat } from "./renderer";
import {
    DndContext,
    useSensor,
    useSensors,
    PointerSensor,
    DragStartEvent,
    DragEndEvent,
    DragMoveEvent,
    useDraggable,
    useDroppable,
    pointerWithin,
    DragOverlay,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";

// --- Types ---
type CollectionType = "text" | "image" | "video" | "audio";

interface CollectionVariant {
    id: string;
    label: string;
    value: string; // text content, URL, etc.
    duration?: number; // Intrinsic media duration in seconds
}

interface CollectionItem {
    id: string;
    title: string;
    type: CollectionType;
    items: CollectionVariant[];
}

// --- Animation Presets ---
type AnimationType =
    | 'fadeIn' | 'fadeOut'
    | 'slideInLeft' | 'slideInRight' | 'slideInTop' | 'slideInBottom'
    | 'slideOutLeft' | 'slideOutRight' | 'slideOutTop' | 'slideOutBottom'
    | 'scaleIn' | 'scaleOut'
    | 'rotateIn' | 'rotateOut'
    | 'bounceIn' | 'blurIn' | 'blurOut';

type EasingType = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | 'spring';

interface ElementAnimation {
    id: string;
    type: AnimationType;
    start: number;       // delay in seconds from element startTime
    duration: number;    // animation duration in seconds
    easing: EasingType;
    from?: number;       // starting value (e.g., scale)
    to?: number;         // ending value (e.g., scale)
}

const ANIMATION_PRESETS: Record<AnimationType, { label: string; category: 'in' | 'out' }> = {
    fadeIn: { label: 'Fade In', category: 'in' },
    fadeOut: { label: 'Fade Out', category: 'out' },
    slideInLeft: { label: 'Slide In Left', category: 'in' },
    slideInRight: { label: 'Slide In Right', category: 'in' },
    slideInTop: { label: 'Slide In Top', category: 'in' },
    slideInBottom: { label: 'Slide In Bottom', category: 'in' },
    slideOutLeft: { label: 'Slide Out Left', category: 'out' },
    slideOutRight: { label: 'Slide Out Right', category: 'out' },
    slideOutTop: { label: 'Slide Out Top', category: 'out' },
    slideOutBottom: { label: 'Slide Out Bottom', category: 'out' },
    scaleIn: { label: 'Scale In', category: 'in' },
    scaleOut: { label: 'Scale Out', category: 'out' },
    rotateIn: { label: 'Rotate In', category: 'in' },
    rotateOut: { label: 'Rotate Out', category: 'out' },
    bounceIn: { label: 'Bounce In', category: 'in' },
    blurIn: { label: 'Blur In', category: 'in' },
    blurOut: { label: 'Blur Out', category: 'out' },
};

export interface TrackConfig {
    id: string;
    magnet: boolean;
}

export interface CanvasElement {
    elementId: string;
    collectionId: string;
    collectionType: CollectionType;
    title: string;
    x: number;
    y: number;
    width: number;
    height: number;
    zIndex: number;
    content?: string;
    startTime: number;
    duration: number;
    trackId?: string;
    rotation?: number;
    opacity?: number;
    aspectRatioLocked?: boolean;
    visible?: boolean;
    fontSize?: number;
    fontWeight?: string;
    fontStyle?: string;
    textDecoration?: string;
    letterSpacing?: number;
    lineHeight?: number;
    textAlign?: 'left' | 'center' | 'right';
    selectedVariantId?: string;
    animations: ElementAnimation[];
    variantOverrides?: Record<string, Partial<CanvasElement>>;
    sourceElementId?: string;
    volume?: number; // Volume from 0 to 1
    mediaOffset?: number; // Offset into source media file (seconds), used after splitting
    syncWith?: { targetId: string; targetEdge: 'start' | 'end'; myEdge: 'start' | 'end'; edge?: 'start' | 'end' } | null;
}

// --- Collection Type Styling ---
const COLLECTION_COLORS: Record<CollectionType, { bg: string; border: string; text: string; icon: string }> = {
    text: { bg: "bg-amber-500/15", border: "border-amber-500/40", text: "text-amber-400", icon: "text-amber-500" },
    image: { bg: "bg-blue-500/15", border: "border-blue-500/40", text: "text-blue-400", icon: "text-blue-500" },
    video: { bg: "bg-purple-500/15", border: "border-purple-500/40", text: "text-purple-400", icon: "text-purple-500" },
    audio: { bg: "bg-emerald-500/15", border: "border-emerald-500/40", text: "text-emerald-400", icon: "text-emerald-500" },
};

const COLLECTION_ICONS: Record<CollectionType, React.ReactNode> = {
    text: <Type className="w-3.5 h-3.5" />,
    image: <ImageIcon className="w-3.5 h-3.5" />,
    video: <MonitorPlay className="w-3.5 h-3.5" />,
    audio: <Music className="w-3.5 h-3.5" />,
};

// --- Seed Collections ---
const SEED_COLLECTIONS: CollectionItem[] = [
    {
        id: "col-hooks", title: "Hook Lines", type: "text",
        items: [
            { id: "v1", label: "Hook A", value: "Stop doing dropshipping like this in 2024..." },
            { id: "v2", label: "Hook B", value: "This product went viral overnight..." },
            { id: "v3", label: "Hook C", value: "Nobody is talking about this strategy..." },
        ],
    },
    {
        id: "col-broll", title: "Product B-Roll", type: "video",
        items: [
            { id: "v4", label: "Close-Up", value: "https://www.w3schools.com/html/mov_bbb.mp4", duration: 10.026 },
            { id: "v5", label: "Lifestyle", value: "https://www.w3schools.com/html/mov_bbb.mp4", duration: 10.026 },
        ],
    },
    {
        id: "col-captions", title: "CTA Overlays", type: "text",
        items: [
            { id: "v6", label: "CTA v1", value: "Link in bio 🔗" },
            { id: "v7", label: "CTA v2", value: "Shop now → tap below" },
        ],
    },
];


// --- Draggable Collection Card ---
function CollectionCard({ collection, onAddItem, onDeleteItem, onUpdateItem, onDeleteCollection }: {
    collection: CollectionItem;
    onAddItem: (collectionId: string, label: string, value: string, duration?: number) => void;
    onDeleteItem: (collectionId: string, variantId: string) => void;
    onUpdateItem: (collectionId: string, variantId: string, newValue: string, duration?: number) => void;
    onDeleteCollection: (collectionId: string) => void;
}) {
    const [isOpen, setIsOpen] = useState(false);
    const [isAdding, setIsAdding] = useState(false);
    const [newLabel, setNewLabel] = useState("");
    const [newValue, setNewValue] = useState("");
    const fileInputRef = useRef<HTMLInputElement>(null);
    const updateFileRef = useRef<HTMLInputElement>(null);
    const [updatingItemId, setUpdatingItemId] = useState<string | null>(null);

    const isMedia = collection.type !== "text";
    const acceptMap: Record<CollectionType, string> = {
        text: "",
        image: "image/*",
        video: "video/*",
        audio: "audio/*",
    };

    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id: `collection-${collection.id}`,
        data: { collection },
    });

    const colors = COLLECTION_COLORS[collection.type];

    const handleFilesSelected = async (files: File[]) => {
        setIsAdding(false);
        setNewLabel("");
        setNewValue("");
        
        files.forEach(file => {
            const tempUrl = URL.createObjectURL(file);
            const label = files.length === 1 && newLabel.trim() 
                ? newLabel.trim() 
                : file.name.replace(/\.[^.]+$/, "");

            const finishUpload = async (duration?: number) => {
                const formData = new FormData();
                formData.append("file", file);
                try {
                    const res = await fetch('/api/upload', { method: 'POST', body: formData });
                    if (!res.ok) throw new Error("Upload failed");
                    const data = await res.json();
                    onAddItem(collection.id, label, data.url, duration);
                } catch (e) {
                    console.error("Upload failed", e);
                    onAddItem(collection.id, label, tempUrl, duration);
                }
            };

            if (file.type.startsWith("video/") || file.type.startsWith("audio/")) {
                const media = document.createElement(file.type.startsWith("video/") ? 'video' : 'audio');
                media.preload = 'metadata';
                media.onloadedmetadata = () => {
                    URL.revokeObjectURL(media.src);
                    finishUpload(media.duration);
                };
                media.onerror = () => {
                    URL.revokeObjectURL(media.src);
                    finishUpload();
                }
                media.src = URL.createObjectURL(file);
            } else {
                finishUpload();
            }
        });
    };

    const handleUpdateFile = async (file: File, itemId: string) => {
        const finishUpdate = async (duration?: number) => {
            const formData = new FormData();
            formData.append("file", file);
            try {
                const res = await fetch('/api/upload', { method: 'POST', body: formData });
                if (!res.ok) throw new Error("Upload failed");
                const data = await res.json();
                onUpdateItem(collection.id, itemId, data.url, duration);
            } catch (e) {
                console.error("Upload failed", e);
                alert("Update failed.");
            }
            setUpdatingItemId(null);
        };

        if (file.type.startsWith("video/") || file.type.startsWith("audio/")) {
            const media = document.createElement(file.type.startsWith("video/") ? 'video' : 'audio');
            media.preload = 'metadata';
            media.onloadedmetadata = () => {
                URL.revokeObjectURL(media.src);
                finishUpdate(media.duration);
            };
            media.onerror = () => {
                URL.revokeObjectURL(media.src);
                finishUpdate();
            };
            media.src = URL.createObjectURL(file);
        } else {
            finishUpdate();
        }
    };

    const handleAdd = () => {
        if (!newLabel.trim() || !newValue.trim()) return;
        onAddItem(collection.id, newLabel.trim(), newValue.trim());
        setNewLabel("");
        setNewValue("");
        setIsAdding(false);
    };

    return (
        <div
            ref={setNodeRef}
            className={cn("rounded-lg border transition-all", colors.bg, colors.border, isDragging && "opacity-40 scale-95")}
        >
            {/* Header — draggable */}
            <div
                {...listeners}
                {...attributes}
                className="flex items-center gap-2 p-3 cursor-grab active:cursor-grabbing select-none touch-none group/colheader"
                onClick={(e) => { e.stopPropagation(); }}
            >
                <span className={cn(colors.icon)}>{COLLECTION_ICONS[collection.type]}</span>
                <span className="text-[11px] font-mono text-gray-200 font-medium flex-1 truncate">{collection.title}</span>
                <span className="text-[9px] font-mono text-gray-500 bg-white/5 px-1.5 py-0.5 rounded">{collection.items.length} items</span>
                <button
                    onClick={(e) => { e.stopPropagation(); e.preventDefault(); onDeleteCollection(collection.id); }}
                    onPointerDown={(e) => e.stopPropagation()}
                    className="opacity-0 group-hover/colheader:opacity-100 text-gray-600 hover:text-red-400 transition-all ml-1"
                    title="Delete Collection"
                >
                    <Trash2 className="w-3.5 h-3.5" />
                </button>
                <button
                    onClick={(e) => { e.stopPropagation(); e.preventDefault(); setIsOpen(!isOpen); }}
                    onPointerDown={(e) => e.stopPropagation()}
                    className="text-gray-500 hover:text-gray-300 transition-colors"
                >
                    <motion.div animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
                        <Plus className={cn("w-3.5 h-3.5 transition-transform", isOpen && "rotate-45")} />
                    </motion.div>
                </button>
            </div>

            {/* Expandable items */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                    >
                        <div className="px-3 pb-3 space-y-1.5 border-t border-white/5 pt-2">
                            {collection.items.map((item) => (
                                <div key={item.id} className="flex items-center gap-2 group">
                                    {/* Thumbnail preview for media items */}
                                    {isMedia && item.value && (
                                        <div className="w-8 h-8 rounded overflow-hidden border border-white/10 shrink-0 bg-black/40">
                                            {collection.type === "image" ? (
                                                <img src={item.value} className="w-full h-full object-cover" alt={item.label} />
                                            ) : collection.type === "video" ? (
                                                <video src={item.value} className="w-full h-full object-cover" muted />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center"><Music className="w-3 h-3 text-gray-500" /></div>
                                            )}
                                        </div>
                                    )}
                                    <div className="flex-1 text-[10px] font-mono text-gray-400 bg-black/30 rounded px-2 py-1.5 truncate min-w-0">
                                        <span className="text-gray-500 mr-1.5">{item.label}</span>
                                        {!isMedia && <span className="text-gray-300">: {item.value}</span>}
                                    </div>
                                    {/* Replace asset button for media */}
                                    {isMedia && (
                                        <button
                                            onClick={() => { setUpdatingItemId(item.id); updateFileRef.current?.click(); }}
                                            className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-blue-400 transition-all"
                                            title="Replace asset"
                                        >
                                            <Upload className="w-3 h-3" />
                                        </button>
                                    )}
                                    <button
                                        onClick={() => onDeleteItem(collection.id, item.id)}
                                        className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 transition-all"
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                </div>
                            ))}

                            {/* Hidden file input for updating existing items */}
                            <input
                                ref={updateFileRef}
                                type="file"
                                accept={acceptMap[collection.type]}
                                className="hidden"
                                onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file && updatingItemId) handleUpdateFile(file, updatingItemId);
                                    e.target.value = "";
                                }}
                            />

                            {/* Add Item Form */}
                            {isAdding ? (
                                <div className="space-y-1.5 pt-1">
                                    <input
                                        value={newLabel}
                                        onChange={(e) => setNewLabel(e.target.value)}
                                        placeholder="Label (e.g. Hook A)"
                                        className="w-full text-[10px] font-mono bg-black/40 border border-white/10 rounded px-2 py-1.5 text-gray-300 placeholder:text-gray-600 outline-none focus:border-white/20"
                                        onPointerDown={(e) => e.stopPropagation()}
                                    />
                                    {isMedia ? (
                                        <>
                                            <input
                                                ref={fileInputRef}
                                                type="file"
                                                multiple
                                                accept={acceptMap[collection.type]}
                                                className="hidden"
                                                onChange={(e) => {
                                                    const files = Array.from(e.target.files || []);
                                                    if (files.length > 0) handleFilesSelected(files);
                                                    e.target.value = "";
                                                }}
                                            />
                                            <button
                                                onClick={() => fileInputRef.current?.click()}
                                                onPointerDown={(e) => e.stopPropagation()}
                                                className={cn(
                                                    "w-full flex items-center justify-center gap-2 py-3 rounded border border-dashed transition-colors",
                                                    colors.border, "text-gray-400 hover:text-gray-200 hover:bg-white/5"
                                                )}
                                            >
                                                <Upload className="w-3.5 h-3.5" />
                                                <span className="text-[9px] font-mono">Choose {collection.type} file(s)</span>
                                            </button>
                                        </>
                                    ) : (
                                        <input
                                            value={newValue}
                                            onChange={(e) => setNewValue(e.target.value)}
                                            placeholder="Text content..."
                                            className="w-full text-[10px] font-mono bg-black/40 border border-white/10 rounded px-2 py-1.5 text-gray-300 placeholder:text-gray-600 outline-none focus:border-white/20"
                                            onPointerDown={(e) => e.stopPropagation()}
                                            onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
                                        />
                                    )}
                                    <div className="flex gap-1.5">
                                        {!isMedia && <button onClick={handleAdd} className="flex-1 text-[9px] font-mono py-1 bg-white/10 hover:bg-white/20 text-gray-300 rounded transition-colors">Add</button>}
                                        <button onClick={() => { setIsAdding(false); setNewLabel(""); setNewValue(""); }} className="flex-1 text-[9px] font-mono py-1 bg-white/5 hover:bg-white/10 text-gray-500 rounded transition-colors">Cancel</button>
                                    </div>
                                </div>
                            ) : (
                                <button
                                    onClick={() => setIsAdding(true)}
                                    className="w-full text-[9px] font-mono py-1.5 text-gray-500 hover:text-gray-300 border border-dashed border-white/10 hover:border-white/20 rounded transition-colors"
                                >
                                    + Add Item
                                </button>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

// --- Memoized Timeline Waveform ---
const TimelineWaveform = React.memo(function TimelineWaveform({ elementId, collectionType, segPxWidth }: { elementId: string; collectionType: string; segPxWidth: number }) {
    const barSpacing = 4;
    const barCount = Math.max(1, Math.floor(segPxWidth / barSpacing));
    const color = collectionType === 'audio' ? '#34d399' : '#a78bfa';
    return (
        <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-40 z-0">
            <svg width={segPxWidth} height="100%" style={{ display: 'block' }} preserveAspectRatio="none">
                {Array.from({ length: barCount }, (_, i) => {
                    const seed = (elementId.charCodeAt(i % elementId.length) * 31 + i * 7 + (i * 13) % 97) % 100;
                    const h = 20 + (seed / 100) * 60;
                    const barW = Math.max(1, barSpacing - 1);
                    return (
                        <rect
                            key={i}
                            x={i * barSpacing}
                            y={`${(100 - h) / 2}%`}
                            width={barW}
                            height={`${h}%`}
                            fill={color}
                            rx="0.5"
                        />
                    );
                })}
            </svg>
        </div>
    );
});

// --- Canvas Layer ---
function CanvasLayer({ el, isSelected, collections, currentTime, onClick, onActionStart }: { el: CanvasElement; isSelected: boolean; collections: CollectionItem[]; currentTime: number; onClick: () => void; onActionStart: (action: string, e: React.PointerEvent) => void }) {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: `canvas-${el.elementId}`,
        data: { element: el },
    });

    const colors = COLLECTION_COLORS[el.collectionType];
    const collection = collections.find(c => c.id === el.collectionId);
    const itemCount = collection?.items.length ?? 0;

    const isTimeActive = currentTime >= el.startTime && currentTime < el.startTime + el.duration;
    const isVisibleToggle = el.visible !== false;

    let displayOpacity = el.opacity ?? 1;
    let pointerBehavior = 'auto';

    if (!isTimeActive) {
        displayOpacity = 0;
        pointerBehavior = 'none';
    } else if (!isVisibleToggle) {
        displayOpacity = 0.3;
        // Still allow selection/moving when locally toggled off but time-active
    }

    const style: React.CSSProperties = {
        position: 'absolute',
        left: `${el.x}%`,
        top: `${el.y}%`,
        width: `${el.width}%`,
        height: `${el.height}%`,
        zIndex: el.zIndex,
        opacity: displayOpacity,
        pointerEvents: pointerBehavior as React.CSSProperties['pointerEvents'],
        transform: `${transform ? CSS.Translate.toString(transform) : ''} rotate(${el.rotation || 0}deg)`,
    };

    return (
        <div
            id={`canvas-${el.elementId}`}
            ref={setNodeRef}
            style={style}
            onClick={(e) => { e.stopPropagation(); onClick(); }}
            {...listeners}
            {...attributes}
            className={cn(
                "cursor-grab active:cursor-grabbing border-2 rounded overflow-hidden flex items-center justify-center touch-none select-none",
                isSelected ? "border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.4)] ring-1 ring-blue-500/30" : "border-transparent hover:border-white/30",
                isDragging ? "opacity-60 z-[100] transition-none" : "transition-colors duration-200",
                colors.bg
            )}
        >
            {el.collectionType === 'text' ? (() => {
                const col = collections.find(c => c.id === el.collectionId);
                const sv = el.selectedVariantId ? col?.items.find(v => v.id === el.selectedVariantId) : null;
                if (sv) {
                    return <span className="text-white text-base drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] px-2 pointer-events-none w-full" style={{ fontSize: el.fontSize ? `${el.fontSize}px` : undefined, fontWeight: el.fontWeight || 'bold', fontStyle: el.fontStyle || 'normal', textDecoration: el.textDecoration || 'none', letterSpacing: el.letterSpacing ? `${el.letterSpacing}px` : undefined, lineHeight: el.lineHeight ? el.lineHeight : undefined, textAlign: el.textAlign || 'center', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{sv.value}</span>;
                }
                return (
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <span className={cn("opacity-60", colors.icon)}>{COLLECTION_ICONS[el.collectionType]}</span>
                        <span className="text-[8px] uppercase font-mono mt-1 tracking-widest text-gray-400">{el.title}</span>
                        <span className="text-[7px] font-mono text-gray-500 mt-0.5">{itemCount > 0 ? `⟳ ${itemCount} variants` : 'No variants'}</span>
                    </div>
                );
            })() : (
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className={cn("opacity-60", colors.icon)}>{COLLECTION_ICONS[el.collectionType]}</span>
                    <span className="text-[8px] uppercase font-mono mt-1 tracking-widest text-gray-400">{el.title}</span>
                    <span className="text-[7px] font-mono text-gray-500 mt-0.5">⟳ Random from {itemCount}</span>
                </div>
            )}
            {isSelected && (
                <>
                    {/* Resize Handles */}
                    <div className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-white border border-blue-500 cursor-nwse-resize drop-shadow-md hover:scale-125 transition-transform" onPointerDown={(e) => { e.stopPropagation(); onActionStart('resize-nw', e); }} />
                    <div className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-white border border-blue-500 cursor-nesw-resize drop-shadow-md hover:scale-125 transition-transform" onPointerDown={(e) => { e.stopPropagation(); onActionStart('resize-ne', e); }} />
                    <div className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-white border border-blue-500 cursor-nesw-resize drop-shadow-md hover:scale-125 transition-transform" onPointerDown={(e) => { e.stopPropagation(); onActionStart('resize-sw', e); }} />
                    <div className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-white border border-blue-500 cursor-nwse-resize drop-shadow-md hover:scale-125 transition-transform" onPointerDown={(e) => { e.stopPropagation(); onActionStart('resize-se', e); }} />
                </>
            )}
        </div>
    );
}


// --- Time Formatter ---
function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toFixed(1).padStart(4, '0')}`;
}

// --- Animation Evaluation ---
function applyEasing(t: number, easing: EasingType): number {
    t = Math.max(0, Math.min(1, t));
    switch (easing) {
        case 'linear': return t;
        case 'easeIn': return t * t * t;
        case 'easeOut': return 1 - Math.pow(1 - t, 3);
        case 'easeInOut': return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        case 'spring': {
            const w = 8; const d = 0.4;
            return 1 - Math.exp(-d * w * t) * Math.cos(w * Math.sqrt(1 - d * d) * t);
        }
        default: return t;
    }
}

type AnimatedStyle = { opacity: number; translateX: number; translateY: number; scale: number; rotate: number; blur: number };

function evaluateAnimations(el: CanvasElement, currentTime: number): AnimatedStyle {
    const result: AnimatedStyle = { opacity: el.opacity ?? 1, translateX: 0, translateY: 0, scale: 1, rotate: 0, blur: 0 };
    const localTime = currentTime - el.startTime;

    for (const anim of (el.animations || [])) {
        const animStart = anim.start;
        const animEnd = anim.start + anim.duration;
        if (localTime < animStart || localTime > animEnd) {
            // Check if we're before an "in" animation — show initial state
            const preset = ANIMATION_PRESETS[anim.type];
            if (preset.category === 'in' && localTime < animStart) {
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
            if (preset.category === 'in' && localTime > animEnd) {
                switch (anim.type) {
                    case 'scaleIn': result.scale = anim.to ?? 1; break;
                    case 'bounceIn': result.scale = anim.to ?? 1; break;
                }
            }
            if (preset.category === 'out' && localTime < animStart) {
                switch (anim.type) {
                    case 'scaleOut': result.scale = anim.from ?? 1; break;
                }
            }
            // After an "out" animation — show final state
            if (preset.category === 'out' && localTime > animEnd) {
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
        const rawT = (localTime - animStart) / (anim.duration || 0.01);
        const t = applyEasing(rawT, anim.easing);

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
                const startScale = anim.from ?? 0;
                const endScale = anim.to ?? 1;
                result.scale = startScale + (endScale - startScale) * t;
                break;
            }
            case 'scaleOut': {
                const startScale = anim.from ?? 1;
                const endScale = anim.to ?? 0;
                result.scale = startScale + (endScale - startScale) * t;
                break;
            }
            case 'rotateIn': result.rotate = -180 * (1 - t); break;
            case 'rotateOut': result.rotate = 180 * t; break;
            case 'bounceIn': {
                const startScale = anim.from ?? 0;
                const endScale = anim.to ?? 1;
                const springT = applyEasing(rawT, 'spring');
                result.scale = startScale + (endScale - startScale) * springT;
                break;
            }
            case 'blurIn': result.blur = 10 * (1 - t); result.opacity *= t; break;
            case 'blurOut': result.blur = 10 * t; result.opacity *= (1 - t); break;
        }
    }
    return result;
}

export function resolveElementTimings(
    elements: CanvasElement[],
    tracks: TrackConfig[],
    collections: CollectionItem[],
    getVariantMode: (elId: string) => string
): Map<string, { startTime: number, duration: number }> {
    const timings = new Map<string, { startTime: number, duration: number }>();

    // First pass: calculate base duration and intrinsic startTime for each element
    const initialTimings = elements.map(el => {
        const varMode = getVariantMode(el.elementId);
        const baseTime = el.startTime;
        let baseDur = el.duration;
        const isMedia = el.collectionType === 'video' || el.collectionType === 'audio';

        if (isMedia) {
            // Default to underlying variant native duration if not overridden
            if (varMode !== 'all') {
                const col = collections.find(c => c.id === el.collectionId);
                const variant = col?.items.find(v => v.id === varMode);
                if (variant && variant.duration !== undefined) {
                    baseDur = variant.duration;
                }
            } else {
                const col = collections.find(c => c.id === el.collectionId);
                if (col && col.items.length > 0) {
                    let maxDur = baseDur;
                    for (const v of col.items) {
                        if (v.duration !== undefined && v.duration > maxDur) maxDur = v.duration;
                    }
                    baseDur = maxDur;
                }
            }

            // User overrides take precedence
            if (el.variantOverrides) {
                if (varMode !== 'all' && el.variantOverrides[varMode]) {
                    if (el.variantOverrides[varMode].duration !== undefined) baseDur = el.variantOverrides[varMode].duration!;
                } else if (varMode === 'all') {
                    let maxDur = baseDur;
                    for (const override of Object.values(el.variantOverrides)) {
                        if (override.duration !== undefined && override.duration > maxDur) maxDur = override.duration;
                    }
                    baseDur = maxDur;
                }
            }
        }
        return { el, startTime: baseTime, duration: baseDur };
    });

    // Group elements by track
    const tracksMap = new Map<string, typeof initialTimings>();
    for (const item of initialTimings) {
        const tid = item.el.trackId || 'track-0';
        if (!tracksMap.has(tid)) tracksMap.set(tid, []);
        tracksMap.get(tid)!.push(item);
    }

    // Process per track
    for (const [tid, items] of tracksMap.entries()) {
        const trackConfig = tracks.find(t => t.id === tid);
        
        if (trackConfig?.magnet) {
            // MAGNET ON: Sort by intrinsic startTime, then stack left-to-right
            items.sort((a, b) => a.startTime - b.startTime);
            const anchor = items.length > 0 ? items[0].startTime : 0;
            let cursor = anchor;
            
            for (const item of items) {
                timings.set(item.el.elementId, { startTime: Math.round(cursor * 100) / 100, duration: item.duration });
                cursor += item.duration;
            }
        } else {
            // MAGNET OFF: Elements stay at their intrinsic times, but push each other if they would overlap
            items.sort((a, b) => a.startTime - b.startTime);
            let cursor = 0;
            for (const item of items) {
                const effectiveStart = Math.max(item.startTime, cursor);
                timings.set(item.el.elementId, { startTime: Math.round(effectiveStart * 100) / 100, duration: item.duration });
                cursor = effectiveStart + item.duration;
            }
        }
    }

    return timings;
}

// Helper to safely get the media duration bound for an element, respecting variant overrides
function getMediaDurationLimit(el: CanvasElement, variantMode: string, collections: CollectionItem[], fallbackDuration: number) {
    const col = collections.find(c => c.id === el.collectionId);
    if (!col || (col.type !== 'video' && col.type !== 'audio')) return fallbackDuration;

    if (variantMode !== 'all') {
        const variant = col.items.find(i => i.id === variantMode);
        return variant?.duration || fallbackDuration;
    } else {
        // In "all" mode, return the maximum duration among all items so user can extend up to that max
        let maxDur = 0;
        let hasDurations = false;
        for (const item of col.items) {
            if (item.duration) {
                maxDur = Math.max(maxDur, item.duration);
                hasDurations = true;
            }
        }
        return hasDurations ? maxDur : fallbackDuration;
    }
}

// --- Main Builder (inner, only rendered on client) ---
function BuilderInner({ compositionId }: { compositionId?: string }) {
    const [elements, setElements] = useState<CanvasElement[]>([]);
    const [tracks, setTracks] = useState<TrackConfig[]>([{ id: 'track-0', magnet: false }]);
    const [collections, setCollections] = useState<CollectionItem[]>(SEED_COLLECTIONS);
    const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
    const [centerView, setCenterView] = useState<"canvas" | "preview">("canvas");
    const [inspectorVariantModes, setInspectorVariantModes] = useState<Record<string, string>>({}); // elementId -> "all" | variantId
    const [inspectorLocked, setInspectorLocked] = useState(false);
    const [saving, setSaving] = useState(false);
    const [fetching, setFetching] = useState(false);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

    const showToast = (message: string, type: 'success' | 'error') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    };

    // --- Export / Render state ---
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [renderProgress, setRenderProgress] = useState<RenderProgress | null>(null);
    const renderAbortRef = useRef<AbortController | null>(null);
    const [renderQueue, setRenderQueue] = useState<{ id: string; name: string; job: RenderJob; usedVariantIds: string[] }[]>([]);
    const renderQueueRef = useRef(renderQueue);
    renderQueueRef.current = renderQueue;
    const [exportSettings, setExportSettings] = useState({
        resolution: '1080x1920' as '1080x1920' | '720x1280' | '540x960',
        fps: 30 as 24 | 30 | 60,
        bitrate: 8 as 4 | 8 | 16,
        format: 'mp4' as RenderFormat,
    });

    // Helper: get the variant mode for an element, auto-selecting single variants
    const getVariantMode = useCallback((elementId: string): string => {
        const mode = inspectorVariantModes[elementId] || 'all';
        if (mode === 'all') {
            // For single-variant collections, auto-select the only variant
            const el = elements.find(e => e.elementId === elementId);
            if (el) {
                const col = collections.find(c => c.id === el.collectionId);
                if (col?.items.length === 1) return col.items[0].id;
            }
        }
        return mode;
    }, [inspectorVariantModes, elements, collections]);

    // Ref to always access latest getVariantMode without re-running effects
    const getVariantModeRef = useRef(getVariantMode);
    getVariantModeRef.current = getVariantMode;

    // Set variant mode for the currently selected element
    const setVariantMode = useCallback((elementId: string, mode: string) => {
        setInspectorVariantModes(prev => ({ ...prev, [elementId]: mode }));
    }, []);

    useEffect(() => {
        if (compositionId) {
            setFetching(true);
            fetch(`/api/compositions/${compositionId}`)
                .then(res => res.json())
                .then(data => {
                    if (data.elements) {
                        try { setElements(typeof data.elements === 'string' ? JSON.parse(data.elements) : data.elements); } catch (e) { }
                    }
                    if (data.tracks) {
                        try { 
                            const parsedTracks = typeof data.tracks === 'string' ? JSON.parse(data.tracks) : data.tracks; 
                            if (parsedTracks && parsedTracks.length > 0) setTracks(parsedTracks);
                        } catch (e) { }
                    }
                    if (data.collections?.length) {
                        try {
                            const parsedCols = typeof data.collections === 'string' ? JSON.parse(data.collections) : data.collections;
                            if (parsedCols.length > 0) setCollections(parsedCols);
                        } catch (e) { }
                    }
                    if (data.duration) {
                        setTOTAL_DURATION(data.duration);
                    }
                })
                .catch(err => console.error("Failed to fetch composition", err))
                .finally(() => setFetching(false));
        }
    }, [compositionId]);

    // New Collection form
    const [isCreatingCollection, setIsCreatingCollection] = useState(false);
    const [newCollectionTitle, setNewCollectionTitle] = useState("");
    const [newCollectionType, setNewCollectionType] = useState<CollectionType>("text");

    // Drag state for overlay
    const [activeCollection, setActiveCollection] = useState<CollectionItem | null>(null);
    const [activeDragElement, setActiveDragElement] = useState<CanvasElement | null>(null);
    const [activeDragDelta, setActiveDragDelta] = useState<{ x: number, y: number } | null>(null);

    // Timeline state
    const [isTimelineOpen, setIsTimelineOpen] = useState(true);

    // Canvas Snap Guides
    const [snapGuides, setSnapGuides] = useState<{ vertical: boolean, horizontal: boolean }>({ vertical: false, horizontal: false });

    // Timeline Snap Lines (time values in seconds where snap lines should appear)
    const [timelineSnapLines, setTimelineSnapLines] = useState<number[]>([]);

    // Timeline Tools
    const [timelineTool, setTimelineTool] = useState<'pointer' | 'split'>('pointer');
    const [splitHoverPosition, setSplitHoverPosition] = useState<{ elementId: string, time: number, relativePx: number } | null>(null);

    // --- Playback Engine State ---
    const [TOTAL_DURATION, setTOTAL_DURATION] = useState(120);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [previewLoop, setPreviewLoop] = useState(false);
    const [variantSeed, setVariantSeed] = useState(1);
    const lastFrameRef = useRef<number>(0);
    const playbackRafRef = useRef<number | null>(null);

    // Simple deterministic hash function for strings
    const hashString = (str: string) => {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return Math.abs(hash);
    };

    function mulberry32(a: number) {
        return function() {
            var t = a += 0x6D2B79F5;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        }
    }

    const [variantUsage, setVariantUsage] = useState<Record<string, number>>(() => {
        if (typeof window !== 'undefined') {
            try { return JSON.parse(localStorage.getItem('dropai_variant_usage') || '{}'); } catch(e) {}
        }
        return {};
    });

    const recordVariantUsage = useCallback((usedVariantIds: string[]) => {
        setVariantUsage(prev => {
            const next = { ...prev };
            for (const id of usedVariantIds) {
                next[id] = (next[id] || 0) + 1;
            }
            if (typeof window !== 'undefined') {
                localStorage.setItem('dropai_variant_usage', JSON.stringify(next));
            }
            return next;
        });
    }, []);

    const previewVariants = useMemo(() => {
        const variants: Record<string, CollectionVariant | null> = {};
        
        // Calculate usage from currently queued items to apply bias even before rendering starts
        const queueUsages = renderQueueRef.current.reduce((acc, curr) => {
            if (curr.usedVariantIds) {
                curr.usedVariantIds.forEach(id => {
                    acc[id] = (acc[id] || 0) + 1;
                });
            }
            return acc;
        }, {} as Record<string, number>);

        elements.forEach(el => {
            const col = collections.find(c => c.id === el.collectionId);
            if (col && col.items.length > 0) {
                // Combine global seed with element-specific ID so each element gets a stable but unique pseudorandom index
                // We use sourceElementId to keep variant persistent across splits
                const srcId = el.sourceElementId || el.elementId;
                const seededHash = hashString(`${variantSeed}-${srcId}`);
                
                const random = mulberry32(seededHash);
                
                // Calculate weights: rendered assets AND queued assets get a negative bias
                const weights = col.items.map(v => {
                    const usage = (variantUsage[v.id] || 0) + (queueUsages[v.id] || 0);
                    return 100 / Math.pow(10, usage); // Huge penalty per queue/render
                });
                
                const totalWeight = weights.reduce((a, b) => a + b, 0);
                let rand = random() * totalWeight;
                let index = 0;
                for (let i = 0; i < weights.length; i++) {
                    rand -= weights[i];
                    if (rand <= 0) {
                        index = i;
                        break;
                    }
                }
                variants[el.elementId] = col.items[index];
            } else {
                variants[el.elementId] = null;
            }
        });
        return variants;
    }, [elements, collections, variantSeed, variantUsage]);

    const activeVariantModes = useMemo(() => {
        const modes: Record<string, string> = {};
        for (const el of elements) {
            const userMode = getVariantMode(el.elementId);
            modes[el.elementId] = userMode === 'all'
                ? (previewVariants[el.elementId]?.id || 'all')
                : userMode;
        }
        return modes;
    }, [elements, previewVariants, getVariantMode]);

    const elementTimings = useMemo(() => {
        return resolveElementTimings(elements, tracks, collections, elId => activeVariantModes[elId] || 'all');
    }, [elements, tracks, collections, activeVariantModes]);

    const randomizeVariants = useCallback(() => {
        setVariantSeed(s => s + 1);
    }, []);

    const handleSplit = useCallback((elementId: string, splitTime: number) => {
        setElements(prev => {
            const elIndex = prev.findIndex(el => el.elementId === elementId);
            if (elIndex === -1) return prev;

            const el = prev[elIndex];
            const isMedia = el.collectionType === 'video' || el.collectionType === 'audio';

            // For media with per-variant timing, use effective timing for boundary check
            let effStart = el.startTime;
            let effDur = el.duration;
            if (isMedia && el.variantOverrides) {
                const firstVid = Object.keys(el.variantOverrides)[0];
                if (firstVid) {
                    effStart = el.variantOverrides[firstVid]?.startTime ?? el.startTime;
                    effDur = el.variantOverrides[firstVid]?.duration ?? el.duration;
                }
            }

            // Don't split if too close to the edges
            if (splitTime <= effStart + 0.1 || splitTime >= effStart + effDur - 0.1) {
                return prev;
            }

            // Maintain heritage for randomizer
            const srcId = el.sourceElementId || el.elementId;

            if (isMedia && el.variantOverrides && Object.keys(el.variantOverrides).length > 0) {
                // Split each variant's timing independently
                const firstOverrides: Record<string, Partial<CanvasElement>> = {};
                const secondOverrides: Record<string, Partial<CanvasElement>> = {};

                for (const [vid, override] of Object.entries(el.variantOverrides)) {
                    const vStart = override.startTime ?? el.startTime;
                    const vDur = override.duration ?? el.duration;
                    const splitOffset = splitTime - vStart;

                    if (splitOffset <= 0.1) {
                        // Split point is before this variant's start — entire variant goes to second half
                        secondOverrides[vid] = { ...override };
                    } else if (splitOffset >= vDur - 0.1) {
                        // Split point is after this variant's end — entire variant goes to first half
                        firstOverrides[vid] = { ...override };
                    } else {
                        // Normal split within this variant
                        firstOverrides[vid] = { ...override, startTime: vStart, duration: Math.round(splitOffset * 10) / 10 };
                        const existingOffset = (override as any).mediaOffset ?? (el.mediaOffset ?? 0);
                        secondOverrides[vid] = { ...override, startTime: Math.round(splitTime * 10) / 10, duration: Math.round((vDur - splitOffset) * 10) / 10, mediaOffset: Math.round((existingOffset + splitOffset) * 10) / 10 };
                    }
                }

                const baseSplitOffset = splitTime - el.startTime;
                const firstHalf: CanvasElement = {
                    ...el,
                    duration: Math.round(baseSplitOffset * 10) / 10,
                    sourceElementId: srcId,
                    variantOverrides: firstOverrides,
                };
                const secondHalf: CanvasElement = {
                    ...el,
                    elementId: `el-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    sourceElementId: srcId,
                    startTime: Math.round(splitTime * 10) / 10,
                    duration: Math.round((el.duration - baseSplitOffset) * 10) / 10,
                    mediaOffset: Math.round(((el.mediaOffset ?? 0) + baseSplitOffset) * 10) / 10,
                    variantOverrides: secondOverrides,
                };

                const next = [...prev];
                next.splice(elIndex, 1, firstHalf, secondHalf);
                return next;
            } else {
                // Non-media or no overrides — simple split
                const splitOffset = splitTime - el.startTime;
                const firstHalf = { ...el, duration: Math.round(splitOffset * 10) / 10, sourceElementId: srcId };
                const isMediaSimple = el.collectionType === 'video' || el.collectionType === 'audio';
                const secondHalf = {
                    ...el,
                    elementId: `el-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    sourceElementId: srcId,
                    startTime: Math.round(splitTime * 10) / 10,
                    duration: Math.round((el.duration - splitOffset) * 10) / 10,
                    ...(isMediaSimple ? { mediaOffset: Math.round(((el.mediaOffset ?? 0) + splitOffset) * 10) / 10 } : {}),
                };

                const next = [...prev];
                next.splice(elIndex, 1, firstHalf, secondHalf);
                return next;
            }
        });
        setSplitHoverPosition(null);
    }, []);

    // rAF playback loop
    useEffect(() => {
        if (!isPlaying) {
            if (playbackRafRef.current) cancelAnimationFrame(playbackRafRef.current);
            return;
        }
        lastFrameRef.current = performance.now();
        const tick = (now: number) => {
            const dt = (now - lastFrameRef.current) / 1000;
            lastFrameRef.current = now;
            setCurrentTime(prev => {
                const next = prev + dt;
                if (next >= TOTAL_DURATION) return 0; // loop
                return next;
            });
            playbackRafRef.current = requestAnimationFrame(tick);
        };
        playbackRafRef.current = requestAnimationFrame(tick);
        return () => { if (playbackRafRef.current) cancelAnimationFrame(playbackRafRef.current); };
    }, [isPlaying]);

    const handlePlayPause = () => {
        if (!isPlaying) {
            // If at the end, restart
            if (currentTime >= TOTAL_DURATION - 0.1) setCurrentTime(0);
        }
        setIsPlaying(!isPlaying);
    };

    const applyToElement = (el: CanvasElement, updates: Partial<CanvasElement>, variantMode: string): CanvasElement => {
        const isMedia = el.collectionType === 'video' || el.collectionType === 'audio';

        if (variantMode === 'all') {
            const isUpdatingStart = 'startTime' in updates;

            if (isMedia && el.variantOverrides) {
                const preservedOverrides: Record<string, Partial<CanvasElement>> = {};
                for (const [vid, overrides] of Object.entries(el.variantOverrides)) {
                    const timingOnly: Partial<CanvasElement> = {};
                    if (!isUpdatingStart && overrides.startTime !== undefined) timingOnly.startTime = overrides.startTime;
                    if (overrides.duration !== undefined) timingOnly.duration = overrides.duration;
                    if ((overrides as any).mediaOffset !== undefined) (timingOnly as any).mediaOffset = (overrides as any).mediaOffset;
                    if (Object.keys(timingOnly).length > 0) preservedOverrides[vid] = timingOnly;
                }
                const newEl = { ...el, ...updates, variantOverrides: preservedOverrides };
                return newEl;
            }
            const newEl = { ...el, ...updates, variantOverrides: {} };
            return newEl;
        } else if (isMedia) {
            // For media elements with a specific variant, store timing in overrides
            const existing = el.variantOverrides?.[variantMode] || {};
            return {
                ...el,
                variantOverrides: {
                    ...el.variantOverrides,
                    [variantMode]: { ...existing, ...updates },
                },
            };
        } else {
            // For non-media elements (image, text), always apply to base element
            // Variant overrides only matter for media timing; non-media props live on base
            return { ...el, ...updates };
        }
    };

    // Resize & Rotate state
    const [actionState, setActionState] = useState<{
        type: string | null;
        startX: number;
        startY: number;
        initial: CanvasElement | null;
    }>({ type: null, startX: 0, startY: 0, initial: null });

    const canvasRef = useRef<HTMLDivElement>(null);

    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 3 } }));
    const { setNodeRef: setDropRef, isOver: isOverCanvas } = useDroppable({ id: "main-canvas" });

    // Merge canvasRef with droppable ref
    const setCanvasRefs = (node: HTMLDivElement | null) => {
        setDropRef(node);
        (canvasRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
    };

    // Custom Interaction Logic (Resize / Rotate)
    const handleActionStart = (type: string, e: React.PointerEvent) => {
        // Only left click
        if (e.button !== 0) return;
        const baseEl = elements.find(el => el.elementId === selectedElementId);
        if (!baseEl) return;

        const curMode = selectedElementId ? getVariantMode(selectedElementId) : 'all';
        const el = curMode !== 'all' ? getEffectiveElement(baseEl, curMode) : baseEl;

        // Disable body scroll/selection during drag
        document.body.style.userSelect = 'none';

        setActionState({
            type,
            startX: e.clientX,
            startY: e.clientY,
            initial: { ...el }
        });
    };

    const activeAnimationFrame = useRef<number | null>(null);

    useEffect(() => {
        const handlePointerMove = (e: PointerEvent) => {
            const type = actionState.type;
            const rect = canvasRef.current?.getBoundingClientRect();
            if (!type || !actionState.initial || !rect) return;

            const deltaX = e.clientX - actionState.startX;
            const deltaY = e.clientY - actionState.startY;

            const deltaXPct = (deltaX / rect.width) * 100;
            const deltaYPct = (deltaY / rect.height) * 100;

            const updates: Partial<CanvasElement> = {};
            const initial = actionState.initial;

            if (type === 'rotate') {
                const elRect = document.getElementById(`canvas-${selectedElementId}`)?.getBoundingClientRect();
                if (elRect) {
                    const cx = elRect.left + elRect.width / 2;
                    const cy = elRect.top + elRect.height / 2;
                    const rad = Math.atan2(e.clientY - cy, e.clientX - cx);
                    // atan2 is 0 pointing to right. Up is -PI/2.
                    let angle = (rad * 180 / Math.PI) + 90;
                    if (angle > 180) angle -= 360;
                    updates.rotation = Math.round(angle);
                }
            } else if (type.startsWith('resize')) {
                // To safely resize a rotated rectangle:
                // 1. Find the center of the element in un-rotated space.
                // 2. We keep the opposite corner fixed.
                // 3. We move the acting corner to the mouse position.
                // For simplicity and to avoid runaway math loops on unconstrained aspect ratios,
                // we will map the raw mouse delta to local delta by projecting the mouse movement vector
                // onto the element's local rotated X and Y axes.

                // --- Fix: Do ALL math in screen pixels to avoid aspect ratio skewing! ---
                const angleRad = (initial.rotation || 0) * (Math.PI / 180);
                const cosA = Math.cos(angleRad);
                const sinA = Math.sin(angleRad);

                // Initial dimensions & center in pixels relative to canvas
                const wPx = (initial.width / 100) * rect.width;
                const hPx = (initial.height / 100) * rect.height;
                const cxPx = (initial.x / 100) * rect.width + wPx / 2;
                const cyPx = (initial.y / 100) * rect.height + hPx / 2;

                // Mouse delta projected to element's rotated local axes
                const localDx = deltaX * cosA + deltaY * sinA;
                const localDy = -deltaX * sinA + deltaY * cosA;

                let newWPx = wPx;
                let newHPx = hPx;

                // Which corner is fixed relative to center?
                let fixedLocalX = 0;
                let fixedLocalY = 0;

                if (type.includes('e')) { newWPx = wPx + localDx; fixedLocalX = -wPx / 2; }
                if (type.includes('w')) { newWPx = wPx - localDx; fixedLocalX = wPx / 2; }
                if (type.includes('s')) { newHPx = hPx + localDy; fixedLocalY = -hPx / 2; }
                if (type.includes('n')) { newHPx = hPx - localDy; fixedLocalY = hPx / 2; }

                if (initial.aspectRatioLocked) {
                    const aspect = wPx / hPx;

                    if (type === 'resize-e' || type === 'resize-w') {
                        newHPx = newWPx / aspect;
                    } else if (type === 'resize-n' || type === 'resize-s') {
                        newWPx = newHPx * aspect;
                    } else {
                        // Project the mouse drag vector smoothly onto the aspect ratio diagonal
                        const scale = (newWPx * wPx + newHPx * hPx) / (wPx * wPx + hPx * hPx);
                        newWPx = wPx * scale;
                        newHPx = hPx * scale;
                    }

                    // Enforce minimum size limits proportionally
                    if (newWPx < 10 || newHPx < 10) {
                        if (aspect > 1) {
                            newHPx = 10;
                            newWPx = 10 * aspect;
                        } else {
                            newWPx = 10;
                            newHPx = 10 / aspect;
                        }
                    }
                } else {
                    newWPx = Math.max(10, newWPx);
                    newHPx = Math.max(10, newHPx);
                }

                // Absolute screen position of the fixed corner (must not move!)
                const fixedScreenX = cxPx + fixedLocalX * cosA - fixedLocalY * sinA;
                const fixedScreenY = cyPx + fixedLocalX * sinA + fixedLocalY * cosA;

                // Where is the fixed corner in the NEW local coordinate space?
                const newFixedLocalX = fixedLocalX < 0 ? -newWPx / 2 : (fixedLocalX > 0 ? newWPx / 2 : 0);
                const newFixedLocalY = fixedLocalY < 0 ? -newHPx / 2 : (fixedLocalY > 0 ? newHPx / 2 : 0);

                // Reconstruct the new center in screen space
                const newCxPx = fixedScreenX - (newFixedLocalX * cosA - newFixedLocalY * sinA);
                const newCyPx = fixedScreenY - (newFixedLocalX * sinA + newFixedLocalY * cosA);

                // Convert back to percentages correctly
                updates.width = (newWPx / rect.width) * 100;
                updates.height = (newHPx / rect.height) * 100;
                updates.x = ((newCxPx - newWPx / 2) / rect.width) * 100;
                updates.y = ((newCyPx - newHPx / 2) / rect.height) * 100;
            }

            // Sync fast state updates via requestAnimationFrame to avoid 1000Hz polling lag
            if (activeAnimationFrame.current) {
                cancelAnimationFrame(activeAnimationFrame.current);
            }
            activeAnimationFrame.current = requestAnimationFrame(() => {
                setElements(prev => prev.map(el => el.elementId === selectedElementId ? applyToElement(el, updates, selectedElementId ? getVariantModeRef.current(selectedElementId) : 'all') : el));
                activeAnimationFrame.current = null;
            });
        };

        const handlePointerUp = () => {
            document.body.style.userSelect = '';
            setActionState({ type: null, startX: 0, startY: 0, initial: null });
        };

        window.addEventListener('pointermove', handlePointerMove);
        window.addEventListener('pointerup', handlePointerUp);
        return () => {
            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('pointerup', handlePointerUp);
        };
    }, [actionState, selectedElementId]);


    // Helper: check if the pointer ended up over the canvas area
    const isPointerOverCanvas = (event: DragEndEvent): boolean => {
        // Direct hit on the droppable
        if (event.over?.id === "main-canvas") return true;
        // Over an existing canvas element (still means we're on the canvas)
        if (event.over && String(event.over.id).startsWith("canvas-")) return true;
        // Fallback: check activatorEvent coordinates against canvas rect
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return false;
        const pointer = event.activatorEvent as PointerEvent;
        const endX = pointer.clientX + event.delta.x;
        const endY = pointer.clientY + event.delta.y;
        return endX >= rect.left && endX <= rect.right && endY >= rect.top && endY <= rect.bottom;
    };

    const handleDragStart = (event: DragStartEvent) => {
        if (String(event.active.id).startsWith("collection-")) {
            const data = event.active.data.current as { collection: CollectionItem } | undefined;
            if (data?.collection) setActiveCollection(data.collection);
        } else if (String(event.active.id).startsWith("canvas-")) {
            const data = event.active.data.current as { element: CanvasElement } | undefined;
            if (data?.element) {
                setActiveDragElement(data.element);
                setSelectedElementId(data.element.elementId);
            }
        }
    };

    const handleDragMove = (event: DragMoveEvent) => {
        const { active, delta } = event;
        if (String(active.id).startsWith("canvas-")) {
            const elId = String(active.id).replace("canvas-", "");
            const el = elements.find(e => e.elementId === elId);
            const rect = canvasRef.current?.getBoundingClientRect();
            if (el && rect) {
                const mode = getVariantMode(elId);
                const effectiveEl = (mode !== 'all' && el.variantOverrides?.[mode]) ? { ...el, ...el.variantOverrides[mode] } as CanvasElement : el;

                if (elId === selectedElementId) {
                    setActiveDragDelta({ x: delta.x, y: delta.y });
                }

                const moveXPct = (delta.x / rect.width) * 100;
                const moveYPct = (delta.y / rect.height) * 100;
                const tempX = effectiveEl.x + moveXPct;
                const tempY = effectiveEl.y + moveYPct;

                const centerX = tempX + effectiveEl.width / 2;
                const centerY = tempY + effectiveEl.height / 2;

                setSnapGuides({
                    vertical: Math.abs(centerX - 50) < 2,
                    horizontal: Math.abs(centerY - 50) < 2
                });
            }
        } else {
            setSnapGuides({ vertical: false, horizontal: false });
        }
    };

    const handleDragEnd = (event: DragEndEvent) => {
        setSnapGuides({ vertical: false, horizontal: false });
        setActiveCollection(null);
        setActiveDragElement(null);
        setActiveDragDelta(null);

        const { active, over, delta } = event;

        // --- Drop collection onto canvas ---
        if (String(active.id).startsWith("collection-") && isPointerOverCanvas(event)) {
            const data = active.data.current as { collection: CollectionItem } | undefined;
            const col = data?.collection;
            if (!col) return;

            const rect = canvasRef.current?.getBoundingClientRect();
            let dropX = 10;
            let dropY = 20 + elements.length * 10;
            if (rect) {
                const pointer = event.activatorEvent as PointerEvent;
                const endX = pointer.clientX + delta.x;
                const endY = pointer.clientY + delta.y;
                dropX = Math.max(0, Math.min(90, ((endX - rect.left) / rect.width) * 100 - 5));
                dropY = Math.max(0, Math.min(90, ((endY - rect.top) / rect.height) * 100 - 5));
            }

            const w = col.type === 'text' ? 80 : 60;
            const h = col.type === 'text' ? 8 : 40;
            const newId = `el-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
            // For audio/video, initialize per-variant timing overrides
            const isMedia = col.type === 'video' || col.type === 'audio';
            const variantOverrides: Record<string, Partial<CanvasElement>> = {};
            if (isMedia) {
                for (const item of col.items) {
                    variantOverrides[item.id] = {
                        startTime: 0,
                        duration: item.duration || 5,
                    };
                }
            }
            const baseDuration = isMedia
                ? (col.items[0]?.duration || 5)
                : 5;
            // Place on the first track by default
            const targetTrackId = tracks.length > 0 ? tracks[0].id : 'track-0';
            
            // Find a non-overlapping start time on the target track
            const trackSiblings = elements.filter(e => (e.trackId || 'track-0') === targetTrackId);
            let bestStart = 0;
            // Place after the last element in the track
            for (const sib of trackSiblings) {
                const sibTiming = elementTimings.get(sib.elementId) || { startTime: sib.startTime, duration: sib.duration };
                const sibEnd = sibTiming.startTime + sibTiming.duration;
                if (sibEnd > bestStart) bestStart = sibEnd;
            }

            const newEl: CanvasElement = {
                elementId: newId,
                sourceElementId: newId,
                collectionId: col.id,
                collectionType: col.type,
                title: col.title,
                x: dropX,
                y: dropY,
                width: w,
                height: h,
                zIndex: elements.length + 1,
                content: col.type === 'text' ? col.items[0]?.value || "YOUR TEXT HERE" : undefined,
                startTime: Math.round(bestStart * 10) / 10,
                duration: baseDuration,
                trackId: targetTrackId,
                rotation: 0,
                opacity: 1,
                visible: true,
                animations: [],
                ...(isMedia && Object.keys(variantOverrides).length > 0 ? { variantOverrides } : {}),
            };
            setElements(prev => [...prev, newEl]);
            setSelectedElementId(newEl.elementId);

            return;
        }

        // --- Move existing canvas element ---
        if (String(active.id).startsWith("canvas-")) {
            const elId = String(active.id).replace("canvas-", "");
            const rect = canvasRef.current?.getBoundingClientRect();
            if (!rect) return;

            const moveXPct = (delta.x / rect.width) * 100;
            const moveYPct = (delta.y / rect.height) * 100;

            setElements(prev => prev.map(el => {
                if (el.elementId === elId) {
                    const mode = getVariantMode(el.elementId);
                    const effectiveEl = (mode !== 'all' && el.variantOverrides?.[mode]) ? { ...el, ...el.variantOverrides[mode] } as CanvasElement : el;
                    let newX = effectiveEl.x + moveXPct;
                    let newY = effectiveEl.y + moveYPct;

                    // Check snapping thresholds
                    const centerX = newX + effectiveEl.width / 2;
                    const centerY = newY + effectiveEl.height / 2;
                    if (Math.abs(centerX - 50) < 2) newX = 50 - effectiveEl.width / 2;
                    if (Math.abs(centerY - 50) < 2) newY = 50 - effectiveEl.height / 2;

                    return applyToElement(el, { x: newX, y: newY }, mode);
                }
                return el;
            }));
        }
    };

    const selectedElement = elements.find(e => e.elementId === selectedElementId);

    // Get the effective element with variant overrides merged in
    const getEffectiveElement = (el: CanvasElement, variantId: string): CanvasElement => {
        if (variantId === 'all' || !el.variantOverrides?.[variantId]) return el;
        return { ...el, ...el.variantOverrides[variantId] } as CanvasElement;
    };

    // The element as seen in the inspector (with current variant overrides applied)
    const selectedVariantMode = selectedElementId ? getVariantMode(selectedElementId) : 'all';
    let effectiveElement = selectedElement && selectedVariantMode !== 'all'
        ? getEffectiveElement(selectedElement, selectedVariantMode)
        : selectedElement;
    if (effectiveElement && selectedElementId) {
        const timing = elementTimings.get(selectedElementId);
        if (timing) effectiveElement = { ...effectiveElement, ...timing };
    }

    const updateSelected = (updates: Partial<CanvasElement>) => {
        if (!selectedElementId) return;
        let finalUpdates = updates;
        // For audio/video in 'all' mode, strip timing properties — those are per-variant only
        if (selectedVariantMode === 'all' && selectedElement) {
            const isMedia = selectedElement.collectionType === 'video' || selectedElement.collectionType === 'audio';
            if (isMedia) {
                const { startTime, duration, mediaOffset, ...rest } = finalUpdates as any;
                finalUpdates = rest;
                if (Object.keys(finalUpdates).length === 0) return;
            }
        }
        setElements(prev => prev.map(el => el.elementId === selectedElementId ? applyToElement(el, finalUpdates, selectedVariantMode) : el));
    };

    const removeSelected = () => {
        if (!selectedElementId) return;
        setElements(prev => prev.filter(el => el.elementId !== selectedElementId));
        setSelectedElementId(null);
    };

    // --- Build a flat RenderJob from current state ---
    const buildRenderJob = useCallback(() => {
        const [rw, rh] = exportSettings.resolution.split('x').map(Number);

        const renderEls: RenderElement[] = elements.map(el => {
            const timingEntry = elementTimings.get(el.elementId) ?? { startTime: el.startTime, duration: el.duration };
            const col = collections.find(c => c.id === el.collectionId);
            const chosenVariant = previewVariants[el.elementId];

            // Resolve actual content/URL from selected variant
            let mediaUrl: string | undefined;
            let content: string | undefined;
            if (chosenVariant) {
                if (el.collectionType === 'text') {
                    content = chosenVariant.value;
                } else {
                    mediaUrl = chosenVariant.value;
                }
            } else if (el.collectionType === 'text') {
                content = el.content;
            } else {
                content = el.content;
            }

            // Per-variant override for media (duration/offset)
            const variantId = chosenVariant?.id;
            const variantOverride = variantId ? el.variantOverrides?.[variantId] : undefined;

            const startTime = timingEntry.startTime;
            const duration = variantOverride?.duration ?? timingEntry.duration;
            const mediaOffset = (variantOverride as Partial<CanvasElement>)?.mediaOffset ?? el.mediaOffset ?? 0;

            return {
                elementId: el.elementId,
                collectionType: el.collectionType,
                startTime,
                duration,
                x: el.x,         // already 0–100 percent of canvas
                y: el.y,
                width: el.width,
                height: el.height,
                rotation: el.rotation,
                opacity: el.opacity,
                content,
                mediaUrl,
                mediaOffset,
                volume: el.volume ?? 1,
                zIndex: el.zIndex,
                fontSize: el.fontSize,
                fontWeight: el.fontWeight,
                fontStyle: el.fontStyle,
                textDecoration: el.textDecoration,
                letterSpacing: el.letterSpacing,
                lineHeight: el.lineHeight,
                textAlign: el.textAlign,
                animations: el.animations ?? [],
            } satisfies RenderElement;
        });

        return {
            elements: renderEls,
            totalDuration: TOTAL_DURATION,
            width: rw,
            height: rh,
            fps: exportSettings.fps,
            videoBitsPerSecond: exportSettings.bitrate * 1_000_000,
            format: exportSettings.format,
        };
    }, [elements, collections, previewVariants, elementTimings, exportSettings, TOTAL_DURATION]);

    const queueCurrentVariant = useCallback(() => {
        const job = buildRenderJob();
        const currentUsedVariantIds = elements.map(el => activeVariantModes[el.elementId]).filter(id => id !== 'all') as string[];
        setRenderQueue(prev => [...prev, { id: `job-${Date.now()}`, name: `Variant ${prev.length + 1} (Seed ${variantSeed})`, job, usedVariantIds: currentUsedVariantIds }]);
        showToast("Variant added to render queue", "success");
    }, [buildRenderJob, variantSeed, elements, activeVariantModes]);

    const startRender = useCallback(async () => {
        const currentUsedVariantIds = elements.map(el => activeVariantModes[el.elementId]).filter(id => id !== 'all') as string[];
        const jobsToRender = renderQueue.length > 0 ? renderQueue : [{ id: 'current', name: 'Current View', job: buildRenderJob(), usedVariantIds: currentUsedVariantIds }];
        
        const abortCtrl = new AbortController();
        renderAbortRef.current = abortCtrl;
        
        try {
            for (let i = 0; i < jobsToRender.length; i++) {
                const item = jobsToRender[i];
                if (abortCtrl.signal.aborted) break;
                
                setRenderProgress({ phase: 'preparing', progress: 0, message: jobsToRender.length > 1 ? `[${i + 1}/${jobsToRender.length}] Starting…` : 'Starting…' });

                const progressWrapper = (p: RenderProgress) => {
                    setRenderProgress({ 
                        ...p, 
                        message: jobsToRender.length > 1 
                            ? `[${i + 1}/${jobsToRender.length}] ${p.message}` 
                            : p.message 
                    });
                };
                
                await renderComposition(item.job, progressWrapper, abortCtrl.signal);
                
                // Record usage for negative bias in future randomizations
                recordVariantUsage(item.usedVariantIds);

                // Remove from queue if successful
                if (jobsToRender.length > 1) {
                    setRenderQueue(prev => prev.filter(q => q.id !== item.id));
                }
            }
            if (!abortCtrl.signal.aborted) {
                setRenderProgress({ phase: 'done', progress: 1, message: jobsToRender.length > 1 ? 'All exports complete!' : 'Export complete!' });
            }
        } catch (e: unknown) {
            setRenderProgress({ phase: 'error', progress: 0, message: 'Render failed', error: e instanceof Error ? e.message : String(e) });
        }
    }, [buildRenderJob, renderQueue]);

    const cancelRender = useCallback(() => {
        renderAbortRef.current?.abort();
    }, []);

    const saveSkeleton = async (overrides?: { tracks?: TrackConfig[], silent?: boolean }) => {
        setSaving(true);
        try {
            const payload = {
                duration: TOTAL_DURATION,
                elements: elements,
                tracks: overrides?.tracks || tracks,
                collections: collections,
            };
            const endpoint = compositionId ? `/api/compositions/${compositionId}` : '/api/compositions';
            const method = compositionId ? 'PUT' : 'POST';

            const res = await fetch(endpoint, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (res.ok) { if (!overrides?.silent) showToast("Composition saved successfully!", "success"); }
            else { if (!overrides?.silent) showToast("Failed to save composition.", "error"); }
            } catch { if (!overrides?.silent) showToast("Failed to save.", "error"); }
            finally { setSaving(false); }
            };

    return (
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragMove={handleDragMove} onDragEnd={handleDragEnd} collisionDetection={pointerWithin}>
            <div className="text-gray-300 h-screen w-full overflow-hidden flex flex-col antialiased bg-[#050505]">
                {/* Top Nav */}
                <nav className="h-14 border-b border-white/5 flex items-center justify-between px-6 bg-[#0a0a0a]/80 backdrop-blur-md z-50 shrink-0">
                    <div className="flex items-center gap-4">
                        <Link href="/">
                            <div className="w-8 h-8 bg-white text-black rounded-md flex items-center justify-center font-bold font-mono text-lg border border-gray-400 hover:scale-105 transition-transform">D</div>
                        </Link>
                        <h1 className="text-sm font-semibold tracking-wide text-white">DropAI <span className="text-gray-600 font-normal mx-2">/</span> Composition Builder</h1>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <button onClick={() => setIsSettingsOpen(!isSettingsOpen)} title="Project Settings" className="p-1.5 px-2 bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white rounded-md transition-colors flex items-center justify-center">
                                <Settings className="w-4 h-4" />
                            </button>
                            <AnimatePresence>
                                {isSettingsOpen && (
                                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} className="absolute right-0 top-full mt-2 w-64 bg-[#111] border border-white/10 rounded-lg shadow-2xl p-4 z-50">
                                        <div className="flex justify-between items-center mb-4">
                                            <h3 className="text-sm font-semibold text-white">Project Settings</h3>
                                            <button onClick={() => setIsSettingsOpen(false)} className="text-gray-400 hover:text-white"><X className="w-4 h-4" /></button>
                                        </div>
                                        <div className="space-y-4">
                                            <div>
                                                <label className="text-xs font-mono text-gray-400 flex justify-between items-center mb-1">
                                                    Playback Duration
                                                    <span className="text-white bg-white/10 px-1.5 py-0.5 rounded">{TOTAL_DURATION}s</span>
                                                </label>
                                                <div className="flex items-center gap-2 mt-2">
                                                    <input
                                                        type="range"
                                                        min={10}
                                                        max={600}
                                                        step={1}
                                                        value={TOTAL_DURATION}
                                                        onChange={(e) => setTOTAL_DURATION(Number(e.target.value))}
                                                        className="w-full h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer accent-blue-500"
                                                    />
                                                    <input
                                                        type="number"
                                                        min={10}
                                                        max={600}
                                                        value={TOTAL_DURATION}
                                                        onChange={(e) => setTOTAL_DURATION(Number(e.target.value) || 10)}
                                                        className="w-14 text-xs font-mono bg-black/40 border border-white/10 rounded px-1.5 py-1 text-gray-300 outline-none focus:border-white/20 text-center"
                                                    />
                                                </div>
                                                <div className="flex justify-between text-[10px] text-gray-500 mt-1">
                                                    <span>10s</span>
                                                    <span>600s</span>
                                                </div>
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                        <button onClick={() => saveSkeleton()} disabled={saving} className="px-4 py-1.5 bg-[#111] hover:bg-[#222] border border-white/5 disabled:opacity-50 text-gray-300 hover:text-white text-xs font-semibold rounded-md transition-colors">
                            {saving ? "Saving..." : "Save Changes"}
                        </button>
                        <button
                            onClick={() => { setIsExportModalOpen(true); setRenderProgress(null); }}
                            className="px-4 py-1.5 bg-white hover:bg-gray-200 text-black text-xs font-semibold rounded-md transition-colors flex items-center gap-2"
                        >
                            <Clapperboard className="w-4 h-4" /> Export {renderQueue.length > 0 ? `(${renderQueue.length})` : ''}
                        </button>
                    </div>
                </nav>

                <main className="flex-1 flex overflow-hidden">

                    <aside className="w-72 border-r border-white/5 flex flex-col bg-[#0a0a0a] shrink-0">
                        <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
                            <h2 className="text-[10px] font-bold uppercase tracking-widest text-gray-500 font-mono">Collections</h2>
                            <button
                                onClick={() => setIsCreatingCollection(!isCreatingCollection)}
                                className="text-gray-500 hover:text-gray-300 transition-colors"
                            >
                                <Plus className="w-4 h-4" />
                            </button>
                        </div>

                        {/* New Collection Form */}
                        <AnimatePresence>
                            {isCreatingCollection && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: "auto", opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className="overflow-hidden border-b border-white/5"
                                >
                                    <div className="p-3 space-y-2">
                                        <input
                                            value={newCollectionTitle}
                                            onChange={(e) => setNewCollectionTitle(e.target.value)}
                                            placeholder="Collection name..."
                                            className="w-full text-[11px] font-mono bg-black/40 border border-white/10 rounded px-2.5 py-2 text-gray-300 placeholder:text-gray-600 outline-none focus:border-white/20"
                                        />
                                        <div className="grid grid-cols-4 gap-1">
                                            {(["text", "image", "video", "audio"] as CollectionType[]).map(t => {
                                                const c = COLLECTION_COLORS[t];
                                                return (
                                                    <button
                                                        key={t}
                                                        onClick={() => setNewCollectionType(t)}
                                                        className={cn(
                                                            "text-[9px] font-mono py-1.5 rounded border transition-all capitalize",
                                                            newCollectionType === t
                                                                ? `${c.bg} ${c.border} ${c.text}`
                                                                : "border-white/5 text-gray-500 hover:border-white/10"
                                                        )}
                                                    >
                                                        {t}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                        <div className="flex gap-1.5">
                                            <button
                                                onClick={() => {
                                                    if (!newCollectionTitle.trim()) return;
                                                    const newCol: CollectionItem = {
                                                        id: `col-${Date.now()}`,
                                                        title: newCollectionTitle.trim(),
                                                        type: newCollectionType,
                                                        items: [],
                                                    };
                                                    setCollections(prev => [...prev, newCol]);
                                                    setNewCollectionTitle("");
                                                    setIsCreatingCollection(false);
                                                }}
                                                className="flex-1 text-[10px] font-mono py-1.5 bg-white/10 hover:bg-white/15 text-gray-300 rounded transition-colors"
                                            >
                                                Create
                                            </button>
                                            <button
                                                onClick={() => { setIsCreatingCollection(false); setNewCollectionTitle(""); }}
                                                className="flex-1 text-[10px] font-mono py-1.5 bg-white/5 hover:bg-white/10 text-gray-500 rounded transition-colors"
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
                            {collections.map(col => (
                                <CollectionCard
                                    key={col.id}
                                    collection={col}
                                    onAddItem={(colId, label, value, duration) => {
                                        setCollections(prev => prev.map(c =>
                                            c.id === colId ? { ...c, items: [...c.items, { id: `v-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, label, value, duration }] } : c
                                        ));
                                    }}
                                    onDeleteItem={(colId, variantId) => {
                                        setCollections(prev => prev.map(c =>
                                            c.id === colId ? { ...c, items: c.items.filter(v => v.id !== variantId) } : c
                                        ));
                                    }}
                                    onUpdateItem={(colId, variantId, newValue, duration) => {
                                        setCollections(prev => prev.map(c =>
                                            c.id === colId ? { ...c, items: c.items.map(v => v.id === variantId ? { ...v, value: newValue, duration: duration !== undefined ? duration : v.duration } : v) } : c
                                        ));
                                    }}
                                    onDeleteCollection={(colId) => {
                                        setCollections(prev => prev.filter(c => c.id !== colId));
                                        setElements(prev => prev.filter(el => el.collectionId !== colId));
                                        if (elements.find(el => el.elementId === selectedElementId && el.collectionId === colId)) {
                                            setSelectedElementId(null);
                                        }
                                    }}
                                />
                            ))}
                        </div>
                    </aside>

                    {/* Center Area */}
                    <section className="flex-1 relative flex flex-col items-center bg-[#080808] overflow-hidden" onClick={() => { if (!inspectorLocked) setSelectedElementId(null) }}>

                        {/* Floating Tab Menu */}
                        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 flex items-center bg-[#111]/90 backdrop-blur-md rounded-full border border-white/10 p-1 shadow-xl">
                            <button
                                onClick={(e) => { e.stopPropagation(); setIsPlaying(false); setCenterView('canvas'); }}
                                className={cn("px-5 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all", centerView === 'canvas' ? "bg-white text-black shadow-md" : "text-gray-400 hover:text-white")}
                            >
                                Canvas
                            </button>
                            <button
                                onClick={(e) => { e.stopPropagation(); setIsPlaying(false); setCenterView('preview'); }}
                                className={cn("px-5 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all", centerView === 'preview' ? "bg-white text-black shadow-md" : "text-gray-400 hover:text-white")}
                            >
                                Preview
                            </button>
                        </div>

                        {/* Resolution Badge (Floating) */}
                        {(
                            <div className="absolute top-4 left-4 z-20 px-3 py-1.5 rounded-md text-[10px] font-mono text-gray-500 bg-black/60 border border-white/5">
                                9:16 · 1080×1920
                            </div>
                        )}

                        {/* Canvas / Preview Area (Scrollable space safely centered) */}
                        <div className="flex-1 w-full flex flex-col items-center overflow-y-auto overflow-x-hidden">
                            <div className="w-full flex flex-col items-center my-auto pt-24 pb-12 px-8 shrink-0 min-h-min">
                                {centerView === 'canvas' ? (
                                    <>
                                        <div
                                            ref={setCanvasRefs}
                                            id="main-canvas"
                                            className={cn(
                                                "relative bg-black w-full max-w-[320px] aspect-[9/16] rounded-xl border-2 transition-all shadow-[0_0_60px_rgba(0,0,0,0.6)] shrink-0 z-10",
                                                isOverCanvas ? "border-blue-500/60 shadow-[0_0_40px_rgba(59,130,246,0.2)]" : "border-white/10"
                                            )}
                                        >
                                            {/* Clipped layer */}
                                            <div className="absolute inset-0 overflow-hidden rounded-xl">
                                                <AnimatePresence>
                                                    {snapGuides.vertical && (
                                                        <motion.div key="vertical-guide" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-[1px] bg-pink-500 z-[200] pointer-events-none shadow-[0_0_10px_rgba(236,72,153,1)]" />
                                                    )}
                                                    {snapGuides.horizontal && (
                                                        <motion.div key="horizontal-guide" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[1px] bg-pink-500 z-[200] pointer-events-none shadow-[0_0_10px_rgba(236,72,153,1)]" />
                                                    )}
                                                </AnimatePresence>
                                                <div className="absolute inset-0 opacity-[0.06] pointer-events-none" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.3) 1px, transparent 1px)', backgroundSize: '10% 10%' }} />
                                                {elements.filter(el => el.elementId !== selectedElementId)
                                                    .sort((a, b) => {
                                                        const ta = tracks.findIndex(t => t.id === (a.trackId || 'track-0'));
                                                        const tb = tracks.findIndex(t => t.id === (b.trackId || 'track-0'));
                                                        if (ta !== tb) return tb - ta; // Lower track index should map to later array order (to be on top)
                                                        return a.zIndex - b.zIndex;
                                                    })
                                                    .map(baseEl => {
                                                        const elMode = getVariantMode(baseEl.elementId);
                                                        const rawEl = elMode !== 'all' ? getEffectiveElement(baseEl, elMode) : baseEl;
                                                        
                                                        const trackIndex = tracks.findIndex(t => t.id === (baseEl.trackId || 'track-0'));
                                                        const baseZ = 1000 - (Math.max(0, trackIndex) * 10);
                                                        const el = { ...rawEl, zIndex: baseZ + (rawEl.zIndex || 0) };

                                                        return (
                                                            <CanvasLayer
                                                                key={el.elementId}
                                                                el={el}
                                                                isSelected={false}
                                                                collections={collections}
                                                                currentTime={currentTime}
                                                                onClick={() => { setSelectedElementId(el.elementId); }}
                                                                onActionStart={handleActionStart}
                                                            />
                                                        )
                                                    })}
                                            </div>
                                            {selectedElement && (() => {
                                                const rawEl = effectiveElement || selectedElement;
                                                const trackIndex = tracks.findIndex(t => t.id === (rawEl.trackId || 'track-0'));
                                                const baseZ = 1000 - (Math.max(0, trackIndex) * 10);
                                                const el = { ...rawEl, zIndex: baseZ + (rawEl.zIndex || 0) + 100 }; // Boost selected on top of its track
                                                return (
                                                    <CanvasLayer
                                                        key={el.elementId}
                                                        el={el}
                                                        isSelected={true}
                                                        collections={collections}
                                                        currentTime={currentTime}
                                                        onClick={() => { }}
                                                        onActionStart={handleActionStart}
                                                    />
                                                );
                                            })()}
                                            {elements.length === 0 && (
                                                <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-600 pointer-events-none">
                                                    <Plus className="w-8 h-8 mb-3 opacity-30" />
                                                    <p className="text-xs font-mono tracking-wide">Drag assets here</p>
                                                </div>
                                            )}
                                            <AnimatePresence>
                                                {selectedElement && (
                                                    // Only show rotation handles if the element is active in the current timeline position
                                                    (currentTime >= selectedElement.startTime && currentTime < selectedElement.startTime + selectedElement.duration) && (
                                                        <motion.div
                                                            initial={{ opacity: 0, scale: 0.8 }}
                                                            animate={{ opacity: 1, scale: 1 }}
                                                            exit={{ opacity: 0, scale: 0.8 }}
                                                            className="absolute pointer-events-none z-[200]"
                                                            style={{
                                                                left: `${(effectiveElement || selectedElement).x}%`,
                                                                top: `${(effectiveElement || selectedElement).y}%`,
                                                                width: `${(effectiveElement || selectedElement).width}%`,
                                                                height: `${(effectiveElement || selectedElement).height}%`,
                                                                transform: `translate3d(${activeDragDelta?.x || 0}px, ${activeDragDelta?.y || 0}px, 0) rotate(${(effectiveElement || selectedElement).rotation || 0}deg)`
                                                            }}
                                                        >
                                                            <div
                                                                className="absolute top-[-35px] left-1/2 -translate-x-1/2 w-6 h-6 bg-white rounded-full shadow-[0_2px_10px_rgba(0,0,0,0.5)] border border-gray-300 flex items-center justify-center cursor-crosshair pointer-events-auto hover:scale-110 hover:bg-gray-100 transition-all active:scale-95 active:bg-gray-200"
                                                                onPointerDown={(e) => {
                                                                    e.stopPropagation();
                                                                    handleActionStart('rotate', e as unknown as React.PointerEvent<HTMLDivElement>);
                                                                }}
                                                            >
                                                                <div className="w-2 h-2 rounded-full border border-gray-500" />
                                                            </div>
                                                            <div className="absolute top-[-11px] left-1/2 -translate-x-1/2 w-[1px] h-[12px] bg-white/50 pointer-events-none" />
                                                        </motion.div>
                                                    )
                                                )}
                                            </AnimatePresence>
                                        </div>
                                    </>
                                ) : (
                                    /* Preview View */
                                    <div className="w-full max-w-[320px] space-y-4 shrink-0 z-10">
                                        <div className="w-full aspect-[9/16] bg-black rounded-lg border border-white/10 relative overflow-hidden shadow-2xl">
                                            <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.3) 1px, transparent 1px)', backgroundSize: '10% 10%' }} />
                                            {elements
                                                .map(baseEl => {
                                                    // When a specific variant is selected in inspector, use it for preview
                                                    // When 'all', fall back to random seed-based preview
                                                    let variant: CollectionVariant | null = null;
                                                    const elMode = getVariantMode(baseEl.elementId);
                                                    if (elMode !== 'all') {
                                                        const col = collections.find(c => c.id === baseEl.collectionId);
                                                        variant = col?.items.find(v => v.id === elMode) ?? previewVariants[baseEl.elementId];
                                                    } else {
                                                        variant = previewVariants[baseEl.elementId];
                                                    }
                                                    const overrides = variant ? getEffectiveElement(baseEl, variant.id) : baseEl;
                                                    const timing = elementTimings.get(baseEl.elementId) || { startTime: baseEl.startTime, duration: baseEl.duration };
                                                    const el = { ...overrides, ...timing };
                                                    return { el, variant };
                                                })
                                                .filter(({ el }) => (el.visible !== false) && el.collectionType !== 'audio')
                                                .sort((a, b) => {
                                                    const ta = tracks.findIndex(t => t.id === (a.el.trackId || 'track-0'));
                                                    const tb = tracks.findIndex(t => t.id === (b.el.trackId || 'track-0'));
                                                    if (ta !== tb) return tb - ta;
                                                    return a.el.zIndex - b.el.zIndex;
                                                })
                                                .map(({ el: rawEl, variant }) => {
                                                    const isActive = currentTime >= rawEl.startTime && currentTime < rawEl.startTime + rawEl.duration;
                                                    const colors = COLLECTION_COLORS[rawEl.collectionType];
                                                    const animStyle = evaluateAnimations(rawEl, currentTime);
                                                    
                                                    const trackIndex = tracks.findIndex(t => t.id === (rawEl.trackId || 'track-0'));
                                                    const baseZ = 1000 - (Math.max(0, trackIndex) * 10);
                                                    const el = { ...rawEl, zIndex: baseZ + (rawEl.zIndex || 0) };

                                                    return (
                                                        <div
                                                            key={el.elementId}
                                                            className="absolute overflow-hidden"
                                                            style={{
                                                                left: `${el.x}%`,
                                                                top: `${el.y}%`,
                                                                width: `${el.width}%`,
                                                                height: `${el.height}%`,
                                                                zIndex: el.zIndex,
                                                                opacity: isActive ? animStyle.opacity : 0,
                                                                pointerEvents: isActive ? 'auto' : 'none',
                                                                transform: `rotate(${el.rotation || 0}deg) scale(${animStyle.scale}) rotate(${animStyle.rotate}deg)`,
                                                                filter: animStyle.blur > 0 ? `blur(${animStyle.blur}px)` : undefined,
                                                            }}
                                                        >
                                                            {el.collectionType === 'text' ? (
                                                                <div className="w-full h-full flex items-center justify-center px-2">
                                                                    <span className="text-white text-sm drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)] w-full" style={{ fontSize: el.fontSize ? `${el.fontSize}px` : undefined, fontWeight: el.fontWeight || 'bold', fontStyle: el.fontStyle || 'normal', textDecoration: el.textDecoration || 'none', letterSpacing: el.letterSpacing ? `${el.letterSpacing}px` : undefined, lineHeight: el.lineHeight ? el.lineHeight : undefined, textAlign: el.textAlign || 'center', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                                                        {variant?.value || el.content || "TEXT"}
                                                                    </span>
                                                                </div>
                                                            ) : el.collectionType === 'image' ? (
                                                                variant?.value ? (
                                                                    <img src={variant.value} className="w-full h-full object-cover" alt={variant.label} />
                                                                ) : (
                                                                    <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: colors.bg }}>
                                                                        <ImageIcon className={cn("w-6 h-6 opacity-40", colors.icon)} />
                                                                    </div>
                                                                )
                                                            ) : el.collectionType === 'video' ? (
                                                                variant?.value ? (
                                                                    <video
                                                                        key={`vid-${el.elementId}-${variant?.value || 'base'}`}
                                                                        src={variant.value}
                                                                        className="w-full h-full object-cover"
                                                                        playsInline
                                                                        preload="auto"
                                                                        loop
                                                                        ref={(videoEl) => {
                                                                            if (!videoEl) return;
                                                                            const rawDur = (videoEl.duration && !isNaN(videoEl.duration)) ? videoEl.duration : Infinity;
                                                                            const localTime = Math.max(0, currentTime - el.startTime) + (el.mediaOffset ?? 0);
                                                                            const safeLocalTime = rawDur !== Infinity ? (localTime % rawDur) : localTime;
                                                                            // Sync time if scrubbing or drifting out of sync
                                                                            if (Math.abs(videoEl.currentTime - safeLocalTime) > 0.2) {
                                                                                videoEl.currentTime = safeLocalTime;
                                                                            }
                                                                            if (videoEl.volume !== (el.volume ?? 1)) {
                                                                                videoEl.volume = el.volume ?? 1;
                                                                            }
                                                                            if (isPlaying && isActive) {
                                                                                if (videoEl.paused) videoEl.play().catch(() => { });
                                                                            }
                                                                            else {
                                                                                if (!videoEl.paused) videoEl.pause();
                                                                            }
                                                                        }}
                                                                    />
                                                                ) : (
                                                                    <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: colors.bg }}>
                                                                        <Video className={cn("w-6 h-6 opacity-40", colors.icon)} />
                                                                    </div>
                                                                )
                                                            ) : el.collectionType === 'audio' ? (
                                                                <audio
                                                                    src={variant?.value || el.content}
                                                                    loop
                                                                    ref={(audioEl) => {
                                                                        if (!audioEl) return;
                                                                        const rawDur = (audioEl.duration && !isNaN(audioEl.duration)) ? audioEl.duration : Infinity;
                                                                        const localTime = Math.max(0, currentTime - el.startTime);
                                                                        const safeLocalTime = rawDur !== Infinity ? (localTime % rawDur) : localTime;
                                                                        if (Math.abs(audioEl.currentTime - safeLocalTime) > 0.2) {
                                                                            audioEl.currentTime = safeLocalTime;
                                                                        }
                                                                        if (audioEl.volume !== (el.volume ?? 1)) {
                                                                            audioEl.volume = el.volume ?? 1;
                                                                        }
                                                                        if (isPlaying && isActive) {
                                                                            if (audioEl.paused) audioEl.play().catch(() => { });
                                                                        } else {
                                                                            if (!audioEl.paused) audioEl.pause();
                                                                        }
                                                                    }}
                                                                />
                                                            ) : null}
                                                        </div>
                                                    );
                                                })}

                                            {/* Hidden audio elements for playback */}
                                            {elements
                                                .filter(baseEl => baseEl.collectionType === 'audio' && baseEl.visible !== false)
                                                .map(baseEl => {
                                                    let variant: CollectionVariant | null = null;
                                                    const elMode = getVariantMode(baseEl.elementId);
                                                    if (elMode !== 'all') {
                                                        const col = collections.find(c => c.id === baseEl.collectionId);
                                                        variant = col?.items.find(v => v.id === elMode) ?? previewVariants[baseEl.elementId];
                                                    } else {
                                                        variant = previewVariants[baseEl.elementId];
                                                    }
                                                    const overrides = variant ? getEffectiveElement(baseEl, variant.id) : baseEl;
                                                    const timing = elementTimings.get(baseEl.elementId) || { startTime: baseEl.startTime, duration: baseEl.duration };
                                                    const el = { ...overrides, ...timing };
                                                    const isActive = currentTime >= el.startTime && currentTime < el.startTime + el.duration;
                                                    return (
                                                        <audio
                                                            key={`aud-${el.elementId}-${variant?.value || el.content || 'base'}`}
                                                            src={variant?.value || el.content}
                                                            loop
                                                            ref={(audioEl) => {
                                                                if (!audioEl) return;
                                                                const rawDur = (audioEl.duration && !isNaN(audioEl.duration)) ? audioEl.duration : Infinity;
                                                                const localTime = Math.max(0, currentTime - el.startTime) + (el.mediaOffset ?? 0);
                                                                const safeLocalTime = rawDur !== Infinity ? (localTime % rawDur) : localTime;
                                                                if (Math.abs(audioEl.currentTime - safeLocalTime) > 0.2) {
                                                                    audioEl.currentTime = safeLocalTime;
                                                                }
                                                                if (audioEl.volume !== (el.volume ?? 1)) {
                                                                    audioEl.volume = el.volume ?? 1;
                                                                }
                                                                if (isPlaying && isActive) {
                                                                    if (audioEl.paused) audioEl.play().catch(() => { });
                                                                } else {
                                                                    if (!audioEl.paused) audioEl.pause();
                                                                }
                                                            }}
                                                        />
                                                    );
                                                })}
                                            {elements.length === 0 && (
                                                <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-600">
                                                    <MonitorPlay className="w-8 h-8 mb-2 opacity-30" />
                                                    <span className="text-[10px] font-mono">No elements</span>
                                                </div>
                                            )}

                                            <div className="absolute top-2 right-2 bg-black/70 backdrop-blur-sm rounded px-2 py-1 text-[9px] font-mono text-gray-400 z-50">
                                                {currentTime.toFixed(1)}s
                                            </div>
                                        </div>

                                        {/* Transport Controls */}
                                        <div className="space-y-3">
                                            <div className="relative">
                                                <input
                                                    type="range"
                                                    min={0}
                                                    max={TOTAL_DURATION}
                                                    step={0.1}
                                                    value={currentTime}
                                                    onChange={(e) => {
                                                        setCurrentTime(Number(e.target.value));
                                                    }}
                                                    className="w-full h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer accent-blue-500"
                                                />
                                                <div className="flex justify-between text-[8px] font-mono text-gray-600 mt-1">
                                                    <span>{formatTime(currentTime)}</span>
                                                    <span>{formatTime(TOTAL_DURATION)}</span>
                                                </div>
                                            </div>
                                            <div className="flex items-center justify-center gap-3">
                                                <button
                                                    onClick={() => { setCurrentTime(0); }}
                                                    className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                                                    title="Restart"
                                                >
                                                    <SkipBack className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={handlePlayPause}
                                                    className={cn(
                                                        "p-3 rounded-full transition-all shadow-lg",
                                                        isPlaying
                                                            ? "bg-white text-black hover:bg-gray-200"
                                                            : "bg-blue-600 text-white hover:bg-blue-500"
                                                    )}
                                                >
                                                    {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
                                                </button>
                                                <button
                                                    onClick={() => { randomizeVariants(); }}
                                                    className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                                                    title="Shuffle variants"
                                                >
                                                    <Shuffle className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => { queueCurrentVariant(); }}
                                                    className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                                                    title="Queue Variant"
                                                >
                                                    <ListPlus className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Layer Stack bar & Timeline */}
                                <div className="w-full max-w-[600px] mt-8 shrink-0 relative z-20">
                                    {/* Timeline Toggle Button (Floating Above) */}
                                    <div className="absolute right-0 -top-7 flex justify-end">
                                        <button onClick={() => setIsTimelineOpen(!isTimelineOpen)} className="p-1.5 px-3 bg-[#111] hover:bg-[#1a1a1a] rounded-t-lg text-gray-400 border border-white/5 border-b-0 shadow-md transition-all flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest z-10">
                                            <SlidersHorizontal className={cn("w-3.5 h-3.5 transition-transform", isTimelineOpen ? "rotate-180" : "")} />
                                            Timeline
                                        </button>
                                    </div>

                                    <div className="w-full bg-[#111] rounded-lg rounded-tr-none border border-white/5 flex flex-col overflow-hidden">
                                        {/* Header / Layer Bar */}
                                        <div className="p-3 flex items-center justify-between overflow-x-auto custom-scrollbar border-b border-white/5 shrink-0 relative pr-4">
                                            <div className="flex items-center gap-2">
                                                <div className="flex-shrink-0 flex items-center text-[9px] font-mono uppercase text-gray-600 mr-2 tracking-widest pl-1"><Layers className="w-3.5 h-3.5 mr-1.5" /> Layers</div>
                                                {[...elements].sort((a, b) => b.zIndex - a.zIndex).map(el => (
                                                    <button key={el.elementId} onClick={(e) => { e.stopPropagation(); setSelectedElementId(el.elementId); }} className={cn("px-3 py-1.5 rounded text-[10px] font-mono flex-shrink-0 border transition-colors", selectedElementId === el.elementId ? "bg-blue-500/20 text-blue-400 border-blue-500/40" : "bg-white/5 text-gray-500 hover:bg-white/10 border-transparent hover:text-gray-300")}>
                                                        {el.title}
                                                    </button>
                                                ))}
                                                {elements.length === 0 && (
                                                    <span className="text-[10px] font-mono text-gray-600 uppercase tracking-widest">No layers</span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-1 bg-white/5 rounded-md p-1 border border-white/10">
                                                <button
                                                    onClick={() => setTimelineTool('pointer')}
                                                    className={cn("p-1.5 rounded transition-colors", timelineTool === 'pointer' ? "bg-white/20 text-white" : "text-gray-500 hover:text-gray-300 hover:bg-white/10")}
                                                    title="Pointer Tool (V)"
                                                >
                                                    <MousePointer2 className="w-3.5 h-3.5" />
                                                </button>
                                                <button
                                                    onClick={() => setTimelineTool('split')}
                                                    className={cn("p-1.5 rounded transition-colors", timelineTool === 'split' ? "bg-blue-500/20 text-blue-400" : "text-gray-500 hover:text-gray-300 hover:bg-white/10")}
                                                    title="Split Tool (C)"
                                                >
                                                    <Scissors className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </div>

                                        {/* Playback Time Indicator */}
                                        <div className="px-3 py-1.5 border-b border-white/5 bg-[#0d0d0d]">
                                            <span className="text-[11px] font-mono text-gray-400 tabular-nums">{currentTime.toFixed(1)}s</span>
                                        </div>

                                        {/* Collapsible Timeline */}
                                        <AnimatePresence>
                                            {isTimelineOpen && (
                                                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="p-4 bg-[#0a0a0a] overflow-hidden">
                                                    {/* Scrollable timeline container */}
                                                    <div className="relative w-full h-[300px] flex border border-white/5 bg-[#0a0a0a] rounded-md overflow-hidden mt-4">
                                                        {/* Left Column - Fixed Width 150px */}
                                                        <div className="w-[150px] shrink-0 border-r border-white/10 flex flex-col bg-[#0a0a0a] z-20">
                                                            {/* Top Left Header */}
                                                            <div className="h-[28px] border-b border-white/10 shrink-0 flex items-center px-4 bg-[#111]">
                                                                <span className="text-[10px] text-gray-500 font-mono tracking-widest">TIMELINE</span>
                                                            </div>
                                                            {/* Left Tracks Scrollable */}
                                                            <div 
                                                                className="flex-1 overflow-y-auto custom-scrollbar py-2 space-y-1 bg-[#0a0a0a]"
                                                                id="track-headers-scroll"
                                                            >
                                                                {tracks.map((track, tIndex) => (
                                                                    <div key={track.id} className="h-10 px-2 flex items-center gap-2 bg-white/5 rounded-r mr-1 shrink-0 group">
                                                                        <span className="flex-1 text-[10px] text-gray-500 font-mono">Track {tIndex + 1}</span>
                                                                        <button
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                setElements(prev => prev.filter(el => (el.trackId || 'track-0') !== track.id));
                                                                                setTracks(prev => {
                                                                                    const next = prev.filter(t => t.id !== track.id);
                                                                                    saveSkeleton({ tracks: next, silent: true });
                                                                                    return next;
                                                                                });
                                                                            }}
                                                                            onPointerDown={(e) => e.stopPropagation()}
                                                                            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-white/10 rounded text-gray-400 hover:text-red-400"
                                                                            title="Delete Track"
                                                                        >
                                                                            <Trash2 className="w-3 h-3" />
                                                                        </button>
                                                                        <button 
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                setElements(prevElements => prevElements.map(el => {
                                                                                    if ((el.trackId || 'track-0') === track.id) {
                                                                                        const currentTiming = elementTimings.get(el.elementId);
                                                                                        if (currentTiming) {
                                                                                            const mode = getVariantModeRef.current(el.elementId);
                                                                                            return applyToElement(el, { startTime: currentTiming.startTime }, mode);
                                                                                        }
                                                                                    }
                                                                                    return el;
                                                                                }));
                                                                                setTracks(prev => prev.map(t => t.id === track.id ? { ...t, magnet: !t.magnet } : t));
                                                                            }}
                                                                            onPointerDown={(e) => e.stopPropagation()}
                                                                            className={cn("px-1.5 py-0.5 rounded transition-colors text-[9px]", track.magnet ? "bg-pink-500/20 text-pink-400 font-bold border border-pink-500/50" : "hover:bg-white/10")}
                                                                        >
                                                                            🧲 {track.magnet ? 'ON' : 'OFF'}
                                                                        </button>
                                                                    </div>
                                                                ))}
                                                                <div className="h-[48px] shrink-0 pointer-events-none" />
                                                            </div>
                                                            <div className="p-2 shrink-0 bg-[#0a0a0a] border-t border-[#222]">
                                                                <button 
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        const newTracks = [...tracks, { id: `track-${Date.now()}`, magnet: false }];
                                                                        setTracks(newTracks);
                                                                        saveSkeleton({ tracks: newTracks, silent: true });
                                                                    }}
                                                                    onPointerDown={(e) => e.stopPropagation()}
                                                                    className="w-[140px] mx-auto block py-2 text-[9px] font-mono font-bold text-gray-500 hover:bg-white/5 border border-dashed border-white/10 rounded transition-colors"
                                                                >
                                                                    + NEW TRACK
                                                                </button>
                                                            </div>
                                                        </div>

                                                        {/* Right Column - Flex 1 */}
                                                        <div className="flex-1 flex flex-col min-w-0 bg-[#111]">
                                                            {/* Timeline X-Scroll Wrapper */}
                                                            <div className="flex-1 overflow-x-auto overflow-y-auto custom-scrollbar relative flex flex-col"
                                                                onScroll={(e) => {
                                                                    const leftHeaders = document.getElementById('track-headers-scroll');
                                                                    if (leftHeaders) {
                                                                        leftHeaders.scrollTop = e.currentTarget.scrollTop;
                                                                    }
                                                                }}
                                                            >
                                                                <div style={{ width: `${Math.max(100, TOTAL_DURATION * 20)}px`, minWidth: '100%', minHeight: '100%' }} className="flex flex-col relative">
                                                                    {/* Playhead vertical line (Entire height) */}
                                                                    <div
                                                                        className="absolute top-0 bottom-0 w-[1px] bg-red-500 z-40 transition-none pointer-events-none"
                                                                        style={{ left: `${(currentTime / TOTAL_DURATION) * 100}%`, boxShadow: '0 0 6px rgba(239,68,68,0.6)' }}
                                                                    />

                                                                    {/* Top Ticks */}
                                                                    <div className="sticky top-0 h-[28px] shrink-0 border-b border-white/10 bg-[#111] z-50 cursor-crosshair"
                                                                        onPointerDown={(e) => {
                                                                            e.preventDefault();
                                                                            const container = e.currentTarget;
                                                                            container.setPointerCapture(e.pointerId);

                                                                            const seek = (clientX: number) => {
                                                                                const rect = container.getBoundingClientRect();
                                                                                const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
                                                                                const t = pct * TOTAL_DURATION;
                                                                                setCurrentTime(t);
                                                                            };
                                                                            seek(e.clientX);
                                                                            const onMove = (ev: PointerEvent) => seek(ev.clientX);
                                                                            const onUp = () => {
                                                                                container.removeEventListener('pointermove', onMove);
                                                                                container.removeEventListener('pointerup', onUp);
                                                                            };
                                                                            container.addEventListener('pointermove', onMove);
                                                                            container.addEventListener('pointerup', onUp);
                                                                        }}
                                                                    >
                                                                        <div className="relative w-full h-full text-[9px] font-mono text-gray-600">
                                                                            {Array.from({ length: Math.floor(TOTAL_DURATION / 10) + 1 }, (_, i) => i * 10).map((t, idx, arr) => (
                                                                                <span key={t} className="absolute bottom-1" style={{ left: `${(t / TOTAL_DURATION) * 100}%`, transform: idx === 0 ? 'none' : idx === arr.length - 1 ? 'translateX(-100%)' : 'translateX(-50%)' }}>
                                                                                    {t}s
                                                                                </span>
                                                                            ))}
                                                                            
                                                                            {/* Playhead Handle */}
                                                                            <div
                                                                                className="absolute top-0 bottom-0 z-50 pointer-events-auto"
                                                                                style={{ left: `${(currentTime / TOTAL_DURATION) * 100}%` }}
                                                                            >
                                                                                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3 h-full bg-red-500/80 cursor-grab active:cursor-grabbing hover:bg-red-400 transition-colors" />
                                                                            </div>
                                                                        </div>
                                                                    </div>

                                                                    {/* Tracks Area (Scrubber) */}
                                                                    <div 
                                                                        className="relative flex-1 py-2 space-y-1 cursor-crosshair"
                                                                        onPointerDown={(e) => {
                                                                            if ((e.target as HTMLElement).closest('.track-element-clip')) return;
                                                                            e.preventDefault();
                                                                            const container = e.currentTarget;
                                                                            container.setPointerCapture(e.pointerId);

                                                                            const seek = (clientX: number) => {
                                                                                const rect = container.getBoundingClientRect();
                                                                                const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
                                                                                const t = pct * TOTAL_DURATION;
                                                                                setCurrentTime(t);
                                                                            };
                                                                            seek(e.clientX);
                                                                            const onMove = (ev: PointerEvent) => seek(ev.clientX);
                                                                            const onUp = () => {
                                                                                container.removeEventListener('pointermove', onMove);
                                                                                container.removeEventListener('pointerup', onUp);
                                                                            };
                                                                            container.addEventListener('pointermove', onMove);
                                                                            container.addEventListener('pointerup', onUp);
                                                                        }}
                                                                    >
                                                                        {/* Background Grid */}
                                                                        <div className="absolute inset-0 opacity-[0.2] pointer-events-none" style={{ backgroundImage: 'linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)', backgroundSize: `${(10 / TOTAL_DURATION) * 100}% 100%` }} />

                                                                        {/* Empty state */}
                                                                        {elements.length === 0 && (
                                                                            <div className="absolute top-1/2 -translate-y-1/2 left-1/2 -translate-x-1/2 pointer-events-none flex flex-col items-center justify-center text-gray-600 opacity-50 z-20">
                                                                                <Layers className="w-5 h-5 mb-1 opacity-50" />
                                                                                <span className="text-[9px] font-mono tracking-widest text-[#222]">DROP ASSETS TO START</span>
                                                                            </div>
                                                                        )}

                                                                        {tracks.map((track) => {
                                                                            const trackElements = elements.filter(el => (el.trackId || 'track-0') === track.id);
                                                                            return (
                                                                                <div key={track.id} data-track-id={track.id} className="relative h-10 px-1 w-full bg-white/5 rounded border border-white/5 shrink-0 flex items-center track-row">
                                                                                    <div className="relative h-8 w-full bg-black/50 rounded overflow-hidden">
                                                                                    {trackElements.sort((a, b) => b.zIndex - a.zIndex).map((el, i) => {
                                                                                        const TOTAL = TOTAL_DURATION;

                                                                                        const isMediaEl = el.collectionType === 'video' || el.collectionType === 'audio';
                                                                                        const activeVariantMode = getVariantMode(el.elementId);
                                                                                        const isMediaAllMode = isMediaEl && activeVariantMode === 'all';

                                                                                        const timing = elementTimings.get(el.elementId) || { startTime: el.startTime, duration: el.duration };
                                                                                        let effectiveEl = el;
                                                                                        
                                                                                        if (isMediaEl && el.variantOverrides) {
                                                                                            if (activeVariantMode !== 'all' && el.variantOverrides[activeVariantMode]) {
                                                                                                effectiveEl = { ...el, ...el.variantOverrides[activeVariantMode], ...timing } as CanvasElement;
                                                                                            } else {
                                                                                                effectiveEl = { ...el, ...timing } as CanvasElement;
                                                                                            }
                                                                                        } else {
                                                                                            effectiveEl = { ...el, ...timing } as CanvasElement;
                                                                                        }

                                                                                        const handleSegmentDrag = (e: React.PointerEvent) => {
                                                                                            e.stopPropagation();
                                                                                            e.preventDefault();
                                                                                            // In magnet mode, order is controlled by resolveElementTimings — don't allow free drag
                                                                                            if (track.magnet) {
                                                                                                setSelectedElementId(el.elementId);
                                                                                                return;
                                                                                            }
                                                                                            const target = (e.currentTarget as HTMLElement).closest('.relative.h-8') as HTMLElement;
                                                                                            if (!target) return;
                                                                                            const startX = e.clientX;
                                                                                            const resolvedTiming = elementTimings.get(el.elementId) || { startTime: el.startTime, duration: el.duration };
                                                                                            const origStart = resolvedTiming.startTime;
                                                                                            const dur = resolvedTiming.duration;
                                                                                            const varMode = getVariantMode(el.elementId);

                                                                                            // Precalculate gaps for all tracks at drag start
                                                                                            const gapsByTrack: Record<string, {start: number, end: number}[]> = {};
                                                                                            for (const t of tracks) {
                                                                                                const occupied = elements
                                                                                                    .filter(o => o.elementId !== el.elementId && (o.trackId || 'track-0') === t.id)
                                                                                                    .map(o => {
                                                                                                        const tm = elementTimings.get(o.elementId) || { startTime: o.startTime, duration: o.duration };
                                                                                                        return { start: tm.startTime, end: tm.startTime + tm.duration };
                                                                                                    })
                                                                                                    .sort((a, b) => a.start - b.start);

                                                                                                const merged: { start: number; end: number }[] = [];
                                                                                                for (const occ of occupied) {
                                                                                                    if (merged.length > 0 && occ.start <= merged[merged.length - 1].end + 0.01) {
                                                                                                        merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, occ.end);
                                                                                                    } else {
                                                                                                        merged.push({ ...occ });
                                                                                                    }
                                                                                                }

                                                                                                const gaps: { start: number; end: number }[] = [];
                                                                                                let cursor = 0;
                                                                                                for (const m of merged) {
                                                                                                    if (m.start > cursor + 0.01) gaps.push({ start: cursor, end: m.start });
                                                                                                    cursor = Math.max(cursor, m.end);
                                                                                                }
                                                                                                if (cursor < TOTAL - 0.01) gaps.push({ start: cursor, end: TOTAL });
                                                                                                gapsByTrack[t.id] = gaps;
                                                                                            }

                                                                                            const allTrackElements = Array.from(document.querySelectorAll('.track-row')) as HTMLElement[];
                                                                                            const trackBounds = allTrackElements.map(tel => ({
                                                                                                id: tel.getAttribute('data-track-id')!,
                                                                                                rect: tel.getBoundingClientRect()
                                                                                            }));

                                                                                            let currentHoveredTrackId = el.trackId || 'track-0';
                                                                                            const initialGaps = gapsByTrack[currentHoveredTrackId] || [{ start: 0, end: TOTAL }];
                                                                                            let currentActiveGap = initialGaps.sort((a, b) => {
                                                                                                const overlapA = Math.max(0, Math.min(a.end, origStart + dur) - Math.max(a.start, origStart));
                                                                                                const overlapB = Math.max(0, Math.min(b.end, origStart + dur) - Math.max(b.start, origStart));
                                                                                                if (overlapA !== overlapB) return overlapB - overlapA;
                                                                                                const elemCenter = origStart + dur / 2;
                                                                                                return Math.abs((a.start + a.end) / 2 - elemCenter) - Math.abs((b.start + b.end) / 2 - elemCenter);
                                                                                            })[0];

                                                                                            (e.target as HTMLElement).setPointerCapture(e.pointerId);

                                                                                            const onMove = (ev: PointerEvent) => {
                                                                                                const trackRect = target.getBoundingClientRect();
                                                                                                const dx = ev.clientX - startX;
                                                                                                const dTime = (dx / trackRect.width) * TOTAL;
                                                                                                const projectedStart = origStart + dTime;
                                                                                                
                                                                                                let hoveredTrackId = currentHoveredTrackId;
                                                                                                for (const tb of trackBounds) {
                                                                                                    if (ev.clientY >= tb.rect.top && ev.clientY <= tb.rect.bottom) {
                                                                                                        hoveredTrackId = tb.id;
                                                                                                        break;
                                                                                                    }
                                                                                                }

                                                                                                if (hoveredTrackId !== currentHoveredTrackId) {
                                                                                                    currentHoveredTrackId = hoveredTrackId;
                                                                                                    const gaps = gapsByTrack[hoveredTrackId] || [{ start: 0, end: TOTAL }];
                                                                                                    currentActiveGap = gaps.sort((a, b) => {
                                                                                                        const overlapA = Math.max(0, Math.min(a.end, projectedStart + dur) - Math.max(a.start, projectedStart));
                                                                                                        const overlapB = Math.max(0, Math.min(b.end, projectedStart + dur) - Math.max(b.start, projectedStart));
                                                                                                        if (overlapA !== overlapB) return overlapB - overlapA;
                                                                                                        const elemCenter = projectedStart + dur / 2;
                                                                                                        return Math.abs((a.start + a.end) / 2 - elemCenter) - Math.abs((b.start + b.end) / 2 - elemCenter);
                                                                                                    })[0];
                                                                                                }

                                                                                                let safeStart = projectedStart;
                                                                                                const hoveredTrackConfig = tracks.find(t => t.id === hoveredTrackId);
                                                                                                
                                                                                                if (hoveredTrackConfig && !hoveredTrackConfig.magnet) {
                                                                                                    const leftWall = currentActiveGap ? currentActiveGap.start : 0;
                                                                                                    const rightWall = currentActiveGap ? currentActiveGap.end : TOTAL;
                                                                                                    const safeRight = Math.max(leftWall, rightWall - dur);
                                                                                                    safeStart = Math.max(leftWall, Math.min(safeRight, projectedStart));
                                                                                                }

                                                                                                const varMode = getVariantMode(el.elementId);
                                                                                                setElements(prev => prev.map(x => 
                                                                                                    x.elementId === el.elementId 
                                                                                                        ? applyToElement({ ...x, trackId: hoveredTrackId }, { startTime: Math.round(safeStart * 1000) / 1000 }, varMode) 
                                                                                                        : x
                                                                                                ));
                                                                                            };
                                                                                            const onUp = () => {
                                                                                                window.removeEventListener('pointermove', onMove);
                                                                                                window.removeEventListener('pointerup', onUp);
                                                                                            };
                                                                                            window.addEventListener('pointermove', onMove);
                                                                                            window.addEventListener('pointerup', onUp);
                                                                                        };

                                                                                        const handleEdgeDrag = (edge: 'left' | 'right', e: React.PointerEvent) => {
                                                                                            e.stopPropagation();
                                                                                            e.preventDefault();
                                                                                            if (track.magnet) return;
                                                                                            const target = (e.currentTarget as HTMLElement).closest('.relative.h-8') as HTMLElement;
                                                                                            if (!target) return;
                                                                                            const startX = e.clientX;
                                                                                            const origStart = effectiveEl.startTime;
                                                                                            const origDur = effectiveEl.duration;

                                                                                            const occupied = elements
                                                                                                .filter(o => o.elementId !== el.elementId && (o.trackId || 'track-0') === (el.trackId || 'track-0'))
                                                                                                .map(o => {
                                                                                                    const t = elementTimings.get(o.elementId) || { startTime: o.startTime, duration: o.duration };
                                                                                                    return { start: t.startTime, end: t.startTime + t.duration };
                                                                                                })
                                                                                                .sort((a, b) => a.start - b.start);

                                                                                            const merged: { start: number; end: number }[] = [];
                                                                                            for (const occ of occupied) {
                                                                                                if (merged.length > 0 && occ.start <= merged[merged.length - 1].end + 0.01) {
                                                                                                    merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, occ.end);
                                                                                                } else {
                                                                                                    merged.push({ ...occ });
                                                                                                }
                                                                                            }

                                                                                            const gaps: { start: number; end: number }[] = [];
                                                                                            let gapCursor = 0;
                                                                                            for (const m of merged) {
                                                                                                if (m.start > gapCursor + 0.01) {
                                                                                                    gaps.push({ start: gapCursor, end: m.start });
                                                                                                }
                                                                                                gapCursor = Math.max(gapCursor, m.end);
                                                                                            }
                                                                                            if (gapCursor < TOTAL - 0.01) {
                                                                                                gaps.push({ start: gapCursor, end: TOTAL });
                                                                                            }

                                                                                            const activeGap = gaps.sort((a, b) => {
                                                                                                const overlapA = Math.max(0, Math.min(a.end, origStart + origDur) - Math.max(a.start, origStart));
                                                                                                const overlapB = Math.max(0, Math.min(b.end, origStart + origDur) - Math.max(b.start, origStart));
                                                                                                if (overlapA !== overlapB) return overlapB - overlapA;
                                                                                                const elemCenter = origStart + origDur / 2;
                                                                                                return Math.abs((a.start + a.end) / 2 - elemCenter) - Math.abs((b.start + b.end) / 2 - elemCenter);
                                                                                            })[0];
                                                                                            const leftLimit = activeGap ? activeGap.start : 0;
                                                                                            const rightLimit = activeGap ? activeGap.end : TOTAL;
                                                                                            
                                                                                            (e.target as HTMLElement).setPointerCapture(e.pointerId);
                                                                                            
                                                                                            const onMove = (ev: PointerEvent) => {
                                                                                                const trackRect = target.getBoundingClientRect();
                                                                                                const dx = ev.clientX - startX;
                                                                                                const dTime = (dx / trackRect.width) * TOTAL;
                                                                                            
                                                                                                if (edge === 'left') {
                                                                                                    let newStart = Math.max(leftLimit, origStart + dTime);
                                                                                                    let newDur = origDur - (newStart - origStart);
                                                                                                    if (newDur < 0.5) { newStart = origStart + origDur - 0.5; newDur = 0.5; }
                                                                                            
                                                                                                    if (isMediaEl) {
                                                                                                        const maxAllowedDur = getMediaDurationLimit(el, activeVariantMode, collections, TOTAL_DURATION);
                                                                                                        if (newDur > maxAllowedDur) { newDur = maxAllowedDur; newStart = origStart + origDur - newDur; }
                                                                                                    }
                                                                                            
                                                                                                    const varMode = getVariantMode(el.elementId);
                                                                                                    const updates: Partial<CanvasElement> = { startTime: Math.round(newStart * 1000) / 1000, duration: Math.round(newDur * 1000) / 1000 };
                                                                                                    if (isMediaEl) {
                                                                                                        const startDelta = newStart - origStart;
                                                                                                        updates.mediaOffset = Math.max(0, Math.round(((effectiveEl.mediaOffset ?? 0) + startDelta) * 1000) / 1000);
                                                                                                    }
                                                                                                    setElements(prev => prev.map(x => x.elementId === el.elementId ? applyToElement(x, updates, varMode) : x));
                                                                                                } else {
                                                                                                    let newDur = Math.max(0.5, Math.min(rightLimit - origStart, origDur + dTime));
                                                                                                    if (isMediaEl) {
                                                                                                        const maxAllowedDur = getMediaDurationLimit(el, activeVariantMode, collections, TOTAL_DURATION);
                                                                                                        newDur = Math.min(newDur, maxAllowedDur);
                                                                                                    }
                                                                                                    const varMode = getVariantMode(el.elementId);
                                                                                                    setElements(prev => prev.map(x => x.elementId === el.elementId ? applyToElement(x, { duration: Math.round(newDur * 1000) / 1000 }, varMode) : x));
                                                                                                }
                                                                                            };
                                                                                            const onUp = () => {
                                                                                                window.removeEventListener('pointermove', onMove);
                                                                                                window.removeEventListener('pointerup', onUp);
                                                                                            };
                                                                                            window.addEventListener('pointermove', onMove);
                                                                                            window.addEventListener('pointerup', onUp);
                                                                                        };

                                                                                        const colors = COLLECTION_COLORS[el.collectionType];
                                                                                        const isSelected = selectedElementId === el.elementId;
                                                                                        const col = collections.find(c => c.id === el.collectionId);
                                                                                        const elVarMode = getVariantMode(el.elementId);
                                                                                        const editingVariantStr = elVarMode !== 'all' ? col?.items.find(v => v.id === elVarMode)?.label : null;
                                                                                        const displayText = editingVariantStr ? `${el.title} [${editingVariantStr}]` : el.title;

                                                                                        return (
                                                                                            <div key={el.elementId} className="track-element-clip absolute top-1 bottom-1 rounded overflow-hidden bg-black border border-white/10 shrink-0"
                                                                                                style={{
                                                                                                    left: `${(effectiveEl.startTime / TOTAL) * 100}%`,
                                                                                                    width: `${(effectiveEl.duration / TOTAL) * 100}%`,
                                                                                                    zIndex: el.zIndex
                                                                                                }}>
                                                                                                <div
                                                                                                    className={cn(
                                                                                                        "absolute inset-0 rounded flex items-center shrink-0 min-w-[20px] transition-colors",
                                                                                                        timelineTool === 'split' ? "" : "cursor-grab active:cursor-grabbing",
                                                                                                        isMediaAllMode
                                                                                                            ? (selectedElementId === el.elementId ? 'bg-gray-600/60 border border-gray-400/50' : 'bg-gray-700/40 border border-transparent hover:bg-gray-600/40')
                                                                                                            : (selectedElementId === el.elementId ? 'bg-blue-600 border border-blue-400' : 'bg-blue-900 border border-transparent hover:bg-blue-800')
                                                                                                    )}
                                                                                                    style={{
                                                                                                        cursor: timelineTool === 'split' ? `url('data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>')}') 12 12, crosshair` : undefined
                                                                                                    }}
                                                                                                    onClick={(e) => {
                                                                                                        e.stopPropagation();
                                                                                                        if (timelineTool === 'pointer') {
                                                                                                            setSelectedElementId(el.elementId);
                                                                                                        }
                                                                                                    }}
                                                                                                    onPointerDown={(e) => {
                                                                                                        e.stopPropagation();
                                                                                                        if (isMediaAllMode) setSelectedElementId(el.elementId);
                                                                                                        if (timelineTool === 'split') {
                                                                                                            const trackElement = e.currentTarget.parentElement?.parentElement;
                                                                                                            if (!trackElement) return;
                                                                                                            const trackRect = trackElement.getBoundingClientRect();
                                                                                                            const px = e.clientX - trackRect.left;
                                                                                                            const splitPxTime = (px / trackRect.width) * TOTAL;
                                                                                                            handleSplit(el.elementId, splitPxTime);
                                                                                                            return;
                                                                                                        }
                                                                                                        handleSegmentDrag(e);
                                                                                                    }}
                                                                                                    onPointerMove={(e) => {
                                                                                                        if (timelineTool === 'split') {
                                                                                                            const trackElement = e.currentTarget.parentElement?.parentElement;
                                                                                                            if (!trackElement) return;
                                                                                                            const trackRect = trackElement.getBoundingClientRect();
                                                                                                            const px = e.clientX - trackRect.left;
                                                                                                            const hoverTime = (px / trackRect.width) * TOTAL;
                                                                                                            if (hoverTime > effectiveEl.startTime + 0.1 && hoverTime < effectiveEl.startTime + effectiveEl.duration - 0.1) {
                                                                                                                setSplitHoverPosition({ elementId: el.elementId, time: hoverTime, relativePx: px });
                                                                                                            } else {
                                                                                                                setSplitHoverPosition(null);
                                                                                                            }
                                                                                                        }
                                                                                                    }}
                                                                                                    onPointerLeave={() => {
                                                                                                        if (timelineTool === 'split' && splitHoverPosition?.elementId === el.elementId) {
                                                                                                            setSplitHoverPosition(null);
                                                                                                        }
                                                                                                    }}
                                                                                                >
                                                                                                    {!isMediaAllMode && (
                                                                                                        <div
                                                                                                            className={cn("absolute left-0 top-0 bottom-0 w-2 hover:bg-white/30 z-10", timelineTool === 'split' ? "pointer-events-none" : "cursor-ew-resize")}
                                                                                                            onPointerDown={(e) => {
                                                                                                                if (timelineTool === 'split') return;
                                                                                                                handleEdgeDrag('left', e);
                                                                                                            }}
                                                                                                        />
                                                                                                    )}
                                                                                                    {(el.collectionType === 'audio' || el.collectionType === 'video') && (
                                                                                                        <TimelineWaveform
                                                                                                            elementId={el.elementId}
                                                                                                            collectionType={el.collectionType}
                                                                                                            segPxWidth={Math.round((effectiveEl.duration / TOTAL) * Math.max(100, TOTAL_DURATION * 20))}
                                                                                                        />
                                                                                                    )}
                                                                                                    <span className="text-[9px] font-mono text-white/90 truncate px-2 select-none z-[1] pointer-events-none relative">
                                                                                                        {isMediaAllMode ? `${displayText} ⬦` : displayText}
                                                                                                    </span>
                                                                                                    {!isMediaAllMode && (
                                                                                                        <div
                                                                                                            className={cn("absolute right-0 top-0 bottom-0 w-2 hover:bg-white/30 z-10", timelineTool === 'split' ? "pointer-events-none" : "cursor-ew-resize")}
                                                                                                            onPointerDown={(e) => {
                                                                                                                if (timelineTool === 'split') return;
                                                                                                                handleEdgeDrag('right', e);
                                                                                                            }}
                                                                                                        />
                                                                                                    )}
                                                                                                </div>
                                                                                                {timelineTool === 'split' && splitHoverPosition?.elementId === el.elementId && (
                                                                                                    <div
                                                                                                        className="absolute top-0 bottom-0 w-[1px] border-l border-dashed border-red-500 z-50 pointer-events-none"
                                                                                                        style={{ left: `${((splitHoverPosition.time - effectiveEl.startTime) / effectiveEl.duration) * 100}%` }}
                                                                                                    />
                                                                                                )}
                                                                                            </div>
                                                                                        );
                                                                                    })}
                                                                                    </div>
                                                                                </div>
                                                                            );
                                                                        })}
                                                                        <div className="h-[48px] shrink-0 pointer-events-none" />
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* Right Sidebar - Inspector */}
                    <aside className="w-80 border-l border-white/5 flex flex-col bg-[#0a0a0a] shrink-0">
                        <div className="px-5 py-3.5 border-b border-white/5 shrink-0">
                            <h2 className="text-[10px] font-bold uppercase tracking-widest text-gray-500 font-mono flex items-center gap-1.5">
                                <SlidersHorizontal className="w-3 h-3" /> Inspector
                            </h2>
                        </div>

                        <div className="flex-1 overflow-y-auto p-5 custom-scrollbar">
                            {!selectedElement ? (
                                <div className="h-40 flex items-center justify-center text-xs text-gray-600 text-center px-4 font-mono">
                                    Select a layer on the canvas to inspect.
                                </div>
                            ) : (
                                <div className="space-y-5">
                                    {/* Header */}
                                    <div className="flex items-center justify-between pb-4 border-b border-white/5">
                                        <div>
                                            <span className="text-[9px] uppercase text-blue-400 font-bold tracking-widest">{selectedElement.collectionType}</span>
                                            <h3 className="text-white font-semibold text-sm mt-0.5">{selectedElement.title}</h3>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <button
                                                onClick={() => updateSelected({ visible: !(selectedElement.visible !== false) })}
                                                className={cn("p-1.5 rounded-md transition-colors", selectedElement.visible !== false ? "bg-white/5 text-white hover:bg-white/10" : "bg-red-500/10 text-red-500/60 hover:bg-red-500/20")}
                                                title={selectedElement.visible !== false ? "Hide in preview" : "Show in preview"}
                                            >
                                                {selectedElement.visible !== false ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                                            </button>
                                            <button
                                                onClick={() => setInspectorLocked(!inspectorLocked)}
                                                className={cn("p-1.5 rounded-md transition-colors", inspectorLocked ? "bg-amber-500/20 text-amber-500 hover:bg-amber-500/30" : "bg-white/5 text-white/50 hover:bg-white/10 hover:text-white")}
                                                title={inspectorLocked ? "Unlock Selection" : "Lock Selection"}
                                            >
                                                {inspectorLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                                            </button>
                                            <button
                                                onClick={() => {
                                                    const curTrackId = selectedElement.trackId || 'track-0';
                                                    const curIdx = tracks.findIndex(t => t.id === curTrackId);
                                                    if (curIdx > 0) {
                                                        const newTrackId = tracks[curIdx - 1].id;
                                                        setElements(prev => prev.map(e => e.elementId === selectedElement.elementId ? { ...e, trackId: newTrackId } : e));
                                                    }
                                                }}
                                                className="p-1.5 bg-white/5 text-white/50 hover:bg-white/10 hover:text-white rounded-md transition-colors"
                                                title="Move Element to Track Above"
                                            >
                                                <ArrowUp className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => {
                                                    const curTrackId = selectedElement.trackId || 'track-0';
                                                    const curIdx = tracks.findIndex(t => t.id === curTrackId);
                                                    if (curIdx >= 0 && curIdx < tracks.length - 1) {
                                                        const newTrackId = tracks[curIdx + 1].id;
                                                        setElements(prev => prev.map(e => e.elementId === selectedElement.elementId ? { ...e, trackId: newTrackId } : e));
                                                    }
                                                }}
                                                className="p-1.5 bg-white/5 text-white/50 hover:bg-white/10 hover:text-white rounded-md transition-colors"
                                                title="Move Element to Track Below"
                                            >
                                                <ArrowDown className="w-4 h-4" />
                                            </button>
                                            <button onClick={removeSelected} className="p-1.5 bg-red-500/10 text-red-500 rounded-md hover:bg-red-500/20 transition-colors" title="Delete">
                                                <X className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Universal Variant Selector */}
                                    {(() => {
                                        const col = collections.find(c => c.id === selectedElement.collectionId);
                                        const variants = col?.items || [];
                                        if (variants.length === 0) return (
                                            <div className="bg-[#111] rounded-lg border border-dashed border-white/5 px-3 py-3 text-center">
                                                <span className="text-[10px] text-gray-600 font-mono">Add variants in the collection to customize per-variant</span>
                                            </div>
                                        );
                                        return (
                                            <div className="space-y-2 pb-4 border-b border-white/5">
                                                <h4 className="text-[9px] font-bold uppercase tracking-widest text-gray-500 font-mono flex items-center gap-1.5">
                                                    <Shuffle className="w-3 h-3 text-cyan-400" /> Editing Variant
                                                    <span className="text-cyan-400/60">({variants.length})</span>
                                                </h4>
                                                <div className="flex flex-wrap gap-1">
                                                    {variants.length > 1 && (
                                                        <button
                                                            onClick={() => setVariantMode(selectedElement.elementId, 'all')}
                                                            className={cn("px-2.5 py-1.5 rounded-md text-[9px] font-mono font-bold uppercase tracking-wide transition-all border", selectedVariantMode === 'all' ? "bg-cyan-500/20 border-cyan-500/40 text-cyan-300 shadow-[0_0_8px_rgba(6,182,212,0.15)]" : "bg-white/5 border-white/5 text-gray-500 hover:text-gray-300 hover:bg-white/10")}
                                                        >
                                                            ✦ All
                                                        </button>
                                                    )}
                                                    {variants.map(v => (
                                                        <button
                                                            key={v.id}
                                                            onClick={() => setVariantMode(selectedElement.elementId, v.id)}
                                                            className={cn("px-2.5 py-1.5 rounded-md text-[9px] font-mono transition-all border truncate max-w-[100px]", selectedVariantMode === v.id ? "bg-blue-500/20 border-blue-500/40 text-blue-300 shadow-[0_0_8px_rgba(59,130,246,0.15)]" : "bg-white/5 border-white/5 text-gray-500 hover:text-gray-300 hover:bg-white/10")}
                                                            title={v.label}
                                                        >
                                                            {v.label}
                                                        </button>
                                                    ))}
                                                </div>
                                                {selectedVariantMode !== 'all' && (
                                                    <p className="text-[8px] font-mono text-blue-400/50">Changes only apply to this variant</p>
                                                )}
                                            </div>
                                        );
                                    })()}

                                    {/* Position & Size */}
                                    <div className="space-y-3">
                                        <h4 className="text-[9px] font-bold uppercase tracking-widest text-gray-500 font-mono">Transform</h4>
                                        <div className="grid grid-cols-2 gap-2">
                                            {[
                                                { label: "X", key: "x" as const },
                                                { label: "Y", key: "y" as const },
                                            ].map(({ label, key }) => (
                                                <div key={key} className="flex items-center bg-[#111] rounded-md border border-white/10 px-2.5 py-2 focus-within:border-blue-500/50 transition-colors">
                                                    <span className="text-gray-500 text-[10px] font-mono mr-2 w-3">{label}</span>
                                                    <input
                                                        type="number"
                                                        value={Math.round((effectiveElement || selectedElement)[key])}
                                                        onChange={e => updateSelected({ [key]: Number(e.target.value) })}
                                                        className="bg-transparent text-white text-xs w-full focus:outline-none font-mono"
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <div className="flex-1 flex items-center bg-[#111] rounded-md border border-white/10 px-2.5 py-2 focus-within:border-blue-500/50 transition-colors">
                                                <span className="text-gray-500 text-[10px] font-mono mr-2 w-3">W</span>
                                                <input
                                                    type="number"
                                                    value={Math.round((effectiveElement || selectedElement).width)}
                                                    onChange={e => {
                                                        const el = effectiveElement || selectedElement;
                                                        const w = Number(e.target.value);
                                                        const updates: Partial<CanvasElement> = { width: w };
                                                        if (el.aspectRatioLocked && el.width && el.height) {
                                                            updates.height = w / (el.width / el.height);
                                                        }
                                                        updateSelected(updates);
                                                    }}
                                                    className="bg-transparent text-white text-xs w-full focus:outline-none font-mono"
                                                />
                                            </div>
                                            <button
                                                onClick={() => {
                                                    const el = effectiveElement || selectedElement;
                                                    updateSelected({ aspectRatioLocked: !el.aspectRatioLocked });
                                                }}
                                                className={cn("p-1.5 rounded-md transition-colors border", (effectiveElement || selectedElement).aspectRatioLocked ? "bg-cyan-500/20 text-cyan-400 border-cyan-500/40" : "bg-white/5 text-gray-500 hover:text-gray-300 border-white/5")}
                                                title={(effectiveElement || selectedElement).aspectRatioLocked ? "Unlock Aspect Ratio" : "Lock Aspect Ratio"}
                                            >
                                                {(effectiveElement || selectedElement).aspectRatioLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                                            </button>
                                            <div className="flex-1 flex items-center bg-[#111] rounded-md border border-white/10 px-2.5 py-2 focus-within:border-blue-500/50 transition-colors">
                                                <span className="text-gray-500 text-[10px] font-mono mr-2 w-3">H</span>
                                                <input
                                                    type="number"
                                                    value={Math.round((effectiveElement || selectedElement).height)}
                                                    onChange={e => {
                                                        const el = effectiveElement || selectedElement;
                                                        const h = Number(e.target.value);
                                                        const updates: Partial<CanvasElement> = { height: h };
                                                        if (el.aspectRatioLocked && el.width && el.height) {
                                                            updates.width = h * (el.width / el.height);
                                                        }
                                                        updateSelected(updates);
                                                    }}
                                                    className="bg-transparent text-white text-xs w-full focus:outline-none font-mono"
                                                />
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <div className="flex items-center bg-[#111] rounded-md border border-white/10 px-2.5 py-2 focus-within:border-blue-500/50 transition-colors">
                                                <span className="text-[10px] text-gray-500 font-mono mr-2 w-4">R°</span>
                                                <input type="number" value={(effectiveElement || selectedElement).rotation || 0} onChange={e => updateSelected({ rotation: Number(e.target.value) })} className="bg-transparent text-white text-[11px] w-full focus:outline-none font-mono" />
                                            </div>
                                            <div className="flex items-center bg-[#111] rounded-md border border-white/10 px-2.5 py-2 focus-within:border-blue-500/50 transition-colors">
                                                <Layers className="text-gray-500 w-3 h-3 mr-2" />
                                                <span className="text-[10px] text-gray-500 font-mono mr-2">Z</span>
                                                <input type="number" value={(effectiveElement || selectedElement).zIndex} onChange={e => updateSelected({ zIndex: Number(e.target.value) })} className="bg-transparent text-white text-[11px] w-full focus:outline-none font-mono" />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Text Content — only for text elements when a specific variant is selected */}
                                    {selectedElement.collectionType === 'text' && selectedVariantMode !== 'all' && (() => {
                                        const col = collections.find(c => c.id === selectedElement.collectionId);
                                        const variant = col?.items.find(v => v.id === selectedVariantMode);
                                        if (!variant || !col) return null;
                                        return (
                                            <div className="space-y-3 pt-4 border-t border-white/5">
                                                <h4 className="text-[9px] font-bold uppercase tracking-widest text-gray-500 font-mono">Content</h4>
                                                <textarea
                                                    value={variant.value}
                                                    onChange={e => {
                                                        setCollections(prev => prev.map(c =>
                                                            c.id === col.id ? { ...c, items: c.items.map(v => v.id === variant.id ? { ...v, value: e.target.value } : v) } : c
                                                        ));
                                                    }}
                                                    className="w-full bg-[#111] rounded-md border border-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50 transition-colors min-h-[80px] resize-none"
                                                    placeholder="Edit variant content..."
                                                />
                                            </div>
                                        );
                                    })()}

                                    {/* Text Style */}
                                    {selectedElement.collectionType === 'text' && (
                                        <div className="space-y-3 pt-4 border-t border-white/5">
                                            <h4 className="text-[9px] font-bold uppercase tracking-widest text-gray-500 font-mono">Text Style</h4>
                                            {/* Font Size & Line Height */}
                                            <div className="grid grid-cols-2 gap-2">
                                                <div className="flex items-center bg-[#111] rounded-md border border-white/10 px-2.5 py-2 focus-within:border-blue-500/50 transition-colors">
                                                    <span className="text-[10px] text-gray-500 font-mono mr-2">Sz</span>
                                                    <input type="number" value={(effectiveElement || selectedElement).fontSize || 16} min={8} max={200} onChange={e => updateSelected({ fontSize: Number(e.target.value) })} className="bg-transparent text-white text-[11px] w-full focus:outline-none font-mono" />
                                                </div>
                                                <div className="flex items-center bg-[#111] rounded-md border border-white/10 px-2.5 py-2 focus-within:border-blue-500/50 transition-colors">
                                                    <span className="text-[10px] text-gray-500 font-mono mr-2">Lh</span>
                                                    <input type="number" step={0.1} value={(effectiveElement || selectedElement).lineHeight || 1.4} min={0.5} max={5} onChange={e => updateSelected({ lineHeight: Number(e.target.value) })} className="bg-transparent text-white text-[11px] w-full focus:outline-none font-mono" />
                                                </div>
                                            </div>
                                            {/* Letter Spacing */}
                                            <div className="flex items-center bg-[#111] rounded-md border border-white/10 px-2.5 py-2 focus-within:border-blue-500/50 transition-colors">
                                                <span className="text-[10px] text-gray-500 font-mono mr-2 whitespace-nowrap">Tracking</span>
                                                <input type="number" step={0.5} value={(effectiveElement || selectedElement).letterSpacing || 0} min={-5} max={20} onChange={e => updateSelected({ letterSpacing: Number(e.target.value) })} className="bg-transparent text-white text-[11px] w-full focus:outline-none font-mono" />
                                                <span className="text-[9px] text-gray-600 font-mono ml-1">px</span>
                                            </div>
                                            {/* Bold / Italic / Underline toggles */}
                                            <div className="flex gap-1.5">
                                                <button
                                                    onClick={() => updateSelected({ fontWeight: (effectiveElement || selectedElement).fontWeight === 'bold' ? 'normal' : 'bold' })}
                                                    className={cn("flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md border text-[10px] font-mono transition-all", (effectiveElement || selectedElement).fontWeight === 'bold' || !(effectiveElement || selectedElement).fontWeight ? "bg-white/10 border-white/20 text-white" : "bg-transparent border-white/5 text-gray-500 hover:border-white/15")}
                                                >
                                                    <Bold className="w-3 h-3" /> Bold
                                                </button>
                                                <button
                                                    onClick={() => updateSelected({ fontStyle: (effectiveElement || selectedElement).fontStyle === 'italic' ? 'normal' : 'italic' })}
                                                    className={cn("flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md border text-[10px] font-mono transition-all", (effectiveElement || selectedElement).fontStyle === 'italic' ? "bg-white/10 border-white/20 text-white" : "bg-transparent border-white/5 text-gray-500 hover:border-white/15")}
                                                >
                                                    <Italic className="w-3 h-3" /> Italic
                                                </button>
                                                <button
                                                    onClick={() => updateSelected({ textDecoration: (effectiveElement || selectedElement).textDecoration === 'underline' ? 'none' : 'underline' })}
                                                    className={cn("flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md border text-[10px] font-mono transition-all", (effectiveElement || selectedElement).textDecoration === 'underline' ? "bg-white/10 border-white/20 text-white" : "bg-transparent border-white/5 text-gray-500 hover:border-white/15")}
                                                >
                                                    <Underline className="w-3 h-3" /> Under
                                                </button>
                                            </div>
                                            {/* Text Alignment */}
                                            <div className="flex gap-1.5">
                                                {([['left', AlignLeft], ['center', AlignCenter], ['right', AlignRight]] as const).map(([align, Icon]) => (
                                                    <button
                                                        key={align}
                                                        onClick={() => updateSelected({ textAlign: align })}
                                                        className={cn("flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md border text-[10px] font-mono transition-all capitalize", ((effectiveElement || selectedElement).textAlign || 'center') === align ? "bg-white/10 border-white/20 text-white" : "bg-transparent border-white/5 text-gray-500 hover:border-white/15")}
                                                    >
                                                        <Icon className="w-3 h-3" /> {align}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Volume Config */}
                                    {(selectedElement.collectionType === 'video' || selectedElement.collectionType === 'audio') && (
                                        <div className="space-y-3 pt-4 border-t border-white/5">
                                            <h4 className="text-[9px] font-bold uppercase tracking-widest text-gray-500 font-mono">Volume & Speed</h4>

                                            <div className="flex justify-between text-xs text-gray-400 mt-2">
                                                <span>Volume</span>
                                                <span className="text-white font-mono font-medium">{Math.round(((effectiveElement || selectedElement).volume ?? 1) * 100)}%</span>
                                            </div>
                                            <input
                                                type="range" min="0" max="1" step="0.05"
                                                value={(effectiveElement || selectedElement).volume ?? 1}
                                                onChange={e => updateSelected({ volume: Number(e.target.value) })}
                                                className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-blue-500"
                                            />
                                        </div>
                                    )}

                                    {/* Media Trim Config */}
                                    {(selectedElement.collectionType === 'video' || selectedElement.collectionType === 'audio') && selectedVariantMode !== 'all' && (
                                        <div className="space-y-3 pt-4 border-t border-white/5">
                                            <h4 className="text-[9px] font-bold uppercase tracking-widest text-gray-500 font-mono">Media Trim</h4>
                                            <div className="grid grid-cols-2 gap-2">
                                                <div className="flex items-center bg-[#111] rounded-md border border-white/10 px-2.5 py-2 focus-within:border-blue-500/50 transition-colors">
                                                    <span className="text-[10px] text-gray-500 font-mono mr-2">Start</span>
                                                    <input
                                                        type="number"
                                                        step="0.1"
                                                        min="0"
                                                        value={Math.round(((effectiveElement || selectedElement).mediaOffset || 0) * 10) / 10}
                                                        onChange={e => {
                                                            const newStart = Math.max(0, Number(e.target.value));
                                                            updateSelected({ mediaOffset: newStart });
                                                        }}
                                                        className="bg-transparent text-white text-[11px] w-full focus:outline-none font-mono"
                                                    />
                                                </div>
                                                <div className="flex items-center bg-[#111] rounded-md border border-white/10 px-2.5 py-2 focus-within:border-blue-500/50 transition-colors">
                                                    <span className="text-[10px] text-gray-500 font-mono mr-2">End</span>
                                                    <input
                                                        type="number"
                                                        step="0.1"
                                                        min="0.1"
                                                        value={Math.round((((effectiveElement || selectedElement).mediaOffset || 0) + (effectiveElement || selectedElement).duration) * 10) / 10}
                                                        onChange={e => {
                                                            const newEnd = Math.max(0.1, Number(e.target.value));
                                                            const currentStart = (effectiveElement || selectedElement).mediaOffset || 0;
                                                            if (newEnd > currentStart) {
                                                                updateSelected({ duration: newEnd - currentStart });
                                                            }
                                                        }}
                                                        className="bg-transparent text-white text-[11px] w-full focus:outline-none font-mono"
                                                    />
                                                </div>
                                            </div>
                                            <p className="text-[8px] font-mono text-gray-600">Trims source media. To move on timeline, drag element horizontally.</p>
                                        </div>
                                    )}



                                    {/* Animations */}
                                    <div className="space-y-3 pt-4 border-t border-white/5">
                                        <div className="flex items-center justify-between">
                                            <h4 className="text-[9px] font-bold uppercase tracking-widest text-gray-500 font-mono flex items-center gap-1.5">
                                                <Sparkles className="w-3 h-3 text-purple-400" /> Animations
                                                <span className="text-purple-400/60">({((effectiveElement || selectedElement).animations || []).length})</span>
                                            </h4>
                                        </div>

                                        {/* Add animation dropdown */}
                                        <div className="relative">
                                            <select
                                                className="w-full bg-[#111] border border-white/10 rounded px-2 py-1.5 text-[10px] font-mono text-white appearance-none cursor-pointer focus:outline-none focus:border-purple-400/50"
                                                value=""
                                                onChange={e => {
                                                    if (!e.target.value) return;
                                                    const newAnim: ElementAnimation = {
                                                        id: `anim-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
                                                        type: e.target.value as AnimationType,
                                                        start: 0,
                                                        duration: 0.5,
                                                        easing: 'easeOut',
                                                    };
                                                    updateSelected({ animations: [...((effectiveElement || selectedElement).animations || []), newAnim] });
                                                    e.target.value = '';
                                                }}
                                            >
                                                <option value="">+ Add Animation...</option>
                                                <optgroup label="— Entrance">
                                                    {Object.entries(ANIMATION_PRESETS).filter(([, v]) => v.category === 'in').map(([key, v]) => (
                                                        <option key={key} value={key}>{v.label}</option>
                                                    ))}
                                                </optgroup>
                                                <optgroup label="— Exit">
                                                    {Object.entries(ANIMATION_PRESETS).filter(([, v]) => v.category === 'out').map(([key, v]) => (
                                                        <option key={key} value={key}>{v.label}</option>
                                                    ))}
                                                </optgroup>
                                            </select>
                                            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-500 pointer-events-none" />
                                        </div>

                                        {/* Animation list */}
                                        {((effectiveElement || selectedElement).animations || []).length === 0 ? (
                                            <p className="text-[10px] font-mono text-gray-600 text-center py-2">No animations yet.</p>
                                        ) : (
                                            <div className="space-y-1.5">
                                                {((effectiveElement || selectedElement).animations || []).map(anim => {
                                                    const preset = ANIMATION_PRESETS[anim.type];
                                                    const isIn = preset.category === 'in';
                                                    return (
                                                        <div key={anim.id} className={cn(
                                                            "rounded border p-2.5 space-y-2 transition-colors",
                                                            isIn ? "bg-green-500/5 border-green-500/20" : "bg-orange-500/5 border-orange-500/20"
                                                        )}>
                                                            {/* Header */}
                                                            <div className="flex items-center justify-between">
                                                                <div className="flex items-center gap-1.5">
                                                                    <div className={cn("w-1.5 h-1.5 rounded-full", isIn ? "bg-green-400" : "bg-orange-400")} />
                                                                    <span className="text-[10px] font-mono text-white font-medium">{preset.label}</span>
                                                                </div>
                                                                <button
                                                                    onClick={() => updateSelected({ animations: ((effectiveElement || selectedElement).animations || []).filter(a => a.id !== anim.id) })}
                                                                    className="p-0.5 text-red-500/40 hover:text-red-400 transition-colors"
                                                                >
                                                                    <Trash2 className="w-3 h-3" />
                                                                </button>
                                                            </div>
                                                            {/* Controls */}
                                                            <div className="grid grid-cols-3 gap-1.5">
                                                                {/* Start delay */}
                                                                <div className="space-y-0.5">
                                                                    <span className="text-[7px] font-mono text-gray-600 uppercase">Start</span>
                                                                    <input
                                                                        type="number" step="0.1" min="0" max={(effectiveElement || selectedElement).duration}
                                                                        value={anim.start}
                                                                        onChange={e => {
                                                                            const updated = ((effectiveElement || selectedElement).animations || []).map(a =>
                                                                                a.id === anim.id ? { ...a, start: Math.max(0, Number(e.target.value)) } : a
                                                                            );
                                                                            updateSelected({ animations: updated });
                                                                        }}
                                                                        className="w-full bg-black/30 rounded px-1.5 py-1 text-[9px] font-mono text-white focus:outline-none focus:ring-1 focus:ring-purple-400/40"
                                                                    />
                                                                </div>
                                                                {/* Duration */}
                                                                <div className="space-y-0.5">
                                                                    <span className="text-[7px] font-mono text-gray-600 uppercase">Duration</span>
                                                                    <input
                                                                        type="number" step="0.1" min="0.1" max={(effectiveElement || selectedElement).duration}
                                                                        value={anim.duration}
                                                                        onChange={e => {
                                                                            const updated = ((effectiveElement || selectedElement).animations || []).map(a =>
                                                                                a.id === anim.id ? { ...a, duration: Math.max(0.1, Number(e.target.value)) } : a
                                                                            );
                                                                            updateSelected({ animations: updated });
                                                                        }}
                                                                        className="w-full bg-black/30 rounded px-1.5 py-1 text-[9px] font-mono text-white focus:outline-none focus:ring-1 focus:ring-purple-400/40"
                                                                    />
                                                                </div>
                                                                {/* Easing */}
                                                                <div className="space-y-0.5">
                                                                    <span className="text-[7px] font-mono text-gray-600 uppercase">Easing</span>
                                                                    <select
                                                                        value={anim.easing}
                                                                        onChange={e => {
                                                                            const updated = (selectedElement.animations || []).map(a =>
                                                                                a.id === anim.id ? { ...a, easing: e.target.value as EasingType } : a
                                                                            );
                                                                            updateSelected({ animations: updated });
                                                                        }}
                                                                        className="w-full bg-black/30 rounded px-1.5 py-1 text-[9px] font-mono text-white appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-purple-400/40"
                                                                    >
                                                                        <option value="linear">Linear</option>
                                                                        <option value="easeIn">Ease In</option>
                                                                        <option value="easeOut">Ease Out</option>
                                                                        <option value="easeInOut">Ease In/Out</option>
                                                                        <option value="spring">Spring</option>
                                                                    </select>
                                                                </div>
                                                            </div>
                                                            {/* Scale Range (only for scale/bounce animations) */}
                                                            {(anim.type === 'scaleIn' || anim.type === 'scaleOut' || anim.type === 'bounceIn') && (
                                                                <div className="grid grid-cols-2 gap-1.5 mt-1.5">
                                                                    <div className="space-y-0.5">
                                                                        <span className="text-[7px] font-mono text-gray-600 uppercase">From</span>
                                                                        <input
                                                                            type="number" step="0.1"
                                                                            value={anim.from ?? (anim.type === 'scaleOut' ? 1 : 0)}
                                                                            onChange={e => {
                                                                                const updated = ((effectiveElement || selectedElement).animations || []).map(a =>
                                                                                    a.id === anim.id ? { ...a, from: Number(e.target.value) } : a
                                                                                );
                                                                                updateSelected({ animations: updated });
                                                                            }}
                                                                            className="w-full bg-black/30 rounded px-1.5 py-1 text-[9px] font-mono text-white focus:outline-none focus:ring-1 focus:ring-purple-400/40"
                                                                        />
                                                                    </div>
                                                                    <div className="space-y-0.5">
                                                                        <span className="text-[7px] font-mono text-gray-600 uppercase">To</span>
                                                                        <input
                                                                            type="number" step="0.1"
                                                                            value={anim.to ?? (anim.type === 'scaleOut' ? 0 : 1)}
                                                                            onChange={e => {
                                                                                const updated = ((effectiveElement || selectedElement).animations || []).map(a =>
                                                                                    a.id === anim.id ? { ...a, to: Number(e.target.value) } : a
                                                                                );
                                                                                updateSelected({ animations: updated });
                                                                            }}
                                                                            className="w-full bg-black/30 rounded px-1.5 py-1 text-[9px] font-mono text-white focus:outline-none focus:ring-1 focus:ring-purple-400/40"
                                                                        />
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </aside>
                </main>
            </div>

            <DragOverlay dropAnimation={null}>
                {activeCollection ? (
                    <div className="opacity-80 scale-105 pointer-events-none origin-top-left w-[220px]">
                        <CollectionCard collection={activeCollection} onAddItem={() => { }} onDeleteItem={() => { }} onUpdateItem={() => { }} onDeleteCollection={() => { }} />
                    </div>
                ) : null}
            </DragOverlay>

            {/* ── Export Modal ──────────────────────────────────────────────── */}
            <AnimatePresence>
                {isExportModalOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[200] flex items-center justify-center p-4"
                        onClick={e => { if (e.target === e.currentTarget && !renderProgress) setIsExportModalOpen(false); }}
                    >
                        <motion.div
                            initial={{ scale: 0.92, opacity: 0, y: 16 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.92, opacity: 0, y: 16 }}
                            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                            className="bg-[#0e0e0e] border border-white/10 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden"
                        >
                            {/* Header */}
                            <div className="flex items-center justify-between px-6 py-4 border-b border-white/8">
                                <div className="flex items-center gap-2.5">
                                    <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center">
                                        <Film className="w-4 h-4 text-white" />
                                    </div>
                                    <div>
                                        <h2 className="text-sm font-semibold text-white">Export Composition</h2>
                                        <p className="text-[10px] text-gray-500 font-mono">
                                            {exportSettings.format === 'mp4' ? 'MP4 · H.264 + AAC' : 'WebM · VP9 + Opus'}
                                        </p>
                                    </div>
                                </div>
                                {!renderProgress && (
                                    <button onClick={() => setIsExportModalOpen(false)} className="text-gray-600 hover:text-gray-300 transition-colors">
                                        <X className="w-4 h-4" />
                                    </button>
                                )}
                            </div>

                            {/* Settings (hidden once render starts) */}
                            {!renderProgress && (
                                <div className="px-6 py-5 space-y-4">
                                    {/* Format */}
                                    <div>
                                        <label className="text-[10px] font-mono uppercase tracking-widest text-gray-500 mb-2 block">Format</label>
                                        <div className="grid grid-cols-2 gap-2">
                                            {([
                                                { v: 'mp4' as RenderFormat, l: 'MP4', sub: 'H.264 + AAC · Universal' },
                                                { v: 'webm' as RenderFormat, l: 'WebM', sub: 'VP9 + Opus · Browser' },
                                            ]).map(({ v, l, sub }) => (
                                                <button
                                                    key={v}
                                                    onClick={() => setExportSettings(s => ({ ...s, format: v }))}
                                                    className={`py-2.5 px-3 rounded-lg text-left border transition-all ${exportSettings.format === v
                                                        ? 'border-white/30 bg-white/10 text-white'
                                                        : 'border-white/5 bg-white/3 text-gray-500 hover:text-gray-300 hover:border-white/10'}`}
                                                >
                                                    <div className="text-[11px] font-mono font-semibold">{l}</div>
                                                    <div className="text-[9px] text-gray-500 mt-0.5">{sub}</div>
                                                </button>
                                            ))}
                                        </div>
                                        {exportSettings.format === 'mp4' && (
                                            <p className="text-[9px] text-gray-600 mt-1.5 font-mono">Requires Chrome 94+ · Uses WebCodecs API</p>
                                        )}
                                    </div>

                                    {/* Resolution */}
                                    <div>
                                        <label className="text-[10px] font-mono uppercase tracking-widest text-gray-500 mb-2 block">Resolution</label>
                                        <div className="grid grid-cols-3 gap-2">
                                            {(['1080x1920', '720x1280', '540x960'] as const).map(r => (
                                                <button
                                                    key={r}
                                                    onClick={() => setExportSettings(s => ({ ...s, resolution: r }))}
                                                    className={`py-2 rounded-lg text-[10px] font-mono border transition-all ${exportSettings.resolution === r
                                                        ? 'border-white/30 bg-white/10 text-white'
                                                        : 'border-white/5 bg-white/3 text-gray-500 hover:text-gray-300 hover:border-white/10'}`}
                                                >
                                                    {r.replace('x', ' × ')}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* FPS */}
                                    <div>
                                        <label className="text-[10px] font-mono uppercase tracking-widest text-gray-500 mb-2 block">Frame Rate</label>
                                        <div className="grid grid-cols-3 gap-2">
                                            {([24, 30, 60] as const).map(f => (
                                                <button
                                                    key={f}
                                                    onClick={() => setExportSettings(s => ({ ...s, fps: f }))}
                                                    className={`py-2 rounded-lg text-[10px] font-mono border transition-all ${exportSettings.fps === f
                                                        ? 'border-white/30 bg-white/10 text-white'
                                                        : 'border-white/5 bg-white/3 text-gray-500 hover:text-gray-300 hover:border-white/10'}`}
                                                >
                                                    {f} fps
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Bitrate */}
                                    <div>
                                        <label className="text-[10px] font-mono uppercase tracking-widest text-gray-500 mb-2 block">Quality</label>
                                        <div className="grid grid-cols-3 gap-2">
                                            {([{ v: 4, l: 'Draft · 4M' }, { v: 8, l: 'High · 8M' }, { v: 16, l: 'Ultra · 16M' }] as const).map(({ v, l }) => (
                                                <button
                                                    key={v}
                                                    onClick={() => setExportSettings(s => ({ ...s, bitrate: v }))}
                                                    className={`py-2 rounded-lg text-[10px] font-mono border transition-all ${exportSettings.bitrate === v
                                                        ? 'border-white/30 bg-white/10 text-white'
                                                        : 'border-white/5 bg-white/3 text-gray-500 hover:text-gray-300 hover:border-white/10'}`}
                                                >
                                                    {l}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Info row */}
                                    <div className="flex items-center gap-2 bg-amber-500/8 border border-amber-500/15 rounded-lg px-3 py-2.5">
                                        <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                        <p className="text-[10px] text-amber-300/80 leading-relaxed">
                                            Export renders frame-by-frame in your browser. Keep the tab active. Large compositions may take a few minutes.
                                        </p>
                                    </div>

                                    {renderQueue.length > 0 && (
                                        <div className="flex items-center justify-between bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-2.5 mt-2">
                                            <div className="flex items-center gap-2">
                                                <ListPlus className="w-4 h-4 text-blue-400" />
                                                <span className="text-[10px] text-blue-300 font-mono">Render Queue Active</span>
                                            </div>
                                            <div className="flex items-center gap-3 text-[10px] font-mono text-gray-400">
                                                <span>{renderQueue.length} variant(s) queued</span>
                                                <button onClick={() => setRenderQueue([])} className="text-red-400 hover:text-red-300">Clear</button>
                                            </div>
                                        </div>
                                    )}

                                    {/* Estimates */}
                                    <div className="flex justify-between text-[10px] font-mono text-gray-600">
                                        <span>Duration: <span className="text-gray-400">{TOTAL_DURATION}s</span></span>
                                        <span>Frames: <span className="text-gray-400">{TOTAL_DURATION * exportSettings.fps}</span></span>
                                        <span>~Size: <span className="text-gray-400">{Math.round(exportSettings.bitrate * TOTAL_DURATION / 8)} MB</span></span>
                                    </div>
                                </div>
                            )}

                            {/* Progress area (shown during render) */}
                            {renderProgress && (
                                <div className="px-6 py-5 space-y-4">
                                    {/* Phase icon + message */}
                                    <div className="flex items-center gap-3">
                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                                            renderProgress.phase === 'done' ? 'bg-emerald-500/20' :
                                            renderProgress.phase === 'error' ? 'bg-red-500/20' : 'bg-white/5'
                                        }`}>
                                            {renderProgress.phase === 'done' ? (
                                                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                                            ) : renderProgress.phase === 'error' ? (
                                                <AlertCircle className="w-5 h-5 text-red-400" />
                                            ) : (
                                                <Loader2 className="w-5 h-5 text-white animate-spin" />
                                            )}
                                        </div>
                                        <div>
                                            <p className="text-sm text-white font-medium">
                                                {renderProgress.phase === 'done' ? 'Export Complete!' :
                                                 renderProgress.phase === 'error' ? 'Export Failed' :
                                                 renderProgress.phase === 'preparing' ? 'Preparing…' :
                                                 renderProgress.phase === 'encoding' ? 'Encoding…' : 'Rendering…'}
                                            </p>
                                            <p className="text-[10px] text-gray-500 font-mono mt-0.5 truncate max-w-[280px]">{renderProgress.message}</p>
                                        </div>
                                    </div>

                                    {/* Progress bar */}
                                    <div className="w-full bg-white/5 rounded-full h-1.5 overflow-hidden">
                                        <motion.div
                                            className={`h-full rounded-full ${
                                                renderProgress.phase === 'done' ? 'bg-emerald-500' :
                                                renderProgress.phase === 'error' ? 'bg-red-500' : 'bg-white'
                                            }`}
                                            animate={{ width: `${Math.round(renderProgress.progress * 100)}%` }}
                                            transition={{ ease: 'linear', duration: 0.2 }}
                                            style={{ width: '0%' }}
                                        />
                                    </div>
                                    <p className="text-right text-[10px] font-mono text-gray-600">{Math.round(renderProgress.progress * 100)}%</p>

                                    {renderProgress.phase === 'error' && renderProgress.error && (
                                        <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                                            <code className="text-[9px] text-red-400 font-mono break-all">{renderProgress.error}</code>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Footer buttons */}
                            <div className="px-6 pb-5 flex gap-2">
                                {!renderProgress ? (
                                    <>
                                        <button
                                            onClick={() => setIsExportModalOpen(false)}
                                            className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white text-xs font-semibold rounded-xl border border-white/8 transition-colors"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            onClick={startRender}
                                            className="flex-1 py-2.5 bg-white hover:bg-gray-100 text-black text-xs font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
                                        >
                                            <Clapperboard className="w-3.5 h-3.5" />
                                            Start Export
                                        </button>
                                    </>
                                ) : renderProgress.phase === 'rendering' || renderProgress.phase === 'preparing' || renderProgress.phase === 'encoding' ? (
                                    <button
                                        onClick={cancelRender}
                                        className="flex-1 py-2.5 bg-red-600/20 hover:bg-red-600/30 text-red-400 text-xs font-semibold rounded-xl border border-red-500/20 transition-colors"
                                    >
                                        Cancel Render
                                    </button>
                                ) : (
                                    <button
                                        onClick={() => { setIsExportModalOpen(false); setRenderProgress(null); }}
                                        className="flex-1 py-2.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 text-xs font-semibold rounded-xl border border-emerald-500/20 transition-colors"
                                    >
                                        Close
                                    </button>
                                )}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
            <AnimatePresence>
                {toast && (
                    <motion.div
                        initial={{ opacity: 0, y: 50, scale: 0.9 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
                        className={cn(
                            "fixed bottom-6 right-6 z-[300] px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 border",
                            toast.type === 'success' ? "bg-emerald-950/80 border-emerald-500/30 text-emerald-400" : "bg-red-950/80 border-red-500/30 text-red-400"
                        )}
                    >
                        {toast.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                        <span className="text-sm font-medium">{toast.message}</span>
                        <button onClick={() => setToast(null)} className="ml-2 opacity-60 hover:opacity-100 transition-opacity">
                            <X className="w-4 h-4" />
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>
        </DndContext >
    );
}


// --- Default Export (no mount guard needed - SSR disabled via dynamic import in page.tsx) ---
export default BuilderInner;

