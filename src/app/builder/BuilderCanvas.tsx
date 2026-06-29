"use client";

import React, { useState, useEffect, useRef, useId, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    Play, Pause, Plus, Image as ImageIcon, Music, Download, Upload,
    Layers, X, Type, MonitorPlay, SlidersHorizontal, GripVertical, Shuffle, SkipBack, Video, Trash2, Sparkles, ChevronDown, ChevronLeft, ChevronRight, Eye, EyeOff,
    Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight, Scissors, MousePointer2, Settings, Lock, Unlock, ArrowUp, ArrowDown,
    Film, Loader2, CheckCircle2, AlertCircle, Clapperboard, ListPlus, Link2, Ban, RotateCcw, RotateCw, Copy, ListOrdered, ClipboardPaste, FolderOpen, MoreHorizontal
} from "lucide-react";
import Link from "next/link";
import { renderComposition, type RenderJob, type RenderProgress, type RenderElement, type RenderFormat, type RenderOutputTarget } from "./renderer";
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
import {
    createCollectionVersion,
    deleteCollectionVersion,
    getActiveCollectionVersion,
    getCollectionVersions,
    normalizeCollectionsForLoad,
    renameCollectionVersion,
    switchCollectionVersion,
    syncCollectionsWithActiveVersions,
    type CollectionVersion,
} from "./collectionVersions";

// --- Types ---
type CollectionType = "text" | "image" | "video" | "audio" | "subComposition";
type PlayableCollectionType = Exclude<CollectionType, "subComposition">;
type TimelineElementType = PlayableCollectionType | "nestedSequence";
type CollectionVisualType = CollectionType | TimelineElementType;
type VariantSelectionMode = "random" | "sequential";

interface CollectionVariant {
    id: string;
    label: string;
    value: string; // text content, URL, etc.
    duration?: number; // Intrinsic media duration in seconds
    linkedVariantIds?: string[];
    excluded?: boolean; // When true, this variant is skipped during shuffle/generation
    isNull?: boolean; // Empty variant: selected element behaves as if absent
}

interface CollectionItem {
    id: string;
    title: string;
    type: CollectionType;
    items: CollectionVariant[];
    activeVersionId?: string;
    versions?: CollectionVersion<CollectionVariant>[];
    sharedFromParent?: boolean;
}

interface TextCollectionGroup {
    id: string;
    title: string;
    collectionIds: string[];
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

interface CompositionTransform {
    x: number;
    y: number;
    width: number;
    height: number;
    rotation?: number;
    opacity?: number;
    startTime: number;
    duration: number;
    animations: ElementAnimation[];
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
    collectionType: TimelineElementType;
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
    textStrokeColor?: string; // CSS color for text outline
    textStrokeWidth?: number; // Stroke width in px (at PREVIEW_W scale)
    selectedVariantId?: string;
    animations: ElementAnimation[];
    variantOverrides?: Record<string, Partial<CanvasElement>>;
    sourceElementId?: string;
    volume?: number; // Volume from 0 to 1
    speed?: number; // Playback rate (0.25 – 4). 1 = normal
    audioFadeIn?: number; // Fade-in duration in seconds
    audioFadeOut?: number; // Fade-out duration in seconds
    randomizeWindow?: boolean; // When true, picks a random same-duration window from across the full media length
    mediaOffset?: number; // Offset into source media file (seconds), used after splitting
    syncWith?: { targetId: string; targetEdge: 'start' | 'end'; myEdge: 'start' | 'end'; edge?: 'start' | 'end' } | null;
    matchDurationWithId?: string;
    matchDurationWithIds?: string[];
    matchDurationOffsets?: Record<string, number>;
    localExcludedVariantIds?: string[]; // Variant IDs excluded only for this instance (not global)
    textCollectionMode?: string; // "all" | specific grouped text collection id
    nestedSequenceId?: string;
    variantSeedKey?: string;
    variantSelectionMode?: VariantSelectionMode;
    variantSequenceIndex?: number;
    nestedCompositionTransform?: CompositionTransform;
    nestedCompositionBlur?: number;
}

type NestedSequenceRecord = {
    id: string;
    title: string;
    duration: number;
    elements: string | CanvasElement[];
    tracks: string | TrackConfig[];
    collections: string | { items?: CollectionItem[]; textGroups?: TextCollectionGroup[]; renderQueue?: QueuedRenderJob[] } | CollectionItem[];
    parentId?: string | null;
    kind?: string;
};

type QueuedRenderJob = {
    id: string;
    name: string;
    job: RenderJob;
    usedVariantIds: string[];
};

type CollectionsClipboardPayload = {
    kind: "dropai.collections.v1";
    collections: CollectionItem[];
    textGroups?: TextCollectionGroup[];
    nestedSequences?: NestedSequenceRecord[];
};

type ElementClipboardPayload = {
    kind: "dropai.element.v1";
    element: CanvasElement;
    collection: CollectionItem;
    nestedSequences?: NestedSequenceRecord[];
};

type ParsedCollectionsPayload = {
    items: CollectionItem[];
    textGroups: TextCollectionGroup[];
    renderQueue: QueuedRenderJob[];
};

type DirectoryPickerWindow = Window & {
    showDirectoryPicker?: (options?: { mode?: "read" | "readwrite" }) => Promise<FileSystemDirectoryHandle>;
};

// --- Collection Type Styling ---
const COLLECTION_COLORS: Record<CollectionVisualType, { bg: string; border: string; text: string; icon: string }> = {
    text: { bg: "bg-amber-500/15", border: "border-amber-500/40", text: "text-amber-400", icon: "text-amber-500" },
    image: { bg: "bg-blue-500/15", border: "border-blue-500/40", text: "text-blue-400", icon: "text-blue-500" },
    video: { bg: "bg-purple-500/15", border: "border-purple-500/40", text: "text-purple-400", icon: "text-purple-500" },
    audio: { bg: "bg-emerald-500/15", border: "border-emerald-500/40", text: "text-emerald-400", icon: "text-emerald-500" },
    subComposition: { bg: "bg-violet-500/15", border: "border-violet-500/40", text: "text-violet-300", icon: "text-violet-400" },
    nestedSequence: { bg: "bg-violet-500/15", border: "border-violet-500/40", text: "text-violet-300", icon: "text-violet-400" },
};

const COLLECTION_ICONS: Record<CollectionVisualType, React.ReactNode> = {
    text: <Type className="w-3.5 h-3.5" />,
    image: <ImageIcon className="w-3.5 h-3.5" />,
    video: <MonitorPlay className="w-3.5 h-3.5" />,
    audio: <Music className="w-3.5 h-3.5" />,
    subComposition: <Film className="w-3.5 h-3.5" />,
    nestedSequence: <Film className="w-3.5 h-3.5" />,
};

const EMPTY_NESTED_COMPOSITION_DISPLAY_DURATION = 5;

function withoutSubCompositionCollections(collections: CollectionItem[]) {
    return collections.filter(collection => collection.type !== "subComposition");
}

function pruneTextGroupsForCollections(groups: TextCollectionGroup[], collections: CollectionItem[]) {
    const collectionIds = new Set(collections.map(collection => collection.id));
    return groups
        .map(group => ({
            ...group,
            collectionIds: group.collectionIds.filter(collectionId => collectionIds.has(collectionId)),
        }))
        .filter(group => group.collectionIds.length > 1);
}

function parseCollectionsPayload(input: NestedSequenceRecord["collections"] | unknown): ParsedCollectionsPayload {
    try {
        const parsed = typeof input === "string" ? JSON.parse(input || "{}") : input;
        if (Array.isArray(parsed)) {
            return { items: parsed as CollectionItem[], textGroups: [], renderQueue: [] };
        }
        if (parsed && typeof parsed === "object") {
            const wrapped = parsed as { items?: CollectionItem[]; textGroups?: TextCollectionGroup[]; renderQueue?: QueuedRenderJob[] };
            return {
                items: Array.isArray(wrapped.items) ? wrapped.items : [],
                textGroups: Array.isArray(wrapped.textGroups) ? wrapped.textGroups : [],
                renderQueue: Array.isArray(wrapped.renderQueue) ? wrapped.renderQueue : [],
            };
        }
    } catch {
        // Malformed collection payloads fall back to an empty child-local set.
    }
    return { items: [], textGroups: [], renderQueue: [] };
}

function mapCollectionVariants(
    collection: CollectionItem,
    mapper: (variant: CollectionVariant) => CollectionVariant,
): CollectionItem {
    return {
        ...collection,
        items: (collection.items || []).map(mapper),
        versions: collection.versions?.map(version => ({
            ...version,
            items: (version.items || []).map(mapper),
        })),
    };
}

function getAllCollectionVariants(collection: CollectionItem) {
    const variants: CollectionVariant[] = [...(collection.items || [])];
    collection.versions?.forEach(version => {
        variants.push(...(version.items || []));
    });
    return variants;
}

function ensureCollectionVariantIdMap(
    collection: CollectionItem,
    variantIdMap: Map<string, string>,
    createId: (variant: CollectionVariant) => string,
) {
    getAllCollectionVariants(collection).forEach(variant => {
        if (!variantIdMap.has(variant.id)) {
            variantIdMap.set(variant.id, createId(variant));
        }
    });
}

function remapCollectionVariantIds(
    collection: CollectionItem,
    variantIdMap: Map<string, string>,
    overridesByVariantId: Map<string, Partial<CollectionVariant>> = new Map(),
): CollectionItem {
    return mapCollectionVariants(collection, variant => {
        const override = overridesByVariantId.get(variant.id) || {};
        const linkedVariantIds = variant.linkedVariantIds
            ?.map(id => variantIdMap.get(id))
            .filter((id): id is string => Boolean(id));
        const nextVariant: CollectionVariant = {
            ...variant,
            ...override,
            id: variantIdMap.get(variant.id) || override.id || variant.id,
        };

        if (linkedVariantIds && linkedVariantIds.length > 0) {
            nextVariant.linkedVariantIds = linkedVariantIds;
        } else {
            delete nextVariant.linkedVariantIds;
        }

        return nextVariant;
    });
}

function stripVariantLinks(collection: CollectionItem): CollectionItem {
    return mapCollectionVariants(collection, variant => {
        const { linkedVariantIds, ...rest } = variant;
        void linkedVariantIds;
        return rest;
    });
}

function stripSharedParentFlag(collection: CollectionItem): CollectionItem {
    const { sharedFromParent, ...rest } = collection;
    void sharedFromParent;
    return rest;
}

function getLinkedVariantIdsByItemId(collection?: CollectionItem) {
    const links = new Map<string, string[] | undefined>();
    if (!collection) return links;
    const normalized = normalizeCollectionsForLoad([collection])[0];
    normalized.items.forEach(item => links.set(item.id, item.linkedVariantIds ? [...item.linkedVariantIds] : undefined));
    normalized.versions?.forEach(version => {
        version.items.forEach(item => links.set(item.id, item.linkedVariantIds ? [...item.linkedVariantIds] : undefined));
    });
    return links;
}

function applyVariantLinksFromOverlay(baseCollection: CollectionItem, overlayCollection?: CollectionItem): CollectionItem {
    const overlayLinks = getLinkedVariantIdsByItemId(overlayCollection);
    if (overlayLinks.size === 0) return baseCollection;
    return mapCollectionVariants(baseCollection, variant => {
        if (!overlayLinks.has(variant.id)) return variant;
        const linkedVariantIds = overlayLinks.get(variant.id);
        if (!linkedVariantIds || linkedVariantIds.length === 0) {
            const { linkedVariantIds: _linkedVariantIds, ...rest } = variant;
            void _linkedVariantIds;
            return rest;
        }
        return { ...variant, linkedVariantIds };
    });
}

function mergeParentAndChildCollections(parentCollections: CollectionItem[], childCollections: CollectionItem[]) {
    const childById = new Map(normalizeCollectionsForLoad(childCollections).map(collection => [collection.id, collection]));
    const parentVisibleCollections = normalizeCollectionsForLoad(withoutSubCompositionCollections(parentCollections));
    const parentIds = new Set(parentVisibleCollections.map(collection => collection.id));

    const sharedCollections = parentVisibleCollections.map(parentCollection => {
        const parentWithoutLinks = stripVariantLinks(parentCollection);
        return {
            ...applyVariantLinksFromOverlay(parentWithoutLinks, childById.get(parentCollection.id)),
            sharedFromParent: true,
        };
    });

    const childLocalCollections = normalizeCollectionsForLoad(childCollections)
        .filter(collection => !parentIds.has(collection.id) && collection.type !== "subComposition")
        .map(stripSharedParentFlag);

    return [...sharedCollections, ...childLocalCollections];
}

function restoreParentVariantLinks(childCollection: CollectionItem, parentCollection: CollectionItem) {
    return stripSharedParentFlag(applyVariantLinksFromOverlay(stripVariantLinks(childCollection), parentCollection));
}

function syncSubCompositionVariantLabels(collections: CollectionItem[], sequences: NestedSequenceRecord[]) {
    if (sequences.length === 0) return collections;
    const sequenceById = new Map(sequences.map(sequence => [sequence.id, sequence]));
    let changed = false;
    const nextCollections = collections.map(collection => {
        if (collection.type !== "subComposition") return collection;
        const nextItems = collection.items.map(item => {
            const sequence = sequenceById.get(item.value || item.id);
            if (!sequence || item.label === sequence.title) return item;
            changed = true;
            return { ...item, label: sequence.title };
        });
        return nextItems === collection.items ? collection : { ...collection, items: nextItems };
    });
    return changed ? nextCollections : collections;
}

function isNullVariant(variant?: CollectionVariant | null) {
    return Boolean(variant?.isNull);
}

function ScrubInput({ value, onChange, min, max, step, className }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: string | number; className?: string }) {
    const [local, setLocal] = useState(value?.toString() || "0");
    const [focused, setFocused] = useState(false);

    useEffect(() => {
        if (!focused) {
            setLocal(value?.toString() || "0");
        }
    }, [value, focused]);

    return (
        <input
            type="number"
            value={focused ? local : (value?.toString() || "0")}
            min={min} max={max} step={step}
            className={className}
            onFocus={() => setFocused(true)}
            onBlur={() => {
                setFocused(false);
                let parsed = parseFloat(local);
                if (isNaN(parsed)) parsed = value || 0;
                if (min !== undefined && parsed < min) parsed = min;
                if (max !== undefined && parsed > max) parsed = max;
                setLocal(parsed.toString());
                onChange(parsed);
            }}
            onChange={e => {
                setLocal(e.target.value);
                const parsed = parseFloat(e.target.value);
                if (!isNaN(parsed)) {
                    onChange(parsed);
                }
            }}
        />
    );
}

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

const INITIAL_COLLECTIONS = normalizeCollectionsForLoad(SEED_COLLECTIONS);
const COLLECTIONS_PANE_MIN_WIDTH = 240;
const COLLECTIONS_PANE_MAX_WIDTH = 520;
const COLLECTIONS_PANE_DEFAULT_WIDTH = 288;
const COLLECTIONS_PANE_COLLAPSED_WIDTH = 48;
const COLLECTIONS_PANE_WIDTH_STORAGE_KEY = "dropai.collectionsPaneWidth";
const COLLECTIONS_PANE_COLLAPSED_STORAGE_KEY = "dropai.collectionsPaneCollapsed";


// --- Draggable Collection Card ---
function CollectionCard({ collection, allCollections, onAddItem, onAddItems, onAddNullVariant, onDeleteItem, onUpdateItem, onDuplicateItem, onCopyCollection, onDeleteCollection, onCreateSubComposition, onSwitchVersion, onCreateVersion, onRenameVersion, onDeleteVersion }: {
    collection: CollectionItem;
    allCollections: CollectionItem[];
    onAddItem: (collectionId: string, label: string, value: string, duration?: number) => void;
    onAddItems: (collectionId: string, items: Array<Omit<CollectionVariant, "id">>) => void;
    onAddNullVariant: (collectionId: string) => void;
    onDeleteItem: (collectionId: string, variantId: string) => void;
    onUpdateItem: (collectionId: string, variantId: string, updates: Partial<CollectionVariant>) => void;
    onDuplicateItem: (collectionId: string, variantId: string) => Promise<void> | void;
    onCopyCollection: (collectionId: string) => Promise<void> | void;
    onDeleteCollection: (collectionId: string) => void;
    onCreateSubComposition: (collectionId: string, name: string) => Promise<void> | void;
    onSwitchVersion: (collectionId: string, versionId: string) => void;
    onCreateVersion: (collectionId: string, name: string, duplicateActive: boolean) => void;
    onRenameVersion: (collectionId: string, versionId: string, name: string) => void;
    onDeleteVersion: (collectionId: string, versionId: string) => void;
}) {
    const [isOpen, setIsOpen] = useState(false);
    const [isAdding, setIsAdding] = useState(false);
    const [newLabel, setNewLabel] = useState("");
    const [newValue, setNewValue] = useState("");
    const [isBulkTextMode, setIsBulkTextMode] = useState(false);
    const [bulkTextValues, setBulkTextValues] = useState("");
    const [isVersionMenuOpen, setIsVersionMenuOpen] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const updateFileRef = useRef<HTMLInputElement>(null);
    const [updatingItemId, setUpdatingItemId] = useState<string | null>(null);
    const [linkingVariantId, setLinkingVariantId] = useState<string | null>(null);

    const isSubComposition = collection.type === "subComposition";
    const isMedia = collection.type === "image" || collection.type === "video" || collection.type === "audio";
    const acceptMap: Record<PlayableCollectionType, string> = {
        text: "",
        image: "image/*",
        video: "video/*",
        audio: "audio/*",
    };

    const { attributes, listeners, setNodeRef: setDraggableNodeRef, isDragging } = useDraggable({
        id: `collection-${collection.id}`,
        data: { collection, type: "collection" },
    });
    const { setNodeRef: setDroppableNodeRef, isOver } = useDroppable({
        id: `collection-drop-${collection.id}`,
        data: { collectionId: collection.id, type: "collection-drop" },
    });
    const setCollectionNodeRef = useCallback((node: HTMLDivElement | null) => {
        setDraggableNodeRef(node);
        setDroppableNodeRef(node);
    }, [setDraggableNodeRef, setDroppableNodeRef]);

    const colors = COLLECTION_COLORS[collection.type];
    const collectionVersions = getCollectionVersions(collection);
    const activeVersion = getActiveCollectionVersion(collection);

    const promptForVersionName = (message: string, fallback: string) => {
        return window.prompt(message, fallback)?.trim() || "";
    };

    const handleCreateVersion = (duplicateActive: boolean) => {
        const fallback = duplicateActive ? `${activeVersion.name} Copy` : `Version ${collectionVersions.length + 1}`;
        const name = promptForVersionName(duplicateActive ? "Duplicate as" : "New version name", fallback);
        if (!name) return;
        onCreateVersion(collection.id, name, duplicateActive);
        setIsVersionMenuOpen(false);
    };

    const handleRenameVersion = () => {
        const name = promptForVersionName("Rename version", activeVersion.name);
        if (!name) return;
        onRenameVersion(collection.id, activeVersion.id, name);
        setIsVersionMenuOpen(false);
    };

    const handleDeleteVersion = () => {
        if (collectionVersions.length <= 1) {
            alert("A collection needs at least one version.");
            setIsVersionMenuOpen(false);
            return;
        }
        if (!confirm(`Delete version "${activeVersion.name}"?`)) return;
        onDeleteVersion(collection.id, activeVersion.id);
        setIsVersionMenuOpen(false);
    };

    const getMediaDuration = (file: File, objectUrl: string) => {
        if (!file.type.startsWith("video/") && !file.type.startsWith("audio/")) {
            return Promise.resolve<number | undefined>(undefined);
        }

        return new Promise<number | undefined>((resolve) => {
            const media = document.createElement(file.type.startsWith("video/") ? "video" : "audio");
            media.preload = "metadata";
            media.onloadedmetadata = () => resolve(Number.isFinite(media.duration) ? media.duration : undefined);
            media.onerror = () => resolve(undefined);
            media.src = objectUrl;
        });
    };

    const importMediaFile = async (file: File, filesCount: number): Promise<Omit<CollectionVariant, "id">> => {
        const objectUrl = URL.createObjectURL(file);
        const label = filesCount === 1 && newLabel.trim()
            ? newLabel.trim()
            : file.name.replace(/\.[^.]+$/, "");
        const duration = await getMediaDuration(file, objectUrl);
        const formData = new FormData();
        formData.append("file", file);

        try {
            const res = await fetch('/api/upload', { method: 'POST', body: formData });
            if (!res.ok) throw new Error("Upload failed");
            const data = await res.json();
            URL.revokeObjectURL(objectUrl);
            return { label, value: data.url, duration };
        } catch (e) {
            console.error("Upload failed", e);
            return { label, value: objectUrl, duration };
        }
    };

    const handleFilesSelected = async (files: File[]) => {
        setIsAdding(false);
        setNewLabel("");
        setNewValue("");

        const importedItems = await Promise.all(files.map(file => importMediaFile(file, files.length)));
        if (importedItems.length > 0) {
            onAddItems(collection.id, importedItems);
        }
    };

    const handleUpdateFile = async (file: File, itemId: string) => {
        const finishUpdate = async (duration?: number) => {
            const formData = new FormData();
            formData.append("file", file);
            try {
                const res = await fetch('/api/upload', { method: 'POST', body: formData });
                if (!res.ok) throw new Error("Upload failed");
                const data = await res.json();
                onUpdateItem(collection.id, itemId, { value: data.url, duration });
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

    const handleCreateSubComposition = async () => {
        const name = newLabel.trim();
        if (!name) return;
        await onCreateSubComposition(collection.id, name);
        setNewLabel("");
        setNewValue("");
        setIsAdding(false);
    };

    const handleBulkTextAdd = () => {
        const lines = bulkTextValues
            .split(/[,\r\n]+/)
            .map(line => line.trim())
            .filter(Boolean);
        if (lines.length === 0) return;

        const startIndex = collection.items.length + 1;
        const labelPrefix = newLabel.trim();

        lines.forEach((line, idx) => {
            const pipeIndex = line.indexOf("|");
            if (pipeIndex > -1) {
                const parsedLabel = line.slice(0, pipeIndex).trim();
                const parsedValue = line.slice(pipeIndex + 1).trim();
                if (!parsedValue) return;
                const fallbackLabel = labelPrefix ? `${labelPrefix} ${idx + 1}` : `Variant ${startIndex + idx}`;
                onAddItem(collection.id, parsedLabel || fallbackLabel, parsedValue);
                return;
            }

            const fallbackLabel = labelPrefix ? `${labelPrefix} ${idx + 1}` : `Variant ${startIndex + idx}`;
            onAddItem(collection.id, fallbackLabel, line);
        });

        setNewLabel("");
        setBulkTextValues("");
        setIsBulkTextMode(false);
        setIsAdding(false);
    };

    const activeVersionCsv = useMemo(() => {
        const escapeCsvCell = (value: string | number | boolean | null | undefined) => {
            const text = value === null || value === undefined ? "" : String(value);
            return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
        };
        const rows = [["label", "value"]];
        for (const item of activeVersion.items || []) {
            rows.push([item.label || "", isNullVariant(item) ? "" : item.value || ""]);
        }
        return rows.map(row => row.map(escapeCsvCell).join(",")).join("\r\n");
    }, [activeVersion.items]);

    const handleCopyActiveVersionCsv = async () => {
        try {
            await navigator.clipboard.writeText(activeVersionCsv);
            setIsVersionMenuOpen(false);
        } catch {
            alert("Could not copy CSV to clipboard.");
        }
    };

    const handleExportActiveVersionCsv = () => {
        const safeCollectionName = collection.title.replace(/[<>:"/\\|?*\x00-\x1F]/g, "-").trim() || "collection";
        const safeVersionName = activeVersion.name.replace(/[<>:"/\\|?*\x00-\x1F]/g, "-").trim() || "version";
        const blob = new Blob([activeVersionCsv], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${safeCollectionName}-${safeVersionName}.csv`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        setIsVersionMenuOpen(false);
    };

    return (
        <div
            ref={setCollectionNodeRef}
            className={cn(
                "relative rounded-lg border transition-all",
                colors.bg,
                colors.border,
                isDragging && "opacity-40 scale-95",
                isOver && !isDragging && "ring-1 ring-blue-400/70 border-blue-400/70"
            )}
        >
            {/* Header — draggable */}
            <div
                {...listeners}
                {...attributes}
                className="flex items-center gap-2 p-3 cursor-grab active:cursor-grabbing select-none touch-none group/colheader"
                onClick={(e) => { e.stopPropagation(); }}
            >
                <span className={cn(colors.icon)}>{COLLECTION_ICONS[collection.type]}</span>
                <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-mono text-gray-200 font-medium truncate">{collection.title}</div>
                    <div className="mt-1 flex items-center gap-1.5 min-w-0">
                        <div
                            className="min-w-0 flex-1 flex items-center gap-1.5 rounded-md border border-white/8 bg-black/25 px-2 py-1"
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <span className="text-[8px] font-mono uppercase tracking-widest text-gray-600 shrink-0">Version</span>
                            <select
                                value={collection.activeVersionId || activeVersion.id}
                                onChange={(e) => {
                                    onSwitchVersion(collection.id, e.target.value);
                                    setIsVersionMenuOpen(false);
                                }}
                                className="min-w-0 flex-1 bg-transparent text-[9px] font-mono text-gray-300 outline-none cursor-pointer"
                                title="Active version"
                            >
                                {collectionVersions.map(version => (
                                    <option key={version.id} value={version.id} className="bg-[#111]">
                                        {version.name}
                                    </option>
                                ))}
                            </select>
                            <button
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setIsVersionMenuOpen(open => !open);
                                }}
                                className="text-gray-500 hover:text-gray-200 transition-colors shrink-0"
                                title="Version actions"
                                aria-label="Version actions"
                            >
                                <MoreHorizontal className="w-3.5 h-3.5" />
                            </button>
                            {isVersionMenuOpen && (
                                <div
                                    className="absolute left-9 right-3 top-[58px] z-40 rounded-lg border border-white/10 bg-[#111] shadow-2xl p-1.5"
                                    onPointerDown={(e) => e.stopPropagation()}
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <button
                                        onClick={() => handleCreateVersion(false)}
                                        className="w-full rounded-md px-2 py-1.5 text-left text-[10px] font-mono text-gray-300 hover:bg-white/8 hover:text-white transition-colors"
                                    >
                                        New blank version
                                    </button>
                                    <button
                                        onClick={() => handleCreateVersion(true)}
                                        className="w-full rounded-md px-2 py-1.5 text-left text-[10px] font-mono text-gray-300 hover:bg-white/8 hover:text-white transition-colors"
                                    >
                                        Duplicate current
                                    </button>
                                    {collection.type === "text" && (
                                        <>
                                            <div className="my-1 h-px bg-white/8" />
                                            <button
                                                onClick={() => { void handleCopyActiveVersionCsv(); }}
                                                className="w-full rounded-md px-2 py-1.5 text-left text-[10px] font-mono text-gray-300 hover:bg-white/8 hover:text-white transition-colors"
                                            >
                                                Copy as CSV
                                            </button>
                                            <button
                                                onClick={handleExportActiveVersionCsv}
                                                className="w-full rounded-md px-2 py-1.5 text-left text-[10px] font-mono text-gray-300 hover:bg-white/8 hover:text-white transition-colors"
                                            >
                                                Export as CSV
                                            </button>
                                        </>
                                    )}
                                    <div className="my-1 h-px bg-white/8" />
                                    <button
                                        onClick={handleRenameVersion}
                                        className="w-full rounded-md px-2 py-1.5 text-left text-[10px] font-mono text-gray-300 hover:bg-white/8 hover:text-white transition-colors"
                                    >
                                        Rename current
                                    </button>
                                    <button
                                        onClick={handleDeleteVersion}
                                        disabled={collectionVersions.length <= 1}
                                        className="w-full rounded-md px-2 py-1.5 text-left text-[10px] font-mono text-red-300 hover:bg-red-500/10 transition-colors disabled:opacity-40 disabled:hover:bg-transparent"
                                    >
                                        Delete current
                                    </button>
                                </div>
                            )}
                        </div>
                        {collection.sharedFromParent && (
                            <span className="text-[8px] font-mono text-cyan-300/80 bg-cyan-500/10 border border-cyan-500/20 px-1.5 py-0.5 rounded shrink-0">Shared</span>
                        )}
                        <span className="text-[9px] font-mono text-gray-500 bg-white/5 px-1.5 py-0.5 rounded shrink-0">{collection.items.length} items</span>
                    </div>
                </div>
                <button
                    onClick={(e) => { e.stopPropagation(); e.preventDefault(); void onCopyCollection(collection.id); }}
                    onPointerDown={(e) => e.stopPropagation()}
                    className="opacity-0 group-hover/colheader:opacity-100 text-gray-600 hover:text-cyan-300 transition-all ml-1"
                    title="Copy Collection"
                >
                    <Copy className="w-3.5 h-3.5" />
                </button>
                <button
                    onClick={(e) => { e.stopPropagation(); e.preventDefault(); onDeleteCollection(collection.id); }}
                    onPointerDown={(e) => e.stopPropagation()}
                    className="opacity-0 group-hover/colheader:opacity-100 text-gray-600 hover:text-red-400 transition-all"
                    title="Delete Collection"
                >
                    <Trash2 className="w-3.5 h-3.5" />
                </button>
                <button
                    onClick={(e) => { e.stopPropagation(); e.preventDefault(); setIsVersionMenuOpen(false); setIsOpen(!isOpen); }}
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
                                    <div key={item.id} className={cn("flex items-center gap-2 group", item.excluded && "opacity-40")}>
                                        {/* Thumbnail preview for media items */}
                                        {isNullVariant(item) && (
                                            <div className="w-8 h-8 rounded overflow-hidden border border-white/10 shrink-0 bg-white/5 flex items-center justify-center">
                                                <Ban className="w-3.5 h-3.5 text-gray-500" />
                                            </div>
                                        )}
                                        {isSubComposition && !isNullVariant(item) && (
                                            <div className="w-8 h-8 rounded overflow-hidden border border-violet-500/20 shrink-0 bg-violet-500/10 flex items-center justify-center">
                                                <Film className="w-3.5 h-3.5 text-violet-300" />
                                            </div>
                                        )}
                                        {isMedia && item.value && !isNullVariant(item) && (
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
                                        <div className={cn("flex-1 text-[10px] font-mono text-gray-400 bg-black/30 rounded px-2 py-1.5 truncate min-w-0 relative", item.excluded && "line-through text-gray-600")}>
                                            <span className="text-gray-500 mr-1.5">{item.label}</span>
                                            {isNullVariant(item) ? (
                                                <span className="text-gray-500 italic">empty</span>
                                            ) : !isMedia && !isSubComposition ? (
                                                <span className="text-gray-300">: {item.value}</span>
                                            ) : null}
                                            {isSubComposition && !isNullVariant(item) && <span className="text-violet-300/70">composition variant</span>}
                                            {item.excluded && <span className="ml-1.5 text-[8px] text-orange-500/70 font-bold uppercase tracking-wider">excl.</span>}
                                        </div>
                                        {/* Exclude toggle */}
                                        <button
                                            onClick={() => onUpdateItem(collection.id, item.id, { excluded: !item.excluded })}
                                            className={cn(
                                                "opacity-0 group-hover:opacity-100 transition-all",
                                                item.excluded ? "text-orange-400 opacity-100" : "text-gray-600 hover:text-orange-400"
                                            )}
                                            title={item.excluded ? "Include in generation" : "Exclude from generation"}
                                        >
                                            <Ban className="w-3 h-3" />
                                        </button>
                                        {/* Link variants button */}
                                        <button
                                            onClick={() => setLinkingVariantId(item.id)}
                                            className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-green-400 transition-all"
                                            title="Link variants"
                                        >
                                            <Link2 className="w-3 h-3" />
                                        </button>
                                        <button
                                            onClick={() => { void onDuplicateItem(collection.id, item.id); }}
                                            className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-cyan-300 transition-all"
                                            title="Duplicate variant"
                                        >
                                            <Copy className="w-3 h-3" />
                                        </button>
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
                                        {isSubComposition && item.value && !isNullVariant(item) && (
                                            <Link
                                                href={`/builder/${item.value}`}
                                                onClick={(e) => e.stopPropagation()}
                                                className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-violet-300 transition-all"
                                                title="Open editor"
                                            >
                                                <Film className="w-3 h-3" />
                                            </Link>
                                        )}
                                        <button
                                            onClick={() => onDeleteItem(collection.id, item.id)}
                                            className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 transition-all"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </div>
                            ))}

                            {/* Link Modal Overlay */}
                            {linkingVariantId && (
                                <div className="fixed inset-0 z-[200] bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setLinkingVariantId(null)}>
                                    <div className="bg-[#1a1a1a] border border-white/10 rounded-xl w-full max-w-lg p-5 flex flex-col gap-4 shadow-2xl" onClick={e => e.stopPropagation()}>
                                        <h3 className="text-sm font-mono text-white flex items-center gap-2">
                                            <Link2 className="w-4 h-4 text-blue-400" />
                                            Link Variants
                                        </h3>
                                        <p className="text-xs text-gray-400 font-mono">
                                            Select variants from other collections that should be enforced when this variant is selected.
                                        </p>
                                        <div className="flex-1 overflow-y-auto max-h-[60vh] space-y-4 custom-scrollbar pr-2">
                                            {allCollections.filter(c => c.id !== collection.id).map(c => (
                                                <div key={c.id} className="space-y-2">
                                                    <h4 className="text-[10px] uppercase font-mono text-gray-500 tracking-wider">{c.title}</h4>
                                                    <div className="grid grid-cols-2 gap-2">
                                                        {c.items.map(v => {
                                                            const currentItem = collection.items.find(i => i.id === linkingVariantId);
                                                            const isLinked = currentItem?.linkedVariantIds?.includes(v.id) ?? false;
                                                            return (
                                                                <div 
                                                                    key={v.id} 
                                                                    onClick={() => {
                                                                        const links = currentItem?.linkedVariantIds || [];
                                                                        const newLinks = isLinked ? links.filter(l => l !== v.id) : [...links, v.id];
                                                                        onUpdateItem(collection.id, linkingVariantId, { linkedVariantIds: newLinks });
                                                                    }}
                                                                    className={cn(
                                                                        "p-2 rounded cursor-pointer border text-[10px] font-mono transition-all flex items-center gap-2",
                                                                        isLinked ? "border-blue-500 bg-blue-500/10 text-blue-300" : "border-white/5 bg-white/5 text-gray-400 hover:bg-white/10"
                                                                    )}
                                                                >
                                                                    <div className={cn("w-3 h-3 rounded-full border flex items-center justify-center shrink-0", isLinked ? "border-blue-500 bg-blue-500" : "border-gray-600")}>
                                                                        {isLinked && <CheckCircle2 className="w-2 h-2 text-white" />}
                                                                    </div>
                                                                    <span className="truncate">{v.label}</span>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            ))}
                                            {allCollections.length <= 1 && (
                                                <div className="text-xs text-gray-500 font-mono text-center py-4 border border-dashed border-white/10 rounded">
                                                    Create more collections to link variants.
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex justify-end pt-2 border-t border-white/10">
                                            <button onClick={() => setLinkingVariantId(null)} className="px-4 py-1.5 bg-white/10 hover:bg-white/20 text-white text-xs font-mono rounded transition-colors">
                                                Done
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Hidden file input for updating existing items */}
                            {isMedia && (
                                <input
                                    ref={updateFileRef}
                                    type="file"
                                    accept={collection.type === "image" || collection.type === "video" || collection.type === "audio" ? acceptMap[collection.type] : ""}
                                    className="hidden"
                                    onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file && updatingItemId) handleUpdateFile(file, updatingItemId);
                                        e.target.value = "";
                                    }}
                                />
                            )}

                            {/* Add Item Form */}
                            {isAdding ? (
                                <div className="space-y-1.5 pt-1">
                                    {!isMedia && !isSubComposition && (
                                        <div className="flex gap-1">
                                            <button
                                                onClick={() => setIsBulkTextMode(false)}
                                                className={cn(
                                                    "flex-1 text-[9px] font-mono py-1 rounded border transition-colors",
                                                    !isBulkTextMode ? "bg-amber-500/20 border-amber-500/40 text-amber-300" : "bg-white/5 border-white/10 text-gray-500 hover:text-gray-300"
                                                )}
                                            >
                                                Single
                                            </button>
                                            <button
                                                onClick={() => setIsBulkTextMode(true)}
                                                className={cn(
                                                    "flex-1 text-[9px] font-mono py-1 rounded border transition-colors",
                                                    isBulkTextMode ? "bg-amber-500/20 border-amber-500/40 text-amber-300" : "bg-white/5 border-white/10 text-gray-500 hover:text-gray-300"
                                                )}
                                            >
                                                Bulk
                                            </button>
                                        </div>
                                    )}
                                    <input
                                        value={newLabel}
                                        onChange={(e) => setNewLabel(e.target.value)}
                                        placeholder={isSubComposition ? "Sub-composition name" : isBulkTextMode ? "Label prefix (optional)" : "Label (e.g. Hook A)"}
                                        className="w-full text-[10px] font-mono bg-black/40 border border-white/10 rounded px-2 py-1.5 text-gray-300 placeholder:text-gray-600 outline-none focus:border-white/20"
                                        onPointerDown={(e) => e.stopPropagation()}
                                        onKeyDown={(e) => { if (isSubComposition && e.key === "Enter") void handleCreateSubComposition(); }}
                                    />
                                    {isMedia ? (
                                        <>
                                            <input
                                                ref={fileInputRef}
                                                type="file"
                                                multiple
                                                accept={collection.type === "image" || collection.type === "video" || collection.type === "audio" ? acceptMap[collection.type] : ""}
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
                                    ) : isSubComposition ? (
                                        <p className="text-[8px] text-gray-600 font-mono">
                                            Creates a child composition and adds it to this collection as a variant.
                                        </p>
                                    ) : isBulkTextMode ? (
                                        <>
                                            <textarea
                                                value={bulkTextValues}
                                                onChange={(e) => setBulkTextValues(e.target.value)}
                                                placeholder={"Comma-separated variants (or one per line)\nOptional format: Label | Text"}
                                                className="w-full min-h-[88px] resize-y text-[10px] font-mono bg-black/40 border border-white/10 rounded px-2 py-1.5 text-gray-300 placeholder:text-gray-600 outline-none focus:border-white/20"
                                                onPointerDown={(e) => e.stopPropagation()}
                                                onKeyDown={(e) => {
                                                    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") handleBulkTextAdd();
                                                }}
                                            />
                                            <p className="text-[8px] text-gray-600 font-mono">
                                                Use commas or new lines between variants. Use <span className="text-gray-500">Label | Text</span> for custom labels.
                                            </p>
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
                                        {isSubComposition ? (
                                            <button
                                                onClick={() => void handleCreateSubComposition()}
                                                className="flex-1 text-[9px] font-mono py-1 bg-violet-500/20 hover:bg-violet-500/30 text-violet-200 rounded transition-colors"
                                            >
                                                Create Composition
                                            </button>
                                        ) : !isMedia && (
                                            <button
                                                onClick={isBulkTextMode ? handleBulkTextAdd : handleAdd}
                                                className="flex-1 text-[9px] font-mono py-1 bg-white/10 hover:bg-white/20 text-gray-300 rounded transition-colors"
                                            >
                                                {isBulkTextMode ? "Bulk Add" : "Add"}
                                            </button>
                                        )}
                                        <button
                                            onClick={() => {
                                                setIsAdding(false);
                                                setNewLabel("");
                                                setNewValue("");
                                                setBulkTextValues("");
                                                setIsBulkTextMode(false);
                                            }}
                                            className="flex-1 text-[9px] font-mono py-1 bg-white/5 hover:bg-white/10 text-gray-500 rounded transition-colors"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 gap-1.5">
                                    <button
                                        onClick={() => setIsAdding(true)}
                                        className="text-[9px] font-mono py-1.5 text-gray-500 hover:text-gray-300 border border-dashed border-white/10 hover:border-white/20 rounded transition-colors"
                                    >
                                        {isSubComposition ? "+ Create Composition" : "+ Add Item"}
                                    </button>
                                    <button
                                        onClick={() => onAddNullVariant(collection.id)}
                                        className="text-[9px] font-mono py-1.5 text-gray-500 hover:text-gray-300 border border-dashed border-white/10 hover:border-white/20 rounded transition-colors"
                                    >
                                        + Null Variant
                                    </button>
                                </div>
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
                    return <span className="text-white text-base px-2 pointer-events-none w-full" style={{ fontSize: el.fontSize ? `${el.fontSize}px` : undefined, fontWeight: el.fontWeight || 'bold', fontStyle: el.fontStyle || 'normal', textDecoration: el.textDecoration || 'none', letterSpacing: el.letterSpacing ? `${el.letterSpacing}px` : undefined, lineHeight: el.lineHeight ? el.lineHeight : undefined, textAlign: el.textAlign || 'center', whiteSpace: 'pre-wrap', wordBreak: 'break-word', WebkitTextStroke: el.textStrokeWidth ? `${el.textStrokeWidth}px ${el.textStrokeColor || '#000000'}` : undefined, paintOrder: el.textStrokeWidth ? 'stroke fill' : undefined }}>{sv.value}</span>;
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
const MIN_RENDER_SCALE = 0.001;
const PLAYBACK_STATE_FPS = 24;
const PLAYBACK_STATE_INTERVAL_MS = 1000 / PLAYBACK_STATE_FPS;

function getPreviewElementTransform(el: CanvasElement, animStyle: AnimatedStyle): string {
    const safeScale = Math.max(MIN_RENDER_SCALE, animStyle.scale);
    const translateX = el.width ? (animStyle.translateX / el.width) * 100 : 0;
    const translateY = el.height ? (animStyle.translateY / el.height) * 100 : 0;
    const rotation = (el.rotation || 0) + animStyle.rotate;
    return `translate3d(${translateX}%, ${translateY}%, 0) rotate(${rotation}deg) scale3d(${safeScale}, ${safeScale}, 1)`;
}

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
        const col = collections.find(c => c.id === el.collectionId);
        const selectedVariant = varMode !== 'all'
            ? col?.items.find(item => item.id === varMode)
            : null;

        if (isNullVariant(selectedVariant)) {
            return { el, startTime: baseTime, duration: 0 };
        }

        if (isMedia) {
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

    // 2. Establish Track Order Sequences
    // For each track, sort elements by intrinsic startTime.
    const tracksMap = new Map<string, typeof initialTimings>();
    for (const item of initialTimings) {
        const tid = item.el.trackId || 'track-0';
        if (!tracksMap.has(tid)) tracksMap.set(tid, []);
        tracksMap.get(tid)!.push(item);
    }

    // Map of elementId -> previous elementId in the same track
    const prevInTrack = new Map<string, string>();
    for (const [tid, items] of tracksMap.entries()) {
        items.sort((a, b) => a.startTime - b.startTime);
        for (let i = 1; i < items.length; i++) {
            prevInTrack.set(items[i].el.elementId, items[i - 1].el.elementId);
        }
    }

    // 3. Topological Resolution
    const initialMap = new Map(initialTimings.map(it => [it.el.elementId, it]));
    const resolving = new Set<string>();

    function resolveNode(id: string): { startTime: number, duration: number } {
        if (timings.has(id)) return timings.get(id)!;
        
        const item = initialMap.get(id);
        if (!item) return { startTime: 0, duration: 1 };

        if (resolving.has(id)) {
            // Circular dependency! Break cycle by using intrinsic
            return { startTime: item.startTime, duration: item.duration };
        }
        
        resolving.add(id);
        let resolvedStart = item.startTime;
        let resolvedDur = item.duration;

        if (item.el.matchDurationWithIds && item.el.matchDurationWithIds.length > 0) {
            resolvedDur = 0;
            let anyValid = false;
            for (const matchId of item.el.matchDurationWithIds) {
                // Only resolve if the target element actually exists in this composition
                if (!initialMap.has(matchId)) continue;
                const matchTarget = resolveNode(matchId);
                if (matchTarget) {
                    const offset = item.el.matchDurationOffsets?.[matchId] || 0;
                    resolvedDur += Math.max(0, matchTarget.duration + offset);
                    anyValid = true;
                }
            }
            // If no valid targets remain, fall back to intrinsic duration
            if (!anyValid) resolvedDur = item.duration;
        } else if (item.el.matchDurationWithId) {
            // Only resolve if the target element actually exists
            if (initialMap.has(item.el.matchDurationWithId)) {
                const matchTarget = resolveNode(item.el.matchDurationWithId);
                if (matchTarget) {
                    const offset = item.el.matchDurationOffsets?.[item.el.matchDurationWithId] || 0;
                    resolvedDur = Math.max(0, matchTarget.duration + offset);
                }
            }
            // If target doesn't exist, keep intrinsic duration (resolvedDur unchanged)
        }

        // Cap duration for media
        if (item.el.collectionType === 'video' || item.el.collectionType === 'audio') {
            const varMode = getVariantMode(item.el.elementId);
            const remainingDuration = getMediaDurationLimit(item.el, varMode, collections, 9999);
            
            if (resolvedDur > remainingDuration) {
                resolvedDur = Math.max(0.1, remainingDuration);
            }
        }

        if (item.el.syncWith && item.el.syncWith.targetId) {
            // ANCHORED: depends on syncWith target — but only if it still exists
            if (initialMap.has(item.el.syncWith.targetId)) {
                const targetTiming = resolveNode(item.el.syncWith.targetId);
                if (targetTiming) {
                    const targetPoint = item.el.syncWith.targetEdge === 'end' 
                        ? targetTiming.startTime + targetTiming.duration 
                        : targetTiming.startTime;
                    
                    if (item.el.syncWith.myEdge === 'end') {
                        resolvedStart = targetPoint - resolvedDur;
                    } else {
                        resolvedStart = targetPoint;
                    }
                }
            }
            // If target doesn't exist, fall through to normal positioning below
            if (!initialMap.has(item.el.syncWith.targetId)) {
                // Treat as normal (non-anchored) element
                const prevId = prevInTrack.get(id);
                if (prevId) {
                    const prevTiming = resolveNode(prevId);
                    const trackConfig = tracks.find(t => t.id === (item.el.trackId || 'track-0'));
                    const pushStart = prevTiming.startTime + prevTiming.duration;
                    if (trackConfig?.magnet) {
                        resolvedStart = pushStart;
                    } else {
                        resolvedStart = item.startTime;
                    }
                } else {
                    resolvedStart = item.startTime;
                }
            }
        } else {
            // NORMAL: depends on previous element in track
            const prevId = prevInTrack.get(id);
            if (prevId) {
                const prevTiming = resolveNode(prevId);
                const trackConfig = tracks.find(t => t.id === (item.el.trackId || 'track-0'));
                
                const pushStart = prevTiming.startTime + prevTiming.duration;
                
                if (trackConfig?.magnet) {
                    resolvedStart = pushStart;
                } else {
                    resolvedStart = item.startTime;
                }
            } else {
                // First element in track, uses intrinsic
                resolvedStart = item.startTime;
            }
        }

        resolvedStart = Math.max(0, resolvedStart); // Prevent negative start times
        const res = { startTime: Math.round(resolvedStart * 100) / 100, duration: resolvedDur };
        timings.set(id, res);
        resolving.delete(id);
        return res;
    }

    // Resolve all
    for (const item of initialTimings) {
        resolveNode(item.el.elementId);
    }

    return timings;
}

// Helper to safely get the media duration bound for an element, respecting variant overrides
function getElementPlaybackSpeed(el: Pick<CanvasElement, "speed">) {
    return Math.max(0.05, el.speed ?? 1);
}

function getMediaDurationLimit(el: CanvasElement, variantMode: string, collections: CollectionItem[], fallbackDuration: number) {
    const col = collections.find(c => c.id === el.collectionId);
    if (!col || (col.type !== 'video' && col.type !== 'audio')) return fallbackDuration;
    const speed = getElementPlaybackSpeed(el);
    const getOffsetForVariant = (variantId: string) => {
        const override = el.variantOverrides?.[variantId] as Partial<CanvasElement> | undefined;
        return override?.mediaOffset ?? el.mediaOffset ?? 0;
    };

    if (variantMode !== 'all') {
        const variant = col.items.find(i => i.id === variantMode);
        if (isNullVariant(variant)) return 0;
        const mediaOffset = getOffsetForVariant(variantMode);
        return variant?.duration !== undefined
            ? Math.max(0.1, (variant.duration - mediaOffset) / speed)
            : fallbackDuration;
    } else {
        // In "all" mode, return the maximum duration among all items so user can extend up to that max
        let maxDur = 0;
        let hasDurations = false;
        for (const item of col.items) {
            if (item.duration !== undefined) {
                const mediaOffset = getOffsetForVariant(item.id);
                maxDur = Math.max(maxDur, (item.duration - mediaOffset) / speed);
                hasDurations = true;
            }
        }
        return hasDurations ? Math.max(0.1, maxDur) : fallbackDuration;
    }
}

function getElementSelectionKey(el: CanvasElement) {
    if (el.variantSeedKey) return el.variantSeedKey;
    const srcId = el.sourceElementId || el.elementId;
    return srcId === el.elementId ? srcId : `${srcId}-${el.elementId}`;
}

function getElementVariantSelectionMode(el: CanvasElement): VariantSelectionMode {
    return el.variantSelectionMode || "random";
}

function getPreviewMediaTime(currentTime: number, el: CanvasElement, baseOffset: number, rawDuration: number) {
    const elapsed = Math.max(0, currentTime - el.startTime);
    const sourceElapsed = elapsed * getElementPlaybackSpeed(el);
    if (!Number.isFinite(rawDuration)) {
        return { time: sourceElapsed + baseOffset, sourceExhausted: false };
    }

    const lastSafeTime = Math.max(0, rawDuration - 0.05);
    const time = Math.min(sourceElapsed + baseOffset, lastSafeTime);
    return {
        time,
        sourceExhausted: sourceElapsed + baseOffset >= lastSafeTime,
    };
}

function hasDurationMatch(el: CanvasElement) {
    return Boolean(el.matchDurationWithId || (el.matchDurationWithIds && el.matchDurationWithIds.length > 0));
}

function getPlaybackDuration(
    el: CanvasElement,
    timing: { startTime: number; duration: number },
    variantOverride?: Partial<CanvasElement>,
) {
    const duration = hasDurationMatch(el)
        ? timing.duration
        : variantOverride?.duration ?? timing.duration;
    return el.nestedCompositionTransform
        ? Math.min(duration, timing.duration)
        : duration;
}

function getTrackStackZ(trackIndex: number, localZ = 0, boost = 0) {
    const safeTrackIndex = Math.max(0, trackIndex);
    const safeLocalZ = Math.max(0, Math.min(9999, localZ || 0));
    return 1_000_000 - safeTrackIndex * 10_000 + safeLocalZ + boost;
}

function applyNestedCompositionTransform(el: CanvasElement, currentTime: number): CanvasElement {
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

// --- Main Builder (inner, only rendered on client) ---
function BuilderInner({ compositionId }: { compositionId?: string }) {
    const [title, setTitle] = useState("Composition Builder");
    const [parentComposition, setParentComposition] = useState<{ id: string; title: string } | null>(null);
    const [isRenaming, setIsRenaming] = useState(false);
    const [editTitle, setEditTitle] = useState("");
    const [elements, setElements] = useState<CanvasElement[]>([]);
    const [tracks, setTracks] = useState<TrackConfig[]>([{ id: 'track-0', magnet: false }]);
    const [collections, setCollections] = useState<CollectionItem[]>(INITIAL_COLLECTIONS);
    const [textCollectionGroups, setTextCollectionGroups] = useState<TextCollectionGroup[]>([]);
    const [collectionsPaneWidth, setCollectionsPaneWidth] = useState(() => {
        if (typeof window === "undefined") return COLLECTIONS_PANE_DEFAULT_WIDTH;
        const savedWidth = Number(window.localStorage.getItem(COLLECTIONS_PANE_WIDTH_STORAGE_KEY));
        if (!Number.isFinite(savedWidth)) return COLLECTIONS_PANE_DEFAULT_WIDTH;
        return Math.max(COLLECTIONS_PANE_MIN_WIDTH, Math.min(COLLECTIONS_PANE_MAX_WIDTH, savedWidth));
    });
    const [isCollectionsPaneCollapsed, setIsCollectionsPaneCollapsed] = useState(() => {
        if (typeof window === "undefined") return false;
        return window.localStorage.getItem(COLLECTIONS_PANE_COLLAPSED_STORAGE_KEY) === "true";
    });
    const [nestedSequences, setNestedSequences] = useState<NestedSequenceRecord[]>([]);
    const [isSubCompositionEditor, setIsSubCompositionEditor] = useState(false);
    const collectionsRef = useRef<CollectionItem[]>(INITIAL_COLLECTIONS);
    const textCollectionGroupsRef = useRef<TextCollectionGroup[]>([]);
    const nestedSequencesRef = useRef<NestedSequenceRecord[]>([]);
    const parentCompositionRef = useRef<{ id: string; title: string } | null>(null);
    const parentSharedCollectionsRef = useRef<CollectionItem[]>([]);
    const parentAllCollectionsRef = useRef<CollectionItem[]>([]);
    const parentSharedTextGroupsRef = useRef<TextCollectionGroup[]>([]);
    const parentSharedRenderQueueRef = useRef<QueuedRenderJob[]>([]);
    const sharedParentCollectionIdsRef = useRef<Set<string>>(new Set());
    const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
    const [centerView, setCenterView] = useState<"canvas" | "preview">("canvas");
    const [inspectorVariantModes, setInspectorVariantModes] = useState<Record<string, string>>({}); // elementId -> "all" | variantId
    const [inspectorLocked, setInspectorLocked] = useState(false);
    const [saving, setSaving] = useState(false);
    const [fetching, setFetching] = useState(!!compositionId);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const [copiedProperties, setCopiedProperties] = useState<Partial<CanvasElement> | null>(null);
    const [TOTAL_DURATION, setTOTAL_DURATION] = useState(120);

    const showToast = (message: string, type: 'success' | 'error') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    };

    const handleCollectionsPaneResizeStart = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        const startX = e.clientX;
        const startWidth = collectionsPaneWidth;

        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";

        const handlePointerMove = (moveEvent: PointerEvent) => {
            const nextWidth = Math.max(
                COLLECTIONS_PANE_MIN_WIDTH,
                Math.min(COLLECTIONS_PANE_MAX_WIDTH, startWidth + moveEvent.clientX - startX),
            );
            setCollectionsPaneWidth(nextWidth);
        };

        const handlePointerUp = (upEvent: PointerEvent) => {
            const nextWidth = Math.max(
                COLLECTIONS_PANE_MIN_WIDTH,
                Math.min(COLLECTIONS_PANE_MAX_WIDTH, startWidth + upEvent.clientX - startX),
            );
            setCollectionsPaneWidth(nextWidth);
            window.localStorage.setItem(COLLECTIONS_PANE_WIDTH_STORAGE_KEY, String(nextWidth));
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
            window.removeEventListener("pointermove", handlePointerMove);
            window.removeEventListener("pointerup", handlePointerUp);
            window.removeEventListener("pointercancel", handlePointerCancel);
        };

        const handlePointerCancel = () => {
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
            window.removeEventListener("pointermove", handlePointerMove);
            window.removeEventListener("pointerup", handlePointerUp);
            window.removeEventListener("pointercancel", handlePointerCancel);
        };

        window.addEventListener("pointermove", handlePointerMove);
        window.addEventListener("pointerup", handlePointerUp);
        window.addEventListener("pointercancel", handlePointerCancel);
    }, [collectionsPaneWidth]);

    const toggleCollectionsPaneCollapsed = useCallback(() => {
        setIsCollectionsPaneCollapsed(prev => {
            const next = !prev;
            window.localStorage.setItem(COLLECTIONS_PANE_COLLAPSED_STORAGE_KEY, String(next));
            return next;
        });
    }, []);

    // --- Export / Render state ---
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [renderProgress, setRenderProgress] = useState<RenderProgress | null>(null);
    const renderAbortRef = useRef<AbortController | null>(null);
    const [exportOutputDir, setExportOutputDir] = useState<FileSystemDirectoryHandle | null>(null);
    const [exportOutputDirName, setExportOutputDirName] = useState<string | null>(null);
    const lastRenderUsedVariantIdsRef = useRef<string[]>([]);
    const [renderQueue, setRenderQueue] = useState<QueuedRenderJob[]>([]);
    const renderQueueRef = useRef(renderQueue);
    renderQueueRef.current = renderQueue;
    const [exportSettings, setExportSettings] = useState({
        resolution: '1080x1920' as '1080x1920' | '720x1280' | '540x960',
        fps: 30 as 24 | 30 | 60,
        bitrate: 8 as 4 | 8 | 16,
        format: 'mp4' as RenderFormat,
    });
    type EditorSnapshot = {
        title: string;
        duration: number;
        elements: CanvasElement[];
        tracks: TrackConfig[];
        collections: CollectionItem[];
        textCollectionGroups: TextCollectionGroup[];
    };
    const HISTORY_LIMIT = 100;
    const HISTORY_DEBOUNCE_MS = 450;
    const undoStackRef = useRef<EditorSnapshot[]>([]);
    const redoStackRef = useRef<EditorSnapshot[]>([]);
    const lastSnapshotRef = useRef<EditorSnapshot | null>(null);
    const historyInitializedRef = useRef(false);
    const historyApplyingRef = useRef(false);
    const historyDebounceRef = useRef<number | null>(null);
    const [canUndo, setCanUndo] = useState(false);
    const [canRedo, setCanRedo] = useState(false);

    const clonePlain = useCallback(<T,>(input: T): T => JSON.parse(JSON.stringify(input)) as T, []);
    const snapshotKey = useCallback((snapshot: EditorSnapshot) => JSON.stringify(snapshot), []);
    const refreshHistoryAvailability = useCallback(() => {
        setCanUndo(undoStackRef.current.length > 0);
        setCanRedo(redoStackRef.current.length > 0);
    }, []);
    const captureSnapshot = useCallback((): EditorSnapshot => ({
        title,
        duration: TOTAL_DURATION,
        elements: clonePlain(elements),
        tracks: clonePlain(tracks),
        collections: clonePlain(collections),
        textCollectionGroups: clonePlain(textCollectionGroups),
    }), [title, TOTAL_DURATION, elements, tracks, collections, textCollectionGroups, clonePlain]);
    const applySnapshot = useCallback((snapshot: EditorSnapshot) => {
        historyApplyingRef.current = true;
        setTitle(snapshot.title);
        setTOTAL_DURATION(snapshot.duration);
        setElements(clonePlain(snapshot.elements));
        setTracks(clonePlain(snapshot.tracks));
        const nextCollections = normalizeCollectionsForLoad(clonePlain(snapshot.collections));
        const nextTextGroups = clonePlain(snapshot.textCollectionGroups || []);
        collectionsRef.current = nextCollections;
        textCollectionGroupsRef.current = nextTextGroups;
        setCollections(nextCollections);
        setTextCollectionGroups(nextTextGroups);
        lastSnapshotRef.current = clonePlain(snapshot);
        window.setTimeout(() => {
            historyApplyingRef.current = false;
        }, 0);
    }, [clonePlain]);
    const commitSnapshotToHistory = useCallback((currentSnapshot: EditorSnapshot) => {
        const previousSnapshot = lastSnapshotRef.current;
        if (!previousSnapshot) {
            lastSnapshotRef.current = clonePlain(currentSnapshot);
            return false;
        }
        if (snapshotKey(previousSnapshot) === snapshotKey(currentSnapshot)) return false;

        undoStackRef.current.push(clonePlain(previousSnapshot));
        if (undoStackRef.current.length > HISTORY_LIMIT) undoStackRef.current.shift();
        redoStackRef.current = [];
        lastSnapshotRef.current = clonePlain(currentSnapshot);
        refreshHistoryAvailability();
        return true;
    }, [clonePlain, snapshotKey, refreshHistoryAvailability]);

    // Helper: get the variant mode for an element, auto-selecting single variants
    const getVariantMode = useCallback((elementId: string): string => {
        const el = elements.find(e => e.elementId === elementId);
        let mode = inspectorVariantModes[elementId];
        if (!mode && el?.sourceElementId) {
            mode = inspectorVariantModes[el.sourceElementId];
        }
        mode = mode || 'all';

        if (mode === 'all') {
            if (el) {
                const isGroupedTextElement = el.collectionType === 'text'
                    && (el.textCollectionMode || 'all') === 'all'
                    && textCollectionGroups.some(group => group.collectionIds.includes(el.collectionId));
                if (isGroupedTextElement) return 'all';
                const col = collections.find(c => c.id === el.collectionId);
                if (col?.items.length === 1) return col.items[0].id;
            }
        }
        return mode;
    }, [inspectorVariantModes, elements, collections, textCollectionGroups]);

    // Ref to always access latest getVariantMode without re-running effects
    const getVariantModeRef = useRef(getVariantMode);
    getVariantModeRef.current = getVariantMode;

    // Set variant mode for the currently selected element
    const setVariantMode = useCallback((elementId: string, mode: string) => {
        setInspectorVariantModes(prev => ({ ...prev, [elementId]: mode }));
    }, []);

    const replaceCollections = useCallback((nextCollections: CollectionItem[], source: "items" | "versions" = "items") => {
        const normalizedCollections = source === "versions"
            ? normalizeCollectionsForLoad(nextCollections)
            : syncCollectionsWithActiveVersions(nextCollections);
        collectionsRef.current = normalizedCollections;
        setCollections(normalizedCollections);
    }, []);

    const replaceTextCollectionGroups = useCallback((nextGroups: TextCollectionGroup[]) => {
        textCollectionGroupsRef.current = nextGroups;
        setTextCollectionGroups(nextGroups);
    }, []);

    useEffect(() => {
        const loadNestedSequences = async () => {
            if (!compositionId) {
                setNestedSequences([]);
                return;
            }
            try {
                const res = await fetch(`/api/compositions?parentId=${compositionId}&kind=sequence`);
                if (!res.ok) throw new Error("Failed to fetch nested compositions");
                const data = await res.json();
                const sequences = Array.isArray(data) ? data : [];
                nestedSequencesRef.current = sequences;
                setNestedSequences(sequences);
                replaceCollections(syncSubCompositionVariantLabels(collectionsRef.current, sequences));
            } catch (error) {
                console.error("Failed to fetch nested compositions", error);
            }
        };
        void loadNestedSequences();
    }, [compositionId, replaceCollections]);

    useEffect(() => {
        if (compositionId) {
            undoStackRef.current = [];
            redoStackRef.current = [];
            lastSnapshotRef.current = null;
            historyInitializedRef.current = false;
            refreshHistoryAvailability();
            setRenderQueue([]);
            setFetching(true);
            const loadComposition = async () => {
                try {
                    const res = await fetch(`/api/compositions/${compositionId}`);
                    const data = await res.json();
                    const isChildComposition = Boolean(data.parentId);
                    setIsSubCompositionEditor(isChildComposition);
                    setParentComposition(null);
                    parentCompositionRef.current = null;
                    parentAllCollectionsRef.current = [];
                    parentSharedCollectionsRef.current = [];
                    parentSharedTextGroupsRef.current = [];
                    parentSharedRenderQueueRef.current = [];
                    sharedParentCollectionIdsRef.current = new Set();

                    if (data.parentId) {
                        try {
                            const parentRes = await fetch(`/api/compositions/${data.parentId}`);
                            const parentData = parentRes.ok ? await parentRes.json() : null;
                            if (parentData?.id && parentData?.title) {
                                const parentSummary = { id: parentData.id, title: parentData.title };
                                setParentComposition(parentSummary);
                                parentCompositionRef.current = parentSummary;
                                const parentParsed = parseCollectionsPayload(parentData.collections);
                                const parentCollections = normalizeCollectionsForLoad(parentParsed.items);
                                const parentVisibleCollections = withoutSubCompositionCollections(parentCollections);
                                parentAllCollectionsRef.current = parentCollections;
                                parentSharedCollectionsRef.current = parentVisibleCollections;
                                parentSharedTextGroupsRef.current = parentParsed.textGroups;
                                parentSharedRenderQueueRef.current = parentParsed.renderQueue;
                                sharedParentCollectionIdsRef.current = new Set(parentVisibleCollections.map(collection => collection.id));
                            }
                        } catch (err) {
                            console.error("Failed to fetch parent composition", err);
                        }
                    }
                    if (data.elements) {
                        try { setElements(typeof data.elements === 'string' ? JSON.parse(data.elements) : data.elements); } catch (e) { }
                    }
                    if (data.tracks) {
                        try { 
                            const parsedTracks = typeof data.tracks === 'string' ? JSON.parse(data.tracks) : data.tracks; 
                            if (parsedTracks && parsedTracks.length > 0) setTracks(parsedTracks);
                        } catch (e) { }
                    }
                    if (data.collections) {
                        try {
                            const parsedCols = parseCollectionsPayload(data.collections);
                            const visibleCollections = isChildComposition
                                ? mergeParentAndChildCollections(parentSharedCollectionsRef.current, parsedCols.items)
                                : normalizeCollectionsForLoad(parsedCols.items);
                            const syncedCollections = syncSubCompositionVariantLabels(visibleCollections, nestedSequencesRef.current);
                            replaceCollections(syncedCollections);
                            replaceTextCollectionGroups(pruneTextGroupsForCollections(parsedCols.textGroups, syncedCollections));
                            setRenderQueue(parsedCols.renderQueue);
                        } catch (e) { }
                    }
                    if (data.duration) {
                        setTOTAL_DURATION(data.duration);
                    }
                    if (data.title) {
                        setTitle(data.title);
                    }
                } catch (err) {
                    console.error("Failed to fetch composition", err);
                } finally {
                    setFetching(false);
                }
            };
            void loadComposition();
        }
    }, [compositionId, refreshHistoryAvailability, replaceCollections, replaceTextCollectionGroups]);

    useEffect(() => {
        if (fetching) return;

        const currentSnapshot = captureSnapshot();

        if (!historyInitializedRef.current) {
            lastSnapshotRef.current = clonePlain(currentSnapshot);
            historyInitializedRef.current = true;
            return;
        }
        if (historyApplyingRef.current) {
            lastSnapshotRef.current = clonePlain(currentSnapshot);
            return;
        }

        if (historyDebounceRef.current) {
            window.clearTimeout(historyDebounceRef.current);
        }
        historyDebounceRef.current = window.setTimeout(() => {
            historyDebounceRef.current = null;
            commitSnapshotToHistory(currentSnapshot);
        }, HISTORY_DEBOUNCE_MS);

        return () => {
            if (historyDebounceRef.current) {
                window.clearTimeout(historyDebounceRef.current);
            }
        };
    }, [fetching, captureSnapshot, clonePlain, commitSnapshotToHistory]);

    const undoHistory = useCallback(() => {
        if (historyDebounceRef.current) {
            window.clearTimeout(historyDebounceRef.current);
            historyDebounceRef.current = null;
        }
        commitSnapshotToHistory(captureSnapshot());

        const previousSnapshot = undoStackRef.current.pop();
        if (!previousSnapshot) return;

        const currentSnapshot = captureSnapshot();
        redoStackRef.current.push(clonePlain(currentSnapshot));
        applySnapshot(previousSnapshot);
        refreshHistoryAvailability();
    }, [captureSnapshot, clonePlain, applySnapshot, refreshHistoryAvailability, commitSnapshotToHistory]);

    const redoHistory = useCallback(() => {
        if (historyDebounceRef.current) {
            window.clearTimeout(historyDebounceRef.current);
            historyDebounceRef.current = null;
        }
        commitSnapshotToHistory(captureSnapshot());

        const nextSnapshot = redoStackRef.current.pop();
        if (!nextSnapshot) return;

        const currentSnapshot = captureSnapshot();
        undoStackRef.current.push(clonePlain(currentSnapshot));
        applySnapshot(nextSnapshot);
        refreshHistoryAvailability();
    }, [captureSnapshot, clonePlain, applySnapshot, refreshHistoryAvailability, commitSnapshotToHistory]);

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            const isMeta = event.metaKey || event.ctrlKey;
            if (!isMeta) return;

            const target = event.target as HTMLElement | null;
            const tag = target?.tagName?.toLowerCase();
            const isTyping = tag === 'input' || tag === 'textarea' || !!target?.isContentEditable;
            if (isTyping) return;

            const key = event.key.toLowerCase();
            if (key === 'z') {
                event.preventDefault();
                if (event.shiftKey) redoHistory();
                else undoHistory();
                return;
            }
            if (key === 'y') {
                event.preventDefault();
                redoHistory();
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [undoHistory, redoHistory]);

    // New Collection form
    const [isCreatingCollection, setIsCreatingCollection] = useState(false);
    const [newCollectionTitle, setNewCollectionTitle] = useState("");
    const [newCollectionType, setNewCollectionType] = useState<CollectionType>("text");
    const [isCreatingTextGroup, setIsCreatingTextGroup] = useState(false);
    const [newTextGroupTitle, setNewTextGroupTitle] = useState("");
    const [newTextGroupSelection, setNewTextGroupSelection] = useState<Record<string, boolean>>({});
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
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [previewLoop, setPreviewLoop] = useState(false);
    const [variantSeed, setVariantSeed] = useState(1);
    const lastFrameRef = useRef<number>(0);
    const lastPublishedFrameRef = useRef<number>(0);
    const currentTimeRef = useRef(0);
    const playbackTimeRef = useRef(0);
    const playbackRafRef = useRef<number | null>(null);

    const hashString = (str: string) => {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        // MurmurHash3 avalanche to ensure sequential inputs produce highly uncorrelated seeds
        hash ^= hash >>> 16;
        hash = Math.imul(hash, 0x85ebca6b);
        hash ^= hash >>> 13;
        hash = Math.imul(hash, 0xc2b2ae35);
        hash ^= hash >>> 16;
        
        return Math.abs(hash);
    };

    function mulberry32(a: number) {
        return function() {
            let t = a += 0x6D2B79F5;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        }
    }

    const pickWeightedByUsage = useCallback(<T extends { id: string },>(
        candidates: T[],
        seedKey: string,
        usageLookup: Record<string, number>,
        usageScale = 2
    ): T | null => {
        if (candidates.length === 0) return null;
        if (candidates.length === 1) return candidates[0];

        const random = mulberry32(hashString(seedKey));
        const usages = candidates.map(candidate => usageLookup[candidate.id] || 0);
        const minUsage = Math.min(...usages);
        const weights = candidates.map((_, index) => {
            const relativeUsage = usages[index] - minUsage;
            return 100 / (1 + relativeUsage * usageScale);
        });

        const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
        if (!Number.isFinite(totalWeight) || totalWeight <= 0) {
            return candidates[Math.floor(random() * candidates.length)] ?? candidates[0];
        }

        let cursor = random() * totalWeight;
        for (let i = 0; i < candidates.length; i++) {
            cursor -= weights[i];
            if (cursor <= 0) return candidates[i];
        }

        return candidates[candidates.length - 1];
    }, []);

    const pickVariantCandidate = useCallback(<T extends { id: string },>(
        el: CanvasElement,
        candidates: T[],
        seedKey: string,
        usageLookup: Record<string, number>,
        usageScale = 2
    ): T | null => {
        if (candidates.length === 0) return null;
        if (getElementVariantSelectionMode(el) === "sequential") {
            const sequenceIndex = el.variantSequenceIndex ?? variantSeed;
            const index = Math.max(0, sequenceIndex - 1) % candidates.length;
            return candidates[index] ?? candidates[0];
        }
        return pickWeightedByUsage(candidates, seedKey, usageLookup, usageScale);
    }, [pickWeightedByUsage, variantSeed]);

    const [variantUsage, setVariantUsage] = useState<Record<string, number>>(() => {
        if (typeof window !== 'undefined') {
            try { return JSON.parse(localStorage.getItem('dropai_variant_usage') || '{}'); } catch(e) {}
        }
        return {};
    });

    const recordVariantUsage = useCallback((usedVariantIds: string[]) => {
        setVariantUsage(prev => {
            const next = { ...prev };
            for (const id of Array.from(new Set(usedVariantIds.filter(Boolean)))) {
                next[id] = (next[id] || 0) + 1;
            }
            if (typeof window !== 'undefined') {
                localStorage.setItem('dropai_variant_usage', JSON.stringify(next));
            }
            return next;
        });
    }, []);

    const isCollectionElement = useCallback((type: TimelineElementType): type is PlayableCollectionType => {
        return type === 'text' || type === 'image' || type === 'video' || type === 'audio';
    }, []);

    const getSortedElementsForSelection = useCallback((
        targetElements: CanvasElement[],
        collectionById: Map<string, CollectionItem>,
        resolvedIds: Record<string, string> = {},
    ) => {
        const isLinkSourceCollection = (colId: string) => {
            const collection = collectionById.get(colId);
            return collection ? collection.items.some(variant => variant.linkedVariantIds?.length) : false;
        };

        return [...targetElements].sort((a, b) => {
            const aColId = resolvedIds[a.elementId] || a.collectionId;
            const bColId = resolvedIds[b.elementId] || b.collectionId;
            const aIsSource = isLinkSourceCollection(aColId) ? 0 : 1;
            const bIsSource = isLinkSourceCollection(bColId) ? 0 : 1;
            if (aIsSource !== bIsSource) return aIsSource - bIsSource;
            return a.startTime - b.startTime;
        });
    }, []);

    const getSelectableVariants = useCallback((
        collection: CollectionItem,
        resolvedCollectionId: string,
        localExcluded: Set<string>,
        pickedVariantIds: Set<string>,
        pickedByCollection: Record<string, Set<string>>,
        collectionById: Map<string, CollectionItem>,
        variantToCollectionId: Map<string, string>,
    ) => {
        const requiredLinkSets: Set<string>[] = [];
        const evaluatedCollectionIds = new Set<string>();

        for (const pickedId of pickedVariantIds) {
            const pickedCollectionId = variantToCollectionId.get(pickedId);
            if (pickedCollectionId) evaluatedCollectionIds.add(pickedCollectionId);
            const pickedVariant = pickedCollectionId
                ? collectionById.get(pickedCollectionId)?.items.find(item => item.id === pickedId)
                : null;
            const linksInThisCollection = pickedVariant?.linkedVariantIds
                ?.filter(linkedId => collection.items.some(item => item.id === linkedId)) || [];
            if (linksInThisCollection.length > 0) {
                requiredLinkSets.push(new Set(linksInThisCollection));
            }
        }

        let candidates = collection.items.filter(candidate => {
            if (candidate.excluded || localExcluded.has(candidate.id)) return false;
            if (requiredLinkSets.some(linkSet => !linkSet.has(candidate.id))) return false;

            for (const evaluatedCollectionId of evaluatedCollectionIds) {
                if (evaluatedCollectionId === collection.id) continue;
                const evaluatedCollection = collectionById.get(evaluatedCollectionId);
                if (!evaluatedCollection) continue;

                const linksToEvaluatedCollection = candidate.linkedVariantIds
                    ?.filter(linkedId => evaluatedCollection.items.some(item => item.id === linkedId)) || [];
                if (linksToEvaluatedCollection.length === 0) continue;

                const pickedInEvaluatedCollection = evaluatedCollection.items.filter(item => pickedVariantIds.has(item.id));
                if (!pickedInEvaluatedCollection.some(picked => linksToEvaluatedCollection.includes(picked.id))) {
                    return false;
                }
            }

            return true;
        });

        const alreadyPicked = pickedByCollection[resolvedCollectionId] || pickedByCollection[collection.id];
        if (alreadyPicked?.size) {
            const deduped = candidates.filter(candidate => !alreadyPicked.has(candidate.id));
            if (deduped.length > 0) candidates = deduped;
        }

        return candidates;
    }, []);

    const rememberPickedVariant = useCallback((
        variant: CollectionVariant | null | undefined,
        collectionId: string,
        pickedVariantIds: Set<string>,
        pickedByCollection: Record<string, Set<string>>,
    ) => {
        if (!variant || isNullVariant(variant)) return;
        pickedVariantIds.add(variant.id);
        if (!pickedByCollection[collectionId]) pickedByCollection[collectionId] = new Set();
        pickedByCollection[collectionId].add(variant.id);
    }, []);

    const parseNestedSequence = useCallback((sequence: NestedSequenceRecord) => {
        const parsedCollections = parseCollectionsPayload(sequence.collections);
        const sequenceTracks = typeof sequence.tracks === 'string'
            ? JSON.parse(sequence.tracks || '[]')
            : sequence.tracks;
        const sequenceElements = typeof sequence.elements === 'string'
            ? JSON.parse(sequence.elements || '[]')
            : sequence.elements;
        const sequenceCollections = sequence.parentId === compositionId
            ? mergeParentAndChildCollections(collections, parsedCollections.items)
            : normalizeCollectionsForLoad(parsedCollections.items);

        return {
            collections: sequenceCollections,
            textGroups: pruneTextGroupsForCollections(parsedCollections.textGroups, sequenceCollections),
            tracks: (Array.isArray(sequenceTracks) && sequenceTracks.length > 0 ? sequenceTracks : [{ id: 'track-0', magnet: false }]) as TrackConfig[],
            elements: (Array.isArray(sequenceElements) ? sequenceElements : []) as CanvasElement[],
        };
    }, [compositionId, collections]);

    const getResolvedCollectionIdsForElements = useCallback((
        targetElements: CanvasElement[],
        targetCollections: CollectionItem[],
        targetTextGroups: TextCollectionGroup[] = [],
    ) => {
        const result: Record<string, string> = {};
        const collectionById = new Map(targetCollections.map(c => [c.id, c]));
        const collectionToGroupId: Record<string, string> = {};
        const groupById: Record<string, TextCollectionGroup> = {};

        for (const group of targetTextGroups) {
            groupById[group.id] = group;
            for (const colId of group.collectionIds) {
                if (!collectionToGroupId[colId]) collectionToGroupId[colId] = group.id;
            }
        }

        for (const el of targetElements) {
            if (el.collectionType !== 'text') {
                result[el.elementId] = el.collectionId;
                continue;
            }

            const groupId = collectionToGroupId[el.collectionId];
            const group = groupId ? groupById[groupId] : null;
            if (!group) {
                result[el.elementId] = el.collectionId;
                continue;
            }

            const localExcluded = new Set(el.localExcludedVariantIds || []);
            const candidateIds = group.collectionIds.filter((colId) => {
                const col = collectionById.get(colId);
                if (!col || col.type !== 'text' || col.items.length === 0) return false;
                return col.items.some(v => !v.excluded && !localExcluded.has(v.id));
            });

            if (candidateIds.length === 0) {
                result[el.elementId] = el.collectionId;
                continue;
            }

            const mode = el.textCollectionMode || 'all';
            if (mode !== 'all' && candidateIds.includes(mode)) {
                result[el.elementId] = mode;
                continue;
            }

            const pickedCollectionId = pickVariantCandidate(
                el,
                candidateIds.map(id => ({ id })),
                `${variantSeed}-${getElementSelectionKey(el)}-group-${group.id}`,
                {},
                1
            )?.id;

            result[el.elementId] = pickedCollectionId || candidateIds[0];
        }

        return result;
    }, [pickVariantCandidate, variantSeed]);

    const getVariantModesForElements = useCallback((
        targetElements: CanvasElement[],
        targetCollections: CollectionItem[],
        targetTextGroups: TextCollectionGroup[] = [],
    ) => {
        const modes: Record<string, string> = {};
        const collectionById = new Map(targetCollections.map(c => [c.id, c]));
        const variantToCollectionId = new Map<string, string>();
        for (const collection of targetCollections) {
            collection.items.forEach(item => variantToCollectionId.set(item.id, collection.id));
        }
        const resolvedCollectionIds = getResolvedCollectionIdsForElements(targetElements, targetCollections, targetTextGroups);
        const pickedVariantIds = new Set<string>();
        const pickedByCollection: Record<string, Set<string>> = {};

        const sortedElements = getSortedElementsForSelection(targetElements, collectionById, resolvedCollectionIds);
        for (const el of sortedElements) {
            if (!isCollectionElement(el.collectionType)) continue;
            const resolvedCollectionId = resolvedCollectionIds[el.elementId] || el.collectionId;
            const col = collectionById.get(resolvedCollectionId);
            if (!col?.items.length) continue;

            const localExcluded = new Set(el.localExcludedVariantIds || []);
            const candidates = getSelectableVariants(col, resolvedCollectionId, localExcluded, pickedVariantIds, pickedByCollection, collectionById, variantToCollectionId);
            const selectedVariant = el.selectedVariantId
                ? candidates.find(item => item.id === el.selectedVariantId)
                : undefined;

            let picked = selectedVariant || null;
            if (!picked) {
                picked = pickVariantCandidate(el, candidates, `${variantSeed}-${getElementSelectionKey(el)}-variant`, variantUsage);
            }

            if (picked) {
                modes[el.elementId] = picked.id;
                rememberPickedVariant(picked, resolvedCollectionId, pickedVariantIds, pickedByCollection);
            }
        }

        return modes;
    }, [getResolvedCollectionIdsForElements, getSelectableVariants, getSortedElementsForSelection, isCollectionElement, pickVariantCandidate, rememberPickedVariant, variantSeed, variantUsage]);

    const resolveNestedSequenceVariant = useCallback((parent: CanvasElement, sourceCollections: CollectionItem[] = collections) => {
        const variantCollection = sourceCollections.find(c => c.id === parent.collectionId && c.type === 'subComposition')
            || collections.find(c => c.id === parent.collectionId && c.type === 'subComposition');

        if (!variantCollection) {
            const sequenceId = parent.nestedSequenceId;
            const sequence = sequenceId ? nestedSequences.find(s => s.id === sequenceId) : null;
            return sequence ? { sequence, variantId: sequenceId } : null;
        }

        const localExcluded = new Set(parent.localExcludedVariantIds || []);
        const requestedMode = parent.selectedVariantId || getVariantMode(parent.elementId);
        let picked = requestedMode && requestedMode !== 'all'
            ? variantCollection.items.find(item => item.id === requestedMode && !item.excluded && !localExcluded.has(item.id)) || null
            : null;

        if (!picked) {
            picked = pickVariantCandidate(
                parent,
                variantCollection.items.filter(item => !item.excluded && !localExcluded.has(item.id)),
                `${variantSeed}-${getElementSelectionKey(parent)}-subcomposition`,
                variantUsage,
            );
        }

        if (isNullVariant(picked)) return null;

        const sequenceId = picked?.value || picked?.id || parent.nestedSequenceId;
        const sequence = sequenceId ? nestedSequences.find(s => s.id === sequenceId) : null;
        return sequence ? { sequence, variantId: picked?.id || sequenceId } : null;
    }, [collections, getVariantMode, nestedSequences, pickVariantCandidate, variantSeed, variantUsage]);

    const getNestedChildSequenceIndex = useCallback((parent: CanvasElement, sourceCollections: CollectionItem[]) => {
        const parentSequenceIndex = parent.variantSequenceIndex ?? variantSeed;
        if (getElementVariantSelectionMode(parent) !== "sequential") return parentSequenceIndex;
        if (getVariantMode(parent.elementId) !== "all") return parentSequenceIndex;

        const variantCollection = sourceCollections.find(c => c.id === parent.collectionId && c.type === "subComposition")
            || collections.find(c => c.id === parent.collectionId && c.type === "subComposition");
        if (!variantCollection) return parentSequenceIndex;

        const localExcluded = new Set(parent.localExcludedVariantIds || []);
        const validVariantCount = variantCollection.items.filter(item => !item.excluded && !localExcluded.has(item.id)).length;
        if (validVariantCount <= 1) return parentSequenceIndex;

        return Math.floor((parentSequenceIndex - 1) / validVariantCount) + 1;
    }, [collections, getVariantMode, variantSeed]);

    const getNestedSequenceDuration = useCallback(function computeDuration(sequence: NestedSequenceRecord, path: string[] = []): number {
        if (path.includes(sequence.id)) return Math.max(0.1, sequence.duration || 0.1);

        const parsed = parseNestedSequence(sequence);
        if (parsed.elements.length === 0) return EMPTY_NESTED_COMPOSITION_DISPLAY_DURATION;

        const elementsWithNestedDurations = parsed.elements.map(el => {
            if (el.collectionType !== 'nestedSequence') return el;
            const resolved = resolveNestedSequenceVariant(el, parsed.collections);
            if (!resolved) return el;
            return {
                ...el,
                nestedSequenceId: resolved.sequence.id,
                selectedVariantId: resolved.variantId,
                duration: Math.min(el.duration, computeDuration(resolved.sequence, [...path, sequence.id])),
            };
        });

        const childVariantModes = getVariantModesForElements(elementsWithNestedDurations, parsed.collections, parsed.textGroups);
        const childTimings = resolveElementTimings(elementsWithNestedDurations, parsed.tracks, parsed.collections, elId => childVariantModes[elId] || 'all');
        const maxEnd = elementsWithNestedDurations.reduce((max, el) => {
            const timing = childTimings.get(el.elementId) || { startTime: el.startTime, duration: el.duration };
            return Math.max(max, timing.startTime + timing.duration);
        }, 0);

        return Math.max(0.1, Math.round(maxEnd * 1000) / 1000);
    }, [getVariantModesForElements, parseNestedSequence, resolveNestedSequenceVariant]);

    const nestedSequenceDurations = useMemo(() => {
        const durations: Record<string, number> = {};
        for (const sequence of nestedSequences) {
            durations[sequence.id] = getNestedSequenceDuration(sequence);
        }
        return durations;
    }, [nestedSequences, getNestedSequenceDuration]);

    const getContextualNestedSequenceDuration = useCallback(function computeContextualDuration(
        parent: CanvasElement,
        sourceCollections: CollectionItem[] = collections,
        path: string[] = [],
    ): number {
        const resolvedParent = resolveNestedSequenceVariant(parent, sourceCollections);
        if (!resolvedParent) return 0;
        if (path.includes(resolvedParent.sequence.id)) return Math.max(0.1, resolvedParent.sequence.duration || 0.1);

        const sequence = resolvedParent.sequence;
        const parsed = parseNestedSequence(sequence);
        if (parsed.elements.length === 0) return EMPTY_NESTED_COMPOSITION_DISPLAY_DURATION;

        const childSequenceIndex = getNestedChildSequenceIndex(parent, parsed.collections);
        const elementsWithNestedDurations = parsed.elements.map(child => {
            const childWithSequenceIndex = { ...child, variantSequenceIndex: childSequenceIndex };
            if (child.collectionType !== 'nestedSequence') return childWithSequenceIndex;

            const resolvedChild = resolveNestedSequenceVariant(childWithSequenceIndex, parsed.collections);
            if (!resolvedChild) return childWithSequenceIndex;

            return {
                ...childWithSequenceIndex,
                nestedSequenceId: resolvedChild.sequence.id,
                selectedVariantId: resolvedChild.variantId,
                duration: Math.min(
                    child.duration,
                    computeContextualDuration(childWithSequenceIndex, parsed.collections, [...path, sequence.id]),
                ),
            };
        });

        const childVariantModes = getVariantModesForElements(elementsWithNestedDurations, parsed.collections, parsed.textGroups);
        const childTimings = resolveElementTimings(elementsWithNestedDurations, parsed.tracks, parsed.collections, elId => childVariantModes[elId] || 'all');
        const maxEnd = elementsWithNestedDurations.reduce((max, el) => {
            const timing = childTimings.get(el.elementId) || { startTime: el.startTime, duration: el.duration };
            return Math.max(max, timing.startTime + timing.duration);
        }, 0);

        return Math.max(0.1, Math.round(maxEnd * 1000) / 1000);
    }, [collections, getNestedChildSequenceIndex, getVariantModesForElements, parseNestedSequence, resolveNestedSequenceVariant]);

    const createSubCompositionGroupClip = useCallback((
        collection: CollectionItem,
        placement?: { x?: number; y?: number; startTime?: number },
    ): CanvasElement => {
        const targetTrackId = tracks.length > 0 ? tracks[0].id : 'track-0';
        const trackSiblings = elements.filter(e => (e.trackId || 'track-0') === targetTrackId);
        let bestStart = 0;
        for (const sib of trackSiblings) {
            const subCompositionCollection = collections.find(c => c.id === sib.collectionId && c.type === 'subComposition');
            const siblingDuration = subCompositionCollection
                ? Math.min(sib.duration, Math.max(0.1, ...subCompositionCollection.items.filter(item => !isNullVariant(item)).map(item => nestedSequenceDurations[item.value || item.id] ?? 0.1)))
                : sib.collectionType === 'nestedSequence' && sib.nestedSequenceId
                    ? Math.min(sib.duration, nestedSequenceDurations[sib.nestedSequenceId] ?? sib.duration)
                    : sib.duration;
            bestStart = Math.max(bestStart, sib.startTime + siblingDuration);
        }

        const sequenceIds = collection.items.filter(item => !isNullVariant(item)).map(item => item.value || item.id).filter(Boolean);
        const durations = sequenceIds.map(id => nestedSequenceDurations[id] ?? nestedSequences.find(seq => seq.id === id)?.duration ?? 0.1);
        const maxDuration = Math.max(0.1, ...durations);
        const firstSequenceId = sequenceIds[0];
        const newId = `el-subcomp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

        return {
            elementId: newId,
            sourceElementId: newId,
            collectionId: collection.id,
            collectionType: 'nestedSequence',
            title: collection.title,
            x: placement?.x ?? 12,
            y: placement?.y ?? 12,
            width: 76,
            height: 12,
            zIndex: elements.length + 1,
            content: "Nested Composition",
            startTime: placement?.startTime ?? Math.round(bestStart * 10) / 10,
            duration: maxDuration,
            trackId: targetTrackId,
            rotation: 0,
            opacity: 1,
            visible: true,
            animations: [],
            nestedSequenceId: firstSequenceId,
            variantSelectionMode: "random",
        };
    }, [collections, elements, nestedSequenceDurations, nestedSequences, tracks]);

    const expandNestedSequenceClip = useCallback((parent: CanvasElement, path: string[] = []): CanvasElement[] => {
        const resolvedParent = resolveNestedSequenceVariant(parent);
        if (!resolvedParent) return [];
        if (path.includes(resolvedParent.sequence.id)) {
            throw new Error(`Circular nested composition reference detected: ${[...path, resolvedParent.sequence.id].join(" -> ")}`);
        }
        const sequence = resolvedParent.sequence;
        const parsed = parseNestedSequence(sequence);
        const parentDuration = Math.min(parent.duration, getContextualNestedSequenceDuration(parent, collections, path));
        const childSequenceIndex = getNestedChildSequenceIndex(parent, parsed.collections);
        const elementsWithNestedDurations = parsed.elements.map(child => {
            const childWithSequenceIndex = { ...child, variantSequenceIndex: childSequenceIndex };
            if (child.collectionType !== 'nestedSequence') return childWithSequenceIndex;
            const resolvedChild = resolveNestedSequenceVariant(childWithSequenceIndex, parsed.collections);
            if (!resolvedChild) return childWithSequenceIndex;
            return {
                ...childWithSequenceIndex,
                nestedSequenceId: resolvedChild.sequence.id,
                selectedVariantId: resolvedChild.variantId,
                duration: Math.min(child.duration, getContextualNestedSequenceDuration(childWithSequenceIndex, parsed.collections, [...path, sequence.id])),
            };
        });
        const childResolvedCollectionIds = getResolvedCollectionIdsForElements(elementsWithNestedDurations, parsed.collections, parsed.textGroups);
        const childVariantModes = getVariantModesForElements(elementsWithNestedDurations, parsed.collections, parsed.textGroups);
        const childTimings = resolveElementTimings(elementsWithNestedDurations, parsed.tracks, parsed.collections, elId => childVariantModes[elId] || 'all');
        const childTrackCount = Math.max(1, parsed.tracks.length);

        return elementsWithNestedDurations.flatMap((child, index) => {
            const timing = childTimings.get(child.elementId) || { startTime: child.startTime, duration: child.duration };
            const remainingDuration = parentDuration - timing.startTime;
            if (remainingDuration <= 0) return [];
            const childTrackIndex = Math.max(0, parsed.tracks.findIndex(track => track.id === (child.trackId || 'track-0')));
            const childTrackStack = Math.max(0, childTrackCount - childTrackIndex) * 1000;
            const childLocalZ = Math.max(0, Math.min(999, child.zIndex || index));
            const parentLocalBand = Math.max(0, Math.min(8, parent.zIndex || 0)) * 1000;
            const flattenedZ = Math.min(9999, parentLocalBand + childTrackStack + childLocalZ);
            const resolvedChildCollectionId = childResolvedCollectionIds[child.elementId] || child.collectionId;
            const childBase: CanvasElement = {
                ...child,
                elementId: `${parent.elementId}-${child.elementId}`,
                sourceElementId: `${parent.elementId}-${child.elementId}`,
                collectionId: child.collectionType === 'text' ? resolvedChildCollectionId : child.collectionId,
                variantSeedKey: getElementSelectionKey(child),
                variantSequenceIndex: child.variantSequenceIndex,
                selectedVariantId: childVariantModes[child.elementId],
                nestedCompositionTransform: {
                    x: parent.x,
                    y: parent.y,
                    width: parent.width,
                    height: parent.height,
                    rotation: parent.rotation,
                    opacity: parent.opacity,
                    startTime: parent.startTime,
                    duration: parentDuration,
                    animations: parent.animations || [],
                },
                startTime: parent.startTime + timing.startTime,
                duration: Math.min(timing.duration, remainingDuration),
                trackId: parent.trackId,
                zIndex: flattenedZ,
            };
            if (childBase.collectionType === 'nestedSequence') {
                return expandNestedSequenceClip(childBase, [...path, sequence.id]);
            }
            return [childBase];
        });
    }, [collections, getContextualNestedSequenceDuration, getNestedChildSequenceIndex, getResolvedCollectionIdsForElements, getVariantModesForElements, parseNestedSequence, resolveNestedSequenceVariant]);

    const flattenTimelineElements = useCallback((): CanvasElement[] => {
        const flattened: CanvasElement[] = [];
        const pickedBySubCompositionCollection: Record<string, Set<string>> = {};
        for (const el of elements) {
            if (isCollectionElement(el.collectionType)) {
                flattened.push(el);
                continue;
            }

            if (el.collectionType === 'nestedSequence') {
                const subCompositionCollection = collections.find(c => c.id === el.collectionId && c.type === 'subComposition');
                if (!subCompositionCollection) {
                    flattened.push(...expandNestedSequenceClip(el));
                    continue;
                }

                const localExcluded = new Set(el.localExcludedVariantIds || []);
                const requestedMode = getVariantMode(el.elementId);
                let picked = requestedMode !== 'all'
                    ? subCompositionCollection.items.find(item => item.id === requestedMode && !item.excluded && !localExcluded.has(item.id)) || null
                    : null;

                if (!picked) {
                    let candidates = subCompositionCollection.items.filter(item => !item.excluded && !localExcluded.has(item.id));
                    const alreadyPicked = pickedBySubCompositionCollection[subCompositionCollection.id];
                    if (alreadyPicked && candidates.some(item => !alreadyPicked.has(item.id))) {
                        candidates = candidates.filter(item => !alreadyPicked.has(item.id));
                    }
                    picked = pickVariantCandidate(el, candidates, `${variantSeed}-${getElementSelectionKey(el)}-subcomposition`, variantUsage);
                }

                if (isNullVariant(picked)) continue;

                const selectedSequenceId = picked?.value || picked?.id || el.nestedSequenceId;
                if (picked && !isNullVariant(picked)) {
                    if (!pickedBySubCompositionCollection[subCompositionCollection.id]) {
                        pickedBySubCompositionCollection[subCompositionCollection.id] = new Set();
                    }
                    pickedBySubCompositionCollection[subCompositionCollection.id].add(picked.id);
                }

                flattened.push(...expandNestedSequenceClip({
                    ...el,
                    nestedSequenceId: selectedSequenceId,
                    selectedVariantId: picked?.id,
                }));
            }
        }
        return flattened;
    }, [collections, elements, expandNestedSequenceClip, getVariantMode, isCollectionElement, pickVariantCandidate, variantSeed, variantUsage]);

    const getSelectionKey = useCallback((el: CanvasElement) => {
        return getElementSelectionKey(el);
    }, []);

    const collectionToTextGroupId = useMemo(() => {
        const map: Record<string, string> = {};
        for (const group of textCollectionGroups) {
            for (const colId of group.collectionIds) {
                if (!map[colId]) map[colId] = group.id;
            }
        }
        return map;
    }, [textCollectionGroups]);

    const textGroupById = useMemo(() => {
        const map: Record<string, TextCollectionGroup> = {};
        for (const group of textCollectionGroups) map[group.id] = group;
        return map;
    }, [textCollectionGroups]);

    const resolvedCollectionIdByElement = useMemo(() => {
        return getResolvedCollectionIdsForElements(elements, collections, textCollectionGroups);
    }, [collections, elements, getResolvedCollectionIdsForElements, textCollectionGroups]);

    const previewVariants = useMemo(() => {
        const variants: Record<string, CollectionVariant | null> = {};
        
        // Calculate usage from currently queued items to apply bias even before rendering starts
        const queueUsages = renderQueue.reduce((acc, curr) => {
            if (curr.usedVariantIds) {
                curr.usedVariantIds.forEach(id => {
                    acc[id] = (acc[id] || 0) + 1;
                });
            }
            return acc;
        }, {} as Record<string, number>);
        const combinedUsage = { ...variantUsage };
        for (const [id, count] of Object.entries(queueUsages)) {
            combinedUsage[id] = (combinedUsage[id] || 0) + count;
        }
        const collectionById = new Map(collections.map(c => [c.id, c]));
        const variantToCollectionId = new Map<string, string>();
        for (const collection of collections) {
            collection.items.forEach(item => variantToCollectionId.set(item.id, collection.id));
        }

        const sortedElements = getSortedElementsForSelection(elements, collectionById, resolvedCollectionIdByElement);
        const pickedVariantIds = new Set<string>();
        const pickedByCollection: Record<string, Set<string>> = {};

        sortedElements.forEach(el => {
            const resolvedColId = resolvedCollectionIdByElement[el.elementId] || el.collectionId;
            const col = collectionById.get(resolvedColId);
            if (col && col.items.length > 0) {
                const selectionKey = getSelectionKey(el);
                const userMode = getVariantMode(el.elementId);
                const localExcluded = new Set(el.localExcludedVariantIds || []);
                
                let pickedVariant: CollectionVariant | null = null;
                
                if (userMode !== 'all') {
                    pickedVariant = getSelectableVariants(col, resolvedColId, localExcluded, pickedVariantIds, pickedByCollection, collectionById, variantToCollectionId)
                        .find(v => v.id === userMode) || null;
                }

                if (!pickedVariant) {
                    const finalCandidates = getSelectableVariants(col, resolvedColId, localExcluded, pickedVariantIds, pickedByCollection, collectionById, variantToCollectionId);
                    if (finalCandidates.length === 0) {
                        variants[el.elementId] = null;
                        return;
                    }

                    pickedVariant = pickVariantCandidate(el, finalCandidates, `${variantSeed}-${selectionKey}-variant`, combinedUsage);
                }
                
                variants[el.elementId] = pickedVariant;
                rememberPickedVariant(pickedVariant, resolvedColId, pickedVariantIds, pickedByCollection);
            } else {
                variants[el.elementId] = null;
            }
        });
        return variants;
    }, [elements, collections, variantSeed, variantUsage, renderQueue, resolvedCollectionIdByElement, getSelectionKey, getVariantMode, getSelectableVariants, getSortedElementsForSelection, pickVariantCandidate, rememberPickedVariant]);

    const activeVariantModes = useMemo(() => {
        const modes: Record<string, string> = {};
        for (const el of elements) {
            const userMode = getVariantMode(el.elementId);
            const previewMode = previewVariants[el.elementId]?.id || 'all';
            modes[el.elementId] = userMode !== 'all' && previewMode === userMode
                ? userMode
                : previewMode;
        }
        return modes;
    }, [elements, previewVariants, getVariantMode]);

    const elementsWithNestedDurations = useMemo(() => {
        const pickedBySubCompositionCollection: Record<string, Set<string>> = {};

        return elements.map(el => {
            if (el.collectionType !== 'nestedSequence') return el;
            const subCompositionCollection = collections.find(c => c.id === el.collectionId && c.type === 'subComposition');
            let sequenceDuration: number | undefined;
            let selectedVariantId = el.selectedVariantId;
            let selectedSequenceId = el.nestedSequenceId;

            if (subCompositionCollection) {
                const localExcluded = new Set(el.localExcludedVariantIds || []);
                const requestedMode = getVariantMode(el.elementId);
                let picked = requestedMode !== 'all'
                    ? subCompositionCollection.items.find(item => item.id === requestedMode && !item.excluded && !localExcluded.has(item.id)) || null
                    : null;

                if (!picked) {
                    let candidates = subCompositionCollection.items.filter(item => !item.excluded && !localExcluded.has(item.id));
                    const alreadyPicked = pickedBySubCompositionCollection[subCompositionCollection.id];
                    if (alreadyPicked && candidates.some(item => !alreadyPicked.has(item.id))) {
                        candidates = candidates.filter(item => !alreadyPicked.has(item.id));
                    }
                    picked = pickVariantCandidate(el, candidates, `${variantSeed}-${getElementSelectionKey(el)}-subcomposition`, variantUsage);
                }

                selectedVariantId = picked?.id;
                if (picked && !isNullVariant(picked)) {
                    const sequenceId = picked.value || picked.id || el.nestedSequenceId;
                    selectedSequenceId = sequenceId;
                    sequenceDuration = sequenceId
                        ? getContextualNestedSequenceDuration({
                            ...el,
                            nestedSequenceId: sequenceId,
                            selectedVariantId: picked.id,
                        })
                        : 0.1;
                    if (!pickedBySubCompositionCollection[subCompositionCollection.id]) {
                        pickedBySubCompositionCollection[subCompositionCollection.id] = new Set();
                    }
                    pickedBySubCompositionCollection[subCompositionCollection.id].add(picked.id);
                } else if (isNullVariant(picked)) {
                    selectedSequenceId = undefined;
                    sequenceDuration = 0;
                } else {
                    const durations = subCompositionCollection.items
                        .filter(item => !item.excluded && !localExcluded.has(item.id) && !isNullVariant(item))
                        .map(item => nestedSequenceDurations[item.value || item.id] ?? 0.1);
                    sequenceDuration = Math.max(0.1, ...durations);
                }
            } else if (el.nestedSequenceId) {
                sequenceDuration = getContextualNestedSequenceDuration(el);
            }
            if (sequenceDuration === undefined) return el;
            return {
                ...el,
                nestedSequenceId: selectedSequenceId,
                selectedVariantId,
                duration: Math.min(el.duration, sequenceDuration),
            };
        });
    }, [collections, elements, getContextualNestedSequenceDuration, getVariantMode, nestedSequenceDurations, pickVariantCandidate, variantSeed, variantUsage]);

    const elementTimings = useMemo(() => {
        return resolveElementTimings(elementsWithNestedDurations, tracks, collections, elId => activeVariantModes[elId] || 'all');
    }, [elementsWithNestedDurations, tracks, collections, activeVariantModes]);

    const flattenTimelineElementsWithResolvedTimings = useCallback((): CanvasElement[] => {
        const flattened: CanvasElement[] = [];

        for (const rawEl of elementsWithNestedDurations) {
            const timing = elementTimings.get(rawEl.elementId) || { startTime: rawEl.startTime, duration: rawEl.duration };
            const el = {
                ...rawEl,
                startTime: timing.startTime,
                duration: timing.duration,
            };

            if (isCollectionElement(el.collectionType)) {
                flattened.push(el);
                continue;
            }

            if (el.collectionType === 'nestedSequence') {
                const subCompositionCollection = collections.find(c => c.id === el.collectionId && c.type === 'subComposition');
                if (!subCompositionCollection) {
                    flattened.push(...expandNestedSequenceClip(el));
                    continue;
                }

                const picked = el.selectedVariantId
                    ? subCompositionCollection.items.find(item => item.id === el.selectedVariantId) || null
                    : null;
                if (isNullVariant(picked)) continue;

                flattened.push(...expandNestedSequenceClip({
                    ...el,
                    nestedSequenceId: picked?.value || picked?.id || el.nestedSequenceId,
                    selectedVariantId: picked?.id || el.selectedVariantId,
                }));
            }
        }

        return flattened;
    }, [collections, elementTimings, elementsWithNestedDurations, expandNestedSequenceClip, isCollectionElement]);

    // Auto-expand playback duration when elements extend beyond the current timeline length
    useEffect(() => {
        if (elementTimings.size === 0) return;
        let maxEnd = 0;
        for (const timing of elementTimings.values()) {
            const end = timing.startTime + timing.duration;
            if (end > maxEnd) maxEnd = end;
        }
        if (maxEnd > 0) {
            // Add 1s breathing room; never shrink below current user-set value
            const required = Math.ceil(maxEnd) + 1;
            setTOTAL_DURATION(prev => Math.max(prev, required));
        }
    }, [elementTimings]);

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

    useEffect(() => {
        currentTimeRef.current = currentTime;
        if (!isPlaying) {
            playbackTimeRef.current = currentTime;
        }
    }, [currentTime, isPlaying]);

    // rAF playback loop
    useEffect(() => {
        if (!isPlaying) {
            if (playbackRafRef.current) cancelAnimationFrame(playbackRafRef.current);
            return;
        }
        const startedAt = performance.now();
        lastFrameRef.current = startedAt;
        lastPublishedFrameRef.current = startedAt;
        playbackTimeRef.current = currentTimeRef.current;

        const tick = (now: number) => {
            const dt = (now - lastFrameRef.current) / 1000;
            lastFrameRef.current = now;

            const safeDuration = Math.max(0.001, TOTAL_DURATION);
            const nextTime = (playbackTimeRef.current + dt) % safeDuration;
            playbackTimeRef.current = nextTime;
            currentTimeRef.current = nextTime;

            if (now - lastPublishedFrameRef.current >= PLAYBACK_STATE_INTERVAL_MS) {
                lastPublishedFrameRef.current = now;
                setCurrentTime(nextTime);
            }

            playbackRafRef.current = requestAnimationFrame(tick);
        };
        playbackRafRef.current = requestAnimationFrame(tick);
        return () => {
            if (playbackRafRef.current) cancelAnimationFrame(playbackRafRef.current);
            setCurrentTime(currentTimeRef.current);
        };
    }, [isPlaying, TOTAL_DURATION]);

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
                // Apply updates to base element; base-level props like randomizeWindow are
                // always stored on the root element, not in variantOverrides.
                const newEl = { ...el, ...updates, variantOverrides: preservedOverrides };
                return newEl;
            }
            const newEl = { ...el, ...updates, variantOverrides: {} };
            return newEl;
        } else if (isMedia) {
            // Base-level properties that must always live on the root element, never in variantOverrides.
            // This prevents them from being lost when variant mode switches back to 'all'.
            const BASE_PROPS = new Set(['randomizeWindow', 'variantSelectionMode', 'volume', 'speed', 'audioFadeIn', 'audioFadeOut',
                'x', 'y', 'width', 'height', 'rotation', 'opacity', 'zIndex', 'visible',
                'aspectRatioLocked', 'animations', 'syncWith', 'matchDurationWithId', 'matchDurationWithIds', 'matchDurationOffsets',
                'textStrokeColor', 'textStrokeWidth', 'fontSize', 'fontWeight', 'fontStyle',
                'textDecoration', 'letterSpacing', 'lineHeight', 'textAlign']);

            const baseUpdates: Partial<CanvasElement> = {};
            const variantUpdates: Partial<CanvasElement> = {};
            for (const [k, v] of Object.entries(updates as Record<string, unknown>)) {
                if (BASE_PROPS.has(k)) {
                    (baseUpdates as Record<string, unknown>)[k] = v;
                } else {
                    (variantUpdates as Record<string, unknown>)[k] = v;
                }
            }

            const existing = el.variantOverrides?.[variantMode] || {};
            return {
                ...el,
                ...baseUpdates,  // base props directly on the element
                variantOverrides: {
                    ...el.variantOverrides,
                    [variantMode]: { ...existing, ...variantUpdates },
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
        const activeId = String(active.id);
        const overId = over ? String(over.id) : "";

        // --- Drop collection onto canvas ---
        if (activeId.startsWith("collection-") && isPointerOverCanvas(event)) {
            const data = active.data.current as { collection: CollectionItem } | undefined;
            const col = data?.collection;
            if (!col) return;
            if (col.type === 'subComposition') {
                if (col.items.length === 0) {
                    showToast("Create a sub-composition in this collection first.", "error");
                    return;
                }
                const rect = canvasRef.current?.getBoundingClientRect();
                let dropX = 12;
                let dropY = 12;
                if (rect) {
                    const pointer = event.activatorEvent as PointerEvent;
                    const endX = pointer.clientX + delta.x;
                    const endY = pointer.clientY + delta.y;
                    dropX = Math.max(0, Math.min(90, ((endX - rect.left) / rect.width) * 100 - 5));
                    dropY = Math.max(0, Math.min(90, ((endY - rect.top) / rect.height) * 100 - 5));
                }
                const newEl = createSubCompositionGroupClip(col, { x: dropX, y: dropY });
                setElements(prev => [...prev, newEl]);
                setSelectedElementId(newEl.elementId);
                return;
            }

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

            const playableType = col.type as PlayableCollectionType;
            const w = playableType === 'text' ? 80 : 60;
            const h = playableType === 'text' ? 8 : 40;
            const newId = `el-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
            // For audio/video, initialize per-variant timing overrides
            const isMedia = playableType === 'video' || playableType === 'audio';
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
                collectionType: playableType,
                title: col.title,
                x: dropX,
                y: dropY,
                width: w,
                height: h,
                zIndex: elements.length + 1,
                content: playableType === 'text' ? col.items[0]?.value || "YOUR TEXT HERE" : undefined,
                startTime: Math.round(bestStart * 10) / 10,
                duration: baseDuration,
                trackId: targetTrackId,
                rotation: 0,
                opacity: 1,
                visible: true,
                animations: [],
                variantSelectionMode: "random",
                ...(isMedia && Object.keys(variantOverrides).length > 0 ? { variantOverrides } : {}),
            };
            setElements(prev => [...prev, newEl]);
            setSelectedElementId(newEl.elementId);

            return;
        }

        // --- Reorder collections inside the collections pane ---
        if (activeId.startsWith("collection-") && overId.startsWith("collection-drop-")) {
            const sourceCollectionId = activeId.replace("collection-", "");
            const targetCollectionId = overId.replace("collection-drop-", "");
            if (sourceCollectionId && targetCollectionId && sourceCollectionId !== targetCollectionId) {
                applyCollectionsChange(current => {
                    const fromIndex = current.findIndex(collection => collection.id === sourceCollectionId);
                    const toIndex = current.findIndex(collection => collection.id === targetCollectionId);
                    if (fromIndex < 0 || toIndex < 0) return current;

                    const next = [...current];
                    const [moved] = next.splice(fromIndex, 1);
                    next.splice(toIndex, 0, moved);
                    return next;
                });
            }
            return;
        }

        // --- Move existing canvas element ---
        if (activeId.startsWith("canvas-")) {
            const elId = activeId.replace("canvas-", "");
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
    const selectedResolvedCollectionId = selectedElement ? (resolvedCollectionIdByElement[selectedElement.elementId] || selectedElement.collectionId) : null;
    const selectedTextCollectionGroup = selectedElement && selectedElement.collectionType === 'text'
        ? textGroupById[collectionToTextGroupId[selectedElement.collectionId] || ""]
        : undefined;

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

    const selectedNestedEditorTarget = useMemo(() => {
        if (!selectedElement || selectedElement.collectionType !== 'nestedSequence') return null;

        const subCompositionCollection = collections.find(c => c.id === selectedElement.collectionId && c.type === 'subComposition');
        if (subCompositionCollection) {
            const pickedVariantId = selectedVariantMode !== 'all'
                ? selectedVariantMode
                : previewVariants[selectedElement.elementId]?.id;
            const variant = pickedVariantId
                ? subCompositionCollection.items.find(item => item.id === pickedVariantId)
                : subCompositionCollection.items[0];
            if (isNullVariant(variant)) return null;
            const sequenceId = variant?.value || variant?.id || selectedElement.nestedSequenceId;
            if (!sequenceId) return null;
            const sequence = nestedSequences.find(item => item.id === sequenceId);
            return {
                id: sequenceId,
                title: sequence?.title || variant?.label || selectedElement.title,
            };
        }

        if (!selectedElement.nestedSequenceId) return null;
        const sequence = nestedSequences.find(item => item.id === selectedElement.nestedSequenceId);
        return {
            id: selectedElement.nestedSequenceId,
            title: sequence?.title || selectedElement.title,
        };
    }, [collections, nestedSequences, previewVariants, selectedElement, selectedVariantMode]);

    const previewTimelineItems = useMemo(() => {
        const collectionById = new Map<string, CollectionItem>(collections.map(c => [c.id, c]));
        for (const sequence of nestedSequences) {
            try {
                for (const collection of parseNestedSequence(sequence).collections) {
                    if (!collectionById.has(collection.id)) collectionById.set(collection.id, collection);
                }
            } catch (error) {
            console.warn("Failed to parse nested composition for preview", error);
            }
        }

        let timelineElements: CanvasElement[];
        try {
            timelineElements = flattenTimelineElementsWithResolvedTimings();
        } catch (error) {
            console.warn("Failed to flatten nested compositions for preview", error);
            timelineElements = elements;
        }

        const variantToCollectionId = new Map<string, string>();
        for (const collection of collectionById.values()) {
            collection.items.forEach(item => variantToCollectionId.set(item.id, collection.id));
        }
        const pickedVariantIds = new Set<string>();
        const pickedByCollection: Record<string, Set<string>> = {};
        const selectedVariants: Record<string, CollectionVariant | null> = {};

        getSortedElementsForSelection(timelineElements, collectionById, resolvedCollectionIdByElement).forEach(baseEl => {
            const resolvedColId = resolvedCollectionIdByElement[baseEl.elementId] || baseEl.collectionId;
            const col = collectionById.get(resolvedColId) || collectionById.get(baseEl.collectionId);
            if (!col?.items.length) {
                selectedVariants[baseEl.elementId] = null;
                return;
            }

            const localExcluded = new Set(baseEl.localExcludedVariantIds || []);
            const candidates = getSelectableVariants(col, resolvedColId, localExcluded, pickedVariantIds, pickedByCollection, collectionById, variantToCollectionId);
            const explicitMode = getVariantMode(baseEl.elementId);
            const explicitPicked = explicitMode !== 'all'
                ? candidates.find(item => item.id === explicitMode) || null
                : null;
            const nestedPicked = baseEl.selectedVariantId
                ? candidates.find(item => item.id === baseEl.selectedVariantId) || null
                : null;
            const statePicked = explicitPicked || nestedPicked || previewVariants[baseEl.elementId];
            let variant: CollectionVariant | null = statePicked && candidates.some(item => item.id === statePicked.id)
                ? statePicked
                : null;

            if (!variant && candidates.length > 0) {
                variant = pickVariantCandidate(baseEl, candidates, `${variantSeed}-${getSelectionKey(baseEl)}-variant`, variantUsage);
            }

            selectedVariants[baseEl.elementId] = variant;
            rememberPickedVariant(variant, resolvedColId, pickedVariantIds, pickedByCollection);
        });

        return timelineElements.map(baseEl => {
            const variant = selectedVariants[baseEl.elementId] ?? null;

            if (isNullVariant(variant)) {
                return null;
            }

            const variantOverride = variant ? baseEl.variantOverrides?.[variant.id] : undefined;
            const overrides = variant ? getEffectiveElement(baseEl, variant.id) : baseEl;
            const timing = elementTimings.get(baseEl.elementId) || { startTime: baseEl.startTime, duration: baseEl.duration };
            const isMedia = baseEl.collectionType === 'video' || baseEl.collectionType === 'audio';
            const mediaOffset = (variantOverride as Partial<CanvasElement> | undefined)?.mediaOffset ?? baseEl.mediaOffset ?? 0;
            const requestedDuration = getPlaybackDuration(baseEl, timing, variantOverride);
            const speed = getElementPlaybackSpeed(overrides);
            const playableDuration = isMedia && variant?.duration !== undefined
                ? Math.max(0, (variant.duration - mediaOffset) / speed)
                : requestedDuration;
            return {
                el: {
                    ...applyNestedCompositionTransform(overrides, currentTime),
                    startTime: timing.startTime,
                    duration: Math.max(0.001, Math.min(requestedDuration, playableDuration)),
                },
                variant,
            };
        }).filter((item): item is { el: CanvasElement; variant: CollectionVariant | null } => Boolean(item));
    }, [
        collections,
        nestedSequences,
        parseNestedSequence,
        flattenTimelineElementsWithResolvedTimings,
        elements,
        resolvedCollectionIdByElement,
        previewVariants,
        pickVariantCandidate,
        variantSeed,
        getSelectionKey,
        getVariantMode,
        getSelectableVariants,
        getSortedElementsForSelection,
        rememberPickedVariant,
        variantUsage,
        getEffectiveElement,
        elementTimings,
        currentTime,
    ]);

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

    type PropertyCopyScope = 'all' | 'transform' | 'animation' | 'textStyle';
    const SCOPE_LABEL: Record<PropertyCopyScope, string> = {
        all: 'Properties',
        transform: 'Transform',
        animation: 'Animation',
        textStyle: 'Text Style',
    };
    const COPY_SCOPE_KEYS: Record<Exclude<PropertyCopyScope, 'all'>, (keyof CanvasElement)[]> = {
        transform: ['x', 'y', 'width', 'height', 'rotation', 'opacity', 'zIndex', 'aspectRatioLocked'],
        animation: ['animations'],
        textStyle: ['fontSize', 'lineHeight', 'letterSpacing', 'fontWeight', 'fontStyle', 'textDecoration', 'textAlign', 'textStrokeColor', 'textStrokeWidth'],
    };

    const extractCopyableProperties = (el: CanvasElement, scope: PropertyCopyScope = 'all'): Partial<CanvasElement> => {
        if (scope === 'textStyle') {
            return {
                fontSize: el.fontSize ?? 16,
                lineHeight: el.lineHeight ?? 1.4,
                letterSpacing: el.letterSpacing ?? 0,
                fontWeight: el.fontWeight ?? 'bold',
                fontStyle: el.fontStyle ?? 'normal',
                textDecoration: el.textDecoration ?? 'none',
                textAlign: el.textAlign ?? 'center',
                textStrokeColor: el.textStrokeColor ?? '#000000',
                textStrokeWidth: el.textStrokeWidth ?? 0,
            };
        }

        const copy = clonePlain(el) as unknown as Record<string, unknown>;
        delete copy.elementId;
        delete copy.collectionId;
        delete copy.collectionType;
        delete copy.title;
        delete copy.sourceElementId;
        delete copy.selectedVariantId;
        delete copy.variantOverrides;

        if (scope !== 'all') {
            const allowed = new Set<string>(COPY_SCOPE_KEYS[scope].map(k => String(k)));
            Object.keys(copy).forEach((key) => {
                if (!allowed.has(key)) delete copy[key];
            });
        }

        return copy as Partial<CanvasElement>;
    };

    const isValueTypeCompatible = (targetValue: unknown, sourceValue: unknown): boolean => {
        if (sourceValue === undefined) return false;
        if (targetValue === undefined || targetValue === null) return true;
        if (Array.isArray(targetValue)) return Array.isArray(sourceValue);
        if (typeof targetValue === 'object') return typeof sourceValue === 'object' && sourceValue !== null && !Array.isArray(sourceValue);
        return typeof targetValue === typeof sourceValue;
    };

    const copyAllProperties = async (scope: PropertyCopyScope = 'all') => {
        const sourceEl = effectiveElement || selectedElement;
        if (!sourceEl) return;

        const nextCopied = extractCopyableProperties(sourceEl, scope);
        if (Object.keys(nextCopied).length === 0) {
            showToast(`No ${SCOPE_LABEL[scope]} to copy`, "error");
            return;
        }
        setCopiedProperties(nextCopied);

        try {
            await navigator.clipboard.writeText(JSON.stringify(nextCopied));
            showToast(`${SCOPE_LABEL[scope]} copied`, "success");
        } catch {
            showToast(`${SCOPE_LABEL[scope]} copied (local only)`, "success");
        }
    };

    const pasteAllProperties = async (scope: PropertyCopyScope = 'all') => {
        const targetEl = effectiveElement || selectedElement;
        if (!targetEl) return;

        let source: Record<string, unknown> | null = null;

        try {
            const clipboardText = await navigator.clipboard.readText();
            if (clipboardText.trim()) {
                const parsed = JSON.parse(clipboardText) as unknown;
                if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                    source = parsed as Record<string, unknown>;
                }
            }
        } catch {
            // no-op fallback below
        }

        if (!source && copiedProperties) {
            source = copiedProperties as Record<string, unknown>;
        }

        if (!source) {
            showToast("No copied properties found", "error");
            return;
        }

        const scopedSourceEntries = Object.entries(source).filter(([key]) => {
            if (scope === 'all') return true;
            return COPY_SCOPE_KEYS[scope].includes(key as keyof CanvasElement);
        });

        const targetObject = targetEl as unknown as Record<string, unknown>;
        const matchedEntries = scopedSourceEntries.filter(([key, value]) => {
            if (scope === 'all') {
                return key in targetObject && isValueTypeCompatible(targetObject[key], value);
            }
            // For scoped pastes (transform/animation/textStyle), allow applying optional keys
            // even if they are not explicitly present on the current element object yet.
            return isValueTypeCompatible(targetObject[key], value);
        });

        if (matchedEntries.length === 0) {
            showToast(`No matching ${SCOPE_LABEL[scope].toLowerCase()} to paste`, "error");
            return;
        }

        const updates = Object.fromEntries(matchedEntries) as Partial<CanvasElement>;
        updateSelected(updates);
        showToast(`Pasted ${matchedEntries.length} ${SCOPE_LABEL[scope].toLowerCase()}`, "success");
    };

    const removeSelected = () => {
        if (!selectedElementId) return;
        const removedId = selectedElementId;
        setElements(prev => prev
            .filter(el => el.elementId !== removedId)
            .map(el => {
                let updated = el;
                let changed = false;

                // Clean up syncWith if it pointed at the deleted element
                if (el.syncWith?.targetId === removedId) {
                    updated = { ...updated, syncWith: null };
                    changed = true;
                }

                // Clean up matchDurationWithId (legacy single-link)
                if (el.matchDurationWithId === removedId) {
                    updated = { ...updated, matchDurationWithId: undefined };
                    changed = true;
                }

                // Clean up matchDurationWithIds (multi-link)
                if (el.matchDurationWithIds?.includes(removedId)) {
                    const newIds = el.matchDurationWithIds.filter(id => id !== removedId);
                    const newOffsets = { ...(el.matchDurationOffsets || {}) };
                    delete newOffsets[removedId];
                    updated = { ...updated, matchDurationWithIds: newIds, matchDurationOffsets: newOffsets };
                    changed = true;
                } else if (el.matchDurationOffsets?.[removedId] !== undefined) {
                    // Stale offset entry even if not in the IDs array
                    const newOffsets = { ...(el.matchDurationOffsets || {}) };
                    delete newOffsets[removedId];
                    updated = { ...updated, matchDurationOffsets: newOffsets };
                    changed = true;
                }

                return changed ? updated : el;
            })
        );
        setSelectedElementId(null);
    };

    const persistSharedParentCollections = useCallback(async (normalizedCollections: CollectionItem[]) => {
        if (!isSubCompositionEditor) return;
        const parent = parentCompositionRef.current;
        if (!parent) return;

        const sharedIds = sharedParentCollectionIdsRef.current;
        if (sharedIds.size === 0) return;

        const childCollectionById = new Map(normalizedCollections.map(collection => [collection.id, collection]));
        const sharedParentCollections = parentSharedCollectionsRef.current.map(parentCollection => {
            const childCollection = childCollectionById.get(parentCollection.id);
            return childCollection
                ? restoreParentVariantLinks(childCollection, parentCollection)
                : parentCollection;
        });

        if (JSON.stringify(sharedParentCollections) === JSON.stringify(parentSharedCollectionsRef.current)) return;

        const sharedById = new Map(sharedParentCollections.map(collection => [collection.id, collection]));
        const nextParentCollections = parentAllCollectionsRef.current.map(parentCollection =>
            sharedById.get(parentCollection.id) || parentCollection
        );

        const res = await fetch(`/api/compositions/${parent.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                collections: {
                    items: nextParentCollections,
                    textGroups: parentSharedTextGroupsRef.current,
                    renderQueue: parentSharedRenderQueueRef.current,
                },
            }),
        });
        if (!res.ok) throw new Error("Failed to sync shared parent collections");
        parentAllCollectionsRef.current = nextParentCollections;
        parentSharedCollectionsRef.current = sharedParentCollections;
    }, [isSubCompositionEditor]);

    const persistRenderQueue = useCallback(async (nextQueue: QueuedRenderJob[], successMessage?: string) => {
        setRenderQueue(nextQueue);
        if (!compositionId) {
            if (successMessage) showToast(successMessage, "success");
            return;
        }

        try {
            const normalizedCollections = syncCollectionsWithActiveVersions(collections);
            const persistedCollections = isSubCompositionEditor
                ? withoutSubCompositionCollections(normalizedCollections).map(stripSharedParentFlag)
                : normalizedCollections;
            const res = await fetch(`/api/compositions/${compositionId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    collections: {
                        items: persistedCollections,
                        textGroups: textCollectionGroups,
                        renderQueue: nextQueue,
                    },
                }),
            });
            if (!res.ok) throw new Error("Failed to save render queue");
            if (successMessage) showToast(successMessage, "success");
        } catch (e) {
            console.error("Failed to persist render queue", e);
            showToast("Queue updated locally, but failed to save.", "error");
        }
    }, [compositionId, collections, isSubCompositionEditor, textCollectionGroups]);

    const persistCollections = useCallback(async (
        nextCollections: CollectionItem[],
        nextTextGroups = textCollectionGroups,
        nextQueue = renderQueue,
    ) => {
        if (!compositionId) return;
        const normalizedCollections = syncCollectionsWithActiveVersions(nextCollections);
        const persistedCollections = isSubCompositionEditor
            ? withoutSubCompositionCollections(normalizedCollections).map(stripSharedParentFlag)
            : normalizedCollections;
        const persistedTextGroups = pruneTextGroupsForCollections(nextTextGroups, persistedCollections);

        try {
            await persistSharedParentCollections(normalizedCollections);
            const res = await fetch(`/api/compositions/${compositionId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    collections: {
                        items: persistedCollections,
                        textGroups: persistedTextGroups,
                        renderQueue: nextQueue,
                    },
                }),
            });
            if (!res.ok) throw new Error("Failed to save collections");
        } catch (error) {
            console.error("Failed to persist collections", error);
            showToast("Collection change updated locally, but failed to save.", "error");
        }
    }, [compositionId, isSubCompositionEditor, persistSharedParentCollections, renderQueue, textCollectionGroups]);

    const applyCollectionsChange = useCallback((
        updater: (current: CollectionItem[]) => CollectionItem[],
        nextTextGroups = textCollectionGroupsRef.current,
    ) => {
        const nextCollections = updater(collectionsRef.current);
        replaceCollections(nextCollections);
        void persistCollections(nextCollections, nextTextGroups);
        return nextCollections;
    }, [persistCollections, replaceCollections]);

    const copyCollectionToClipboard = useCallback(async (collectionId: string) => {
        const sourceCollection = collectionsRef.current.find(collection => collection.id === collectionId);
        if (!sourceCollection) {
            showToast("Collection not found.", "error");
            return;
        }
        const copiedCollections = clonePlain([sourceCollection]);
        const copiedTextGroups = clonePlain(pruneTextGroupsForCollections(textCollectionGroupsRef.current, copiedCollections));
        const referencedSequenceIds = new Set(
            copiedCollections
                .filter(collection => collection.type === "subComposition")
                .flatMap(collection => collection.items.filter(item => !isNullVariant(item)).map(item => item.value || item.id))
                .filter(Boolean)
        );
        const copiedSequences = clonePlain(nestedSequencesRef.current.filter(sequence => referencedSequenceIds.has(sequence.id)));
        const payload: CollectionsClipboardPayload = {
            kind: "dropai.collections.v1",
            collections: copiedCollections,
            textGroups: copiedTextGroups,
            nestedSequences: copiedSequences,
        };
        const serialized = JSON.stringify(payload);

        try {
            await navigator.clipboard.writeText(serialized);
            localStorage.setItem("dropai_collections_clipboard", serialized);
            showToast(`Copied ${sourceCollection.title}.`, "success");
        } catch (error) {
            try {
                localStorage.setItem("dropai_collections_clipboard", serialized);
                showToast(`Copied ${sourceCollection.title} locally.`, "success");
            } catch {
                console.error("Failed to copy collection", error);
                showToast("Failed to copy collection.", "error");
            }
        }
    }, [clonePlain]);

    const pasteCollectionsFromClipboard = useCallback(async () => {
        let raw: string | null = null;
        try {
            raw = await navigator.clipboard.readText();
        } catch {
            raw = localStorage.getItem("dropai_collections_clipboard");
        }
        if (!raw) {
            showToast("No copied collections found.", "error");
            return;
        }

        let payload: CollectionsClipboardPayload;
        try {
            payload = JSON.parse(raw) as CollectionsClipboardPayload;
        } catch {
            showToast("Copied collections data is invalid.", "error");
            return;
        }
        if (payload.kind !== "dropai.collections.v1" || !Array.isArray(payload.collections)) {
            showToast("Clipboard does not contain DropAI collections.", "error");
            return;
        }

        const sourceCollections = clonePlain(payload.collections);
        const sourceTextGroups = clonePlain(payload.textGroups || []);
        const sourceSequences = clonePlain(payload.nestedSequences || []);
        const hasSubCompositionCollections = sourceCollections.some(collection => collection.type === "subComposition");
        if (hasSubCompositionCollections && isSubCompositionEditor) {
            showToast("Sub-composition groups cannot be pasted inside a sub-composition.", "error");
            return;
        }
        if (hasSubCompositionCollections && !compositionId) {
            showToast("Save this composition before pasting sub-composition groups.", "error");
            return;
        }

        const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const collectionIdMap = new Map<string, string>();
        const variantIdMap = new Map<string, string>();
        const sequenceById = new Map<string, NestedSequenceRecord>();
        for (const sequence of sourceSequences) sequenceById.set(sequence.id, sequence);

        const parseStored = <T,>(value: string | T, fallback: T): T => {
            if (typeof value !== "string") return value;
            try {
                return JSON.parse(value || "") as T;
            } catch {
                return fallback;
            }
        };

        const clonedCollectionSources: { collection: CollectionItem; overrides: Map<string, Partial<CollectionVariant>> }[] = [];
        const newNestedSequences: NestedSequenceRecord[] = [];

        try {
            for (const collection of sourceCollections) {
                const newCollectionId = `col-copy-${stamp}-${collectionIdMap.size}`;
                collectionIdMap.set(collection.id, newCollectionId);
                const overrides = new Map<string, Partial<CollectionVariant>>();

                if (collection.type !== "subComposition") {
                    ensureCollectionVariantIdMap(collection, variantIdMap, () => `v-copy-${stamp}-${variantIdMap.size}`);
                }

                for (const item of getAllCollectionVariants(collection)) {
                    if (variantIdMap.has(item.id)) continue;
                    if (collection.type === "subComposition") {
                        if (isNullVariant(item)) {
                            const newVariantId = `null-copy-${stamp}-${variantIdMap.size}`;
                            variantIdMap.set(item.id, newVariantId);
                            overrides.set(item.id, { id: newVariantId, value: "", duration: 0, isNull: true });
                            continue;
                        }
                        const sourceSequenceId = item.value || item.id;
                        const sourceSequence = sequenceById.get(sourceSequenceId) || nestedSequencesRef.current.find(sequence => sequence.id === sourceSequenceId);
                        if (!sourceSequence || !compositionId) continue;

                        const res = await fetch("/api/compositions", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                title: sourceSequence.title || item.label,
                                kind: sourceSequence.kind || "sequence",
                                parentId: compositionId,
                                duration: sourceSequence.duration,
                                elements: parseStored<CanvasElement[]>(sourceSequence.elements, []),
                                tracks: parseStored<TrackConfig[]>(sourceSequence.tracks, [{ id: "track-0", magnet: false }]),
                                collections: parseStored(sourceSequence.collections, { items: [], textGroups: [], renderQueue: [] }),
                            }),
                        });
                        const data = await res.json();
                        if (!res.ok) {
                            throw new Error(data.error || "Failed to paste sub-composition.");
                        }
                        newNestedSequences.push(data);
                        variantIdMap.set(item.id, data.id);
                        overrides.set(item.id, {
                            id: data.id,
                            label: data.title || item.label,
                            value: data.id,
                            duration: Math.max(0.1, data.duration || item.duration || EMPTY_NESTED_COMPOSITION_DISPLAY_DURATION),
                        });
                        continue;
                    }
                }

                clonedCollectionSources.push({
                    collection: {
                        ...collection,
                        id: newCollectionId,
                    },
                    overrides,
                });
            }
        } catch (error) {
            console.error("Failed to paste collections", error);
            showToast(error instanceof Error ? error.message : "Failed to paste collections.", "error");
            return;
        }

        const remappedCollections = clonedCollectionSources.map(({ collection, overrides }) =>
            remapCollectionVariantIds(collection, variantIdMap, overrides)
        );

        const remappedTextGroups = sourceTextGroups
            .map(group => ({
                ...group,
                id: `tg-copy-${stamp}-${Math.random().toString(36).slice(2, 6)}`,
                collectionIds: group.collectionIds.map(id => collectionIdMap.get(id)).filter((id): id is string => Boolean(id)),
            }))
            .filter(group => group.collectionIds.length > 1);

        const nextCollections = [...collectionsRef.current, ...remappedCollections];
        const nextTextGroups = [...textCollectionGroupsRef.current, ...remappedTextGroups];
        replaceCollections(nextCollections);
        replaceTextCollectionGroups(nextTextGroups);
        if (newNestedSequences.length > 0) {
            nestedSequencesRef.current = [...newNestedSequences, ...nestedSequencesRef.current];
            setNestedSequences(prev => [...newNestedSequences, ...prev]);
        }
        await persistCollections(nextCollections, nextTextGroups);
        showToast(`Pasted ${remappedCollections.length} collection${remappedCollections.length === 1 ? "" : "s"}.`, "success");
    }, [clonePlain, compositionId, isSubCompositionEditor, persistCollections, replaceCollections, replaceTextCollectionGroups]);

    const copySelectedElementToClipboard = useCallback(async () => {
        if (!selectedElement) {
            showToast("Select an element to copy.", "error");
            return;
        }
        const sourceCollection = collectionsRef.current.find(collection => collection.id === selectedElement.collectionId)
            || collectionsRef.current.find(collection => collection.id === selectedResolvedCollectionId);
        if (!sourceCollection) {
            showToast("Could not find this element's collection.", "error");
            return;
        }

        const referencedSequenceIds = new Set<string>();
        if (sourceCollection.type === "subComposition") {
            sourceCollection.items.filter(item => !isNullVariant(item)).forEach(item => referencedSequenceIds.add(item.value || item.id));
        }
        if (selectedElement.nestedSequenceId) referencedSequenceIds.add(selectedElement.nestedSequenceId);
        const copiedSequences = clonePlain(nestedSequencesRef.current.filter(sequence => referencedSequenceIds.has(sequence.id)));
        const payload: ElementClipboardPayload = {
            kind: "dropai.element.v1",
            element: clonePlain(selectedElement),
            collection: clonePlain(sourceCollection),
            nestedSequences: copiedSequences,
        };
        const serialized = JSON.stringify(payload);

        try {
            await navigator.clipboard.writeText(serialized);
            localStorage.setItem("dropai_element_clipboard", serialized);
            showToast(`Copied ${selectedElement.title}.`, "success");
        } catch (error) {
            try {
                localStorage.setItem("dropai_element_clipboard", serialized);
                showToast(`Copied ${selectedElement.title} locally.`, "success");
            } catch {
                console.error("Failed to copy element", error);
                showToast("Failed to copy element.", "error");
            }
        }
    }, [clonePlain, selectedElement, selectedResolvedCollectionId]);

    const pasteElementFromClipboard = useCallback(async () => {
        let raw: string | null = null;
        try {
            raw = await navigator.clipboard.readText();
        } catch {
            raw = localStorage.getItem("dropai_element_clipboard");
        }
        if (!raw) {
            showToast("No copied element found.", "error");
            return;
        }

        let payload: ElementClipboardPayload;
        try {
            payload = JSON.parse(raw) as ElementClipboardPayload;
        } catch {
            showToast("Copied element data is invalid.", "error");
            return;
        }
        if (payload.kind !== "dropai.element.v1" || !payload.element || !payload.collection) {
            showToast("Clipboard does not contain a DropAI element.", "error");
            return;
        }
        if (payload.collection.type === "subComposition" && isSubCompositionEditor) {
            showToast("Sub-composition elements cannot be pasted inside a sub-composition.", "error");
            return;
        }
        if (payload.collection.type === "subComposition" && !compositionId) {
            showToast("Save this composition before pasting a sub-composition element.", "error");
            return;
        }

        const parseStored = <T,>(value: string | T, fallback: T): T => {
            if (typeof value !== "string") return value;
            try {
                return JSON.parse(value || "") as T;
            } catch {
                return fallback;
            }
        };

        const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const sourceCollection = clonePlain(payload.collection);
        const sourceElement = clonePlain(payload.element);
        const sourceSequences = clonePlain(payload.nestedSequences || []);
        const sequenceById = new Map<string, NestedSequenceRecord>();
        sourceSequences.forEach(sequence => sequenceById.set(sequence.id, sequence));

        const getCollectionMatchSignature = (collection: CollectionItem) => {
            const variantIndexById = new Map(collection.items.map((item, index) => [item.id, index]));
            return JSON.stringify({
                title: collection.title,
                type: collection.type,
                items: collection.items.map(item => ({
                    label: item.label,
                    value: item.value,
                    duration: item.duration ?? null,
                    excluded: !!item.excluded,
                    isNull: !!item.isNull,
                    linkedVariantIndexes: (item.linkedVariantIds || [])
                        .map(id => variantIndexById.get(id))
                        .filter((index): index is number => index !== undefined)
                        .sort((a, b) => a - b),
                })),
            });
        };

        const existingMatchingCollection = collectionsRef.current.find(collection =>
            getCollectionMatchSignature(collection) === getCollectionMatchSignature(sourceCollection)
        );
        const variantIdMap = new Map<string, string>();
        const sequenceIdMap = new Map<string, string>();
        const newNestedSequences: NestedSequenceRecord[] = [];
        let remappedCollection: CollectionItem | null = existingMatchingCollection || null;

        if (existingMatchingCollection) {
            sourceCollection.items.forEach((item, index) => {
                const matchingItem = existingMatchingCollection.items[index];
                if (!matchingItem) return;
                variantIdMap.set(item.id, matchingItem.id);
                if (sourceCollection.type === "subComposition") {
                    if (!isNullVariant(item)) sequenceIdMap.set(item.value || item.id, matchingItem.value || matchingItem.id);
                }
            });
        } else {
            const overrides = new Map<string, Partial<CollectionVariant>>();
            try {
                if (sourceCollection.type !== "subComposition") {
                    ensureCollectionVariantIdMap(sourceCollection, variantIdMap, () => `v-copy-${stamp}-${variantIdMap.size}`);
                }

                for (const item of getAllCollectionVariants(sourceCollection)) {
                    if (variantIdMap.has(item.id)) continue;
                    if (sourceCollection.type === "subComposition") {
                        if (isNullVariant(item)) {
                            const newVariantId = `null-copy-${stamp}-${variantIdMap.size}`;
                            variantIdMap.set(item.id, newVariantId);
                            overrides.set(item.id, { id: newVariantId, value: "", duration: 0, isNull: true });
                            continue;
                        }
                        const sourceSequenceId = item.value || item.id;
                        const sourceSequence = sequenceById.get(sourceSequenceId) || nestedSequencesRef.current.find(sequence => sequence.id === sourceSequenceId);
                        if (!sourceSequence || !compositionId) continue;

                        const res = await fetch("/api/compositions", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                title: sourceSequence.title || item.label,
                                kind: sourceSequence.kind || "sequence",
                                parentId: compositionId,
                                duration: sourceSequence.duration,
                                elements: parseStored<CanvasElement[]>(sourceSequence.elements, []),
                                tracks: parseStored<TrackConfig[]>(sourceSequence.tracks, [{ id: "track-0", magnet: false }]),
                                collections: parseStored(sourceSequence.collections, { items: [], textGroups: [], renderQueue: [] }),
                            }),
                        });
                        const data = await res.json();
                        if (!res.ok) throw new Error(data.error || "Failed to paste sub-composition element.");
                        newNestedSequences.push(data);
                        variantIdMap.set(item.id, data.id);
                        sequenceIdMap.set(sourceSequenceId, data.id);
                        overrides.set(item.id, {
                            id: data.id,
                            label: data.title || item.label,
                            value: data.id,
                            duration: Math.max(0.1, data.duration || item.duration || EMPTY_NESTED_COMPOSITION_DISPLAY_DURATION),
                        });
                        continue;
                    }

                }
            } catch (error) {
                console.error("Failed to paste element", error);
                showToast(error instanceof Error ? error.message : "Failed to paste element.", "error");
                return;
            }

            remappedCollection = {
                ...sourceCollection,
                id: `col-copy-${stamp}`,
                title: `${sourceCollection.title} Copy`,
            };
            remappedCollection = remapCollectionVariantIds(remappedCollection, variantIdMap, overrides);
        }

        if (!remappedCollection) {
            showToast("Could not prepare pasted element collection.", "error");
            return;
        }

        const remappedVariantOverrides = sourceElement.variantOverrides
            ? Object.fromEntries(
                Object.entries(sourceElement.variantOverrides)
                    .map(([variantId, overrides]) => [variantIdMap.get(variantId), clonePlain(overrides)] as const)
                    .filter(([variantId]) => Boolean(variantId))
            ) as Record<string, Partial<CanvasElement>>
            : undefined;

        const targetTrackId = tracks[0]?.id || "track-0";
        const targetTrackElements = elements.filter(el => (el.trackId || "track-0") === targetTrackId);
        const bestStart = targetTrackElements.reduce((max, el) => {
            const timing = elementTimings.get(el.elementId) || { startTime: el.startTime, duration: el.duration };
            return Math.max(max, timing.startTime + timing.duration);
        }, 0);
        const newElementId = `el-copy-${stamp}`;
        const remappedSelectedVariantId = sourceElement.selectedVariantId ? variantIdMap.get(sourceElement.selectedVariantId) : undefined;
        const fallbackNestedSequenceId = remappedSelectedVariantId
            ? remappedCollection.items.find(item => item.id === remappedSelectedVariantId)?.value
            : undefined;
        const pastedElement: CanvasElement = {
            ...sourceElement,
            elementId: newElementId,
            sourceElementId: newElementId,
            collectionId: remappedCollection.id,
            title: remappedCollection.title,
            startTime: Math.round(bestStart * 1000) / 1000,
            trackId: targetTrackId,
            zIndex: Math.max(0, ...elements.map(el => el.zIndex || 0)) + 1,
            selectedVariantId: remappedSelectedVariantId,
            variantOverrides: remappedVariantOverrides,
            localExcludedVariantIds: sourceElement.localExcludedVariantIds
                ?.map(id => variantIdMap.get(id))
                .filter((id): id is string => Boolean(id)),
            nestedSequenceId: sourceElement.nestedSequenceId
                ? sequenceIdMap.get(sourceElement.nestedSequenceId) || fallbackNestedSequenceId
                : fallbackNestedSequenceId,
            textCollectionMode: sourceElement.textCollectionMode === sourceElement.collectionId ? remappedCollection.id : sourceElement.textCollectionMode === "all" ? "all" : undefined,
            syncWith: null,
            matchDurationWithId: undefined,
            matchDurationWithIds: undefined,
            matchDurationOffsets: undefined,
            nestedCompositionTransform: undefined,
            nestedCompositionBlur: undefined,
            variantSeedKey: undefined,
            variantSequenceIndex: undefined,
        };

        const nextCollections = existingMatchingCollection
            ? collectionsRef.current
            : [...collectionsRef.current, remappedCollection];
        const nextElements = [...elements, pastedElement];
        replaceCollections(nextCollections);
        setElements(nextElements);
        setSelectedElementId(pastedElement.elementId);
        if (newNestedSequences.length > 0) {
            nestedSequencesRef.current = [...newNestedSequences, ...nestedSequencesRef.current];
            setNestedSequences(prev => [...newNestedSequences, ...prev]);
        }
        void persistCollections(nextCollections);

        if (compositionId) {
            try {
                const normalizedCollections = syncCollectionsWithActiveVersions(nextCollections);
                await persistSharedParentCollections(normalizedCollections);
                const persistedCollections = isSubCompositionEditor
                    ? withoutSubCompositionCollections(normalizedCollections).map(stripSharedParentFlag)
                    : normalizedCollections;
                const persistedTextGroups = pruneTextGroupsForCollections(textCollectionGroupsRef.current, persistedCollections);
                const res = await fetch(`/api/compositions/${compositionId}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        elements: nextElements,
                        collections: {
                            items: persistedCollections,
                            textGroups: persistedTextGroups,
                            renderQueue,
                        },
                    }),
                });
                if (!res.ok) throw new Error("Failed to save pasted element");
            } catch (error) {
                console.error("Failed to persist pasted element", error);
                showToast("Element pasted locally, but failed to save.", "error");
                return;
            }
        }

        showToast(`Pasted ${pastedElement.title}.`, "success");
    }, [clonePlain, compositionId, elementTimings, elements, isSubCompositionEditor, persistCollections, persistSharedParentCollections, renderQueue, replaceCollections, tracks]);

    const createSubComposition = useCallback(async (collectionId: string, name: string) => {
        if (!compositionId) {
            showToast("Save this composition before creating sub-compositions.", "error");
            return;
        }
        const title = name.trim();
        if (!title) {
            showToast("Name the sub-composition first.", "error");
            return;
        }
        const childCollections: CollectionItem[] = [];
        const childTextGroups: TextCollectionGroup[] = [];

        try {
            const res = await fetch('/api/compositions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title,
                    kind: 'sequence',
                    parentId: compositionId,
                    duration: TOTAL_DURATION,
                    elements: [],
                    tracks: [{ id: 'track-0', magnet: false }],
                    collections: {
                        items: childCollections,
                        textGroups: childTextGroups,
                        renderQueue: [],
                    },
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to create sub-composition");
            setNestedSequences(prev => [data, ...prev]);
            nestedSequencesRef.current = [data, ...nestedSequencesRef.current];
            const nextCollections = collections.map(collection =>
                collection.id === collectionId
                    ? {
                        ...collection,
                        items: [
                            ...collection.items,
                            {
                                id: data.id,
                                label: data.title || title,
                                value: data.id,
                                duration: Math.max(0.1, data.duration || TOTAL_DURATION),
                            },
                        ],
                    }
                    : collection
            );
            replaceCollections(nextCollections);
            void persistCollections(nextCollections);
            showToast("Sub-composition created.", "success");
        } catch (error) {
            showToast(error instanceof Error ? error.message : "Failed to create sub-composition.", "error");
        }
    }, [TOTAL_DURATION, collections, compositionId, persistCollections, textCollectionGroups]);

    const deleteNestedSequence = useCallback(async (sequenceId: string) => {
        try {
            const res = await fetch(`/api/compositions/${sequenceId}`, { method: 'DELETE' });
            if (!res.ok) throw new Error("Failed to delete nested composition");
            setNestedSequences(prev => prev.filter(seq => seq.id !== sequenceId));
            nestedSequencesRef.current = nestedSequencesRef.current.filter(seq => seq.id !== sequenceId);
            const nextCollections = collections.map(collection => collection.type === 'subComposition'
                ? { ...collection, items: collection.items.filter(item => (item.value || item.id) !== sequenceId) }
                : collection
            );
            replaceCollections(nextCollections);
            void persistCollections(nextCollections);
            setElements(prev => prev.filter(el => el.nestedSequenceId !== sequenceId));
            showToast("Sub-composition deleted.", "success");
        } catch (error) {
            showToast(error instanceof Error ? error.message : "Failed to delete sub-composition.", "error");
        }
    }, [collections, persistCollections]);

    // --- Build a flat RenderJob from current state ---
    const buildRenderJob = useCallback(() => {
        const [rw, rh] = exportSettings.resolution.split('x').map(Number);
        const timelineElements = flattenTimelineElementsWithResolvedTimings();
        const collectionById = new Map(collections.map(c => [c.id, c]));
        for (const sequence of nestedSequences) {
            try {
                for (const collection of parseNestedSequence(sequence).collections) {
                    if (!collectionById.has(collection.id)) collectionById.set(collection.id, collection);
                }
            } catch {
                // Ignore malformed child payloads here; flattening will surface render errors when needed.
            }
        }
        const variantToCollectionId = new Map<string, string>();
        for (const collection of collectionById.values()) {
            collection.items.forEach(item => variantToCollectionId.set(item.id, collection.id));
        }
        const pickedVariantIds = new Set<string>();
        const pickedByCollection: Record<string, Set<string>> = {};
        const chosenVariants: Record<string, CollectionVariant | null> = {};

        for (const el of getSortedElementsForSelection(timelineElements, collectionById, resolvedCollectionIdByElement)) {
            const resolvedColId = resolvedCollectionIdByElement[el.elementId] || el.collectionId;
            const col = collectionById.get(resolvedColId) || collectionById.get(el.collectionId);
            if (!col) {
                chosenVariants[el.elementId] = null;
                continue;
            }

            const localExcluded = new Set(el.localExcludedVariantIds || []);
            const candidates = getSelectableVariants(col, resolvedColId, localExcluded, pickedVariantIds, pickedByCollection, collectionById, variantToCollectionId);
            const nestedPicked = el.selectedVariantId
                ? candidates.find(item => item.id === el.selectedVariantId) || null
                : null;
            const statePicked = nestedPicked || previewVariants[el.elementId];
            if (statePicked && candidates.some(item => item.id === statePicked.id)) {
                chosenVariants[el.elementId] = statePicked;
                rememberPickedVariant(statePicked, resolvedColId, pickedVariantIds, pickedByCollection);
                continue;
            }

            const picked = pickVariantCandidate(el, candidates, `${variantSeed}-${getSelectionKey(el)}-variant`, variantUsage);
            chosenVariants[el.elementId] = picked;
            rememberPickedVariant(picked, resolvedColId, pickedVariantIds, pickedByCollection);
        }
        lastRenderUsedVariantIdsRef.current = Array.from(pickedVariantIds);

        const renderEls: RenderElement[] = timelineElements
            .filter(el => {
                const chosenVariant = chosenVariants[el.elementId];
                if (isNullVariant(chosenVariant)) return false;
                const effectiveEl = getEffectiveElement(el, chosenVariant?.id || 'all');
                return effectiveEl.visible !== false;
            })
            .map(el => {
            const timingEntry = elementTimings.get(el.elementId) ?? { startTime: el.startTime, duration: el.duration };
            const resolvedColId = resolvedCollectionIdByElement[el.elementId] || el.collectionId;
            const col = collectionById.get(resolvedColId) || collectionById.get(el.collectionId);
            const chosenVariant = chosenVariants[el.elementId];

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
            const duration = getPlaybackDuration(el, timingEntry, variantOverride);
            const trackIndex = tracks.findIndex(t => t.id === (el.trackId || 'track-0'));

            // Randomize window: bake a seeded-random offset into the export, same as preview
            const isMedia = el.collectionType === 'video' || el.collectionType === 'audio';
            const rawMediaOffset = (variantOverride as Partial<CanvasElement>)?.mediaOffset ?? el.mediaOffset ?? 0;
            let mediaOffset = rawMediaOffset;
            if (isMedia && el.randomizeWindow) {
                const fullMediaDur = chosenVariant?.duration ?? col?.items[0]?.duration;
                const sourceSpan = duration * getElementPlaybackSpeed(el);
                if (fullMediaDur && fullMediaDur > sourceSpan) {
                    mediaOffset = mulberry32(hashString(`${variantSeed}-${getSelectionKey(el)}-window`))() * (fullMediaDur - sourceSpan);
                }
            }

            return {
                elementId: el.elementId,
                collectionType: el.collectionType as RenderElement["collectionType"],
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
                speed: el.speed,
                audioFadeIn: el.audioFadeIn,
                audioFadeOut: el.audioFadeOut,
                zIndex: getTrackStackZ(trackIndex, el.zIndex || 0),
                fontSize: el.fontSize,
                fontWeight: el.fontWeight,
                fontStyle: el.fontStyle,
                textDecoration: el.textDecoration,
                letterSpacing: el.letterSpacing,
                lineHeight: el.lineHeight,
                textAlign: el.textAlign,
                textStrokeColor: el.textStrokeColor,
                textStrokeWidth: el.textStrokeWidth,
                animations: el.animations ?? [],
                nestedCompositionTransform: el.nestedCompositionTransform,
            } satisfies RenderElement;
        });

        // Render only until the last VISUAL element ends — audio should not extend the composition
        const visualMaxEnd = renderEls
            .filter(el => el.collectionType !== 'audio')
            .reduce((max, el) => Math.max(max, el.startTime + el.duration), 0);
        const effectiveDuration = visualMaxEnd > 0 ? visualMaxEnd : TOTAL_DURATION;

        // Clamp audio durations so they never exceed the composition length
        for (const el of renderEls) {
            if (el.collectionType === 'audio' || el.collectionType === 'video') {
                const endTime = el.startTime + el.duration;
                if (endTime > effectiveDuration) {
                    el.duration = Math.max(0, effectiveDuration - el.startTime);
                }
            }
        }

        return {
            elements: renderEls,
            totalDuration: effectiveDuration,
            width: rw,
            height: rh,
            fps: exportSettings.fps,
            videoBitsPerSecond: exportSettings.bitrate * 1_000_000,
            format: exportSettings.format,
        };
    }, [collections, exportSettings, TOTAL_DURATION, resolvedCollectionIdByElement, tracks, variantSeed, flattenTimelineElementsWithResolvedTimings, getSelectableVariants, getSortedElementsForSelection, pickVariantCandidate, previewVariants, rememberPickedVariant, variantUsage, nestedSequences, parseNestedSequence, elementTimings, getSelectionKey]);

    const queueCurrentVariant = useCallback(() => {
        const job = buildRenderJob();
        const currentUsedVariantIds = lastRenderUsedVariantIdsRef.current;
        const name = `Variant ${renderQueueRef.current.length + 1} (Seed ${variantSeed})`;
        const queuedJob: QueuedRenderJob = {
            id: `job-${Date.now()}`,
            name,
            job: { ...job, outputName: `${title} - ${name}` },
            usedVariantIds: currentUsedVariantIds,
        };
        void persistRenderQueue([...renderQueueRef.current, queuedJob], "Variant added to composition bucket");
    }, [buildRenderJob, variantSeed, title, persistRenderQueue]);

    const chooseExportOutputDirectory = useCallback(async () => {
        const picker = (window as DirectoryPickerWindow).showDirectoryPicker;
        if (!picker) {
            showToast("Folder export is not supported in this browser.", "error");
            return;
        }

        try {
            const handle = await picker({ mode: "readwrite" });
            setExportOutputDir(handle);
            setExportOutputDirName(handle.name);
        } catch (error) {
            if (error instanceof DOMException && error.name === "AbortError") return;
            showToast("Failed to choose export folder.", "error");
        }
    }, []);

    const startRender = useCallback(async () => {
        const currentJob = renderQueue.length > 0 ? null : buildRenderJob();
        const currentUsedVariantIds = lastRenderUsedVariantIdsRef.current;
        const jobsToRender = renderQueue.length > 0 ? renderQueue : [{ id: 'current', name: 'Current View', job: currentJob!, usedVariantIds: currentUsedVariantIds }];
        const outputTarget: RenderOutputTarget | undefined = exportOutputDir ? { directoryHandle: exportOutputDir } : undefined;
        
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
                
                await renderComposition(item.job, progressWrapper, abortCtrl.signal, outputTarget);
                
                // Record usage for negative bias in future randomizations
                recordVariantUsage(item.usedVariantIds);

                if (jobsToRender.length > 1) {
                    const nextQueue = renderQueueRef.current.filter(q => q.id !== item.id);
                    await persistRenderQueue(nextQueue);
                }
            }
            if (!abortCtrl.signal.aborted) {
                setRenderProgress({ phase: 'done', progress: 1, message: jobsToRender.length > 1 ? 'All exports complete!' : 'Export complete!' });
            }
        } catch (e: unknown) {
            if (abortCtrl.signal.aborted || (e instanceof DOMException && e.name === "AbortError")) {
                setRenderProgress(prev => ({ phase: 'error', progress: prev?.progress ?? 0, message: 'Render cancelled' }));
            } else {
                setRenderProgress({ phase: 'error', progress: 0, message: 'Render failed', error: e instanceof Error ? e.message : String(e) });
            }
        }
    }, [buildRenderJob, renderQueue, exportOutputDir, persistRenderQueue, recordVariantUsage]);

    const cancelRender = useCallback(() => {
        renderAbortRef.current?.abort();
    }, []);

    const saveSkeleton = useCallback(async (overrides?: { tracks?: TrackConfig[], silent?: boolean }) => {
        setSaving(true);
        try {
            const normalizedCollections = syncCollectionsWithActiveVersions(collections);
            await persistSharedParentCollections(normalizedCollections);
            const persistedCollections = isSubCompositionEditor
                ? withoutSubCompositionCollections(normalizedCollections).map(stripSharedParentFlag)
                : normalizedCollections;
            const persistedTextGroups = pruneTextGroupsForCollections(textCollectionGroups, persistedCollections);
            const payload = {
                title: title,
                duration: TOTAL_DURATION,
                elements: elements,
                tracks: overrides?.tracks || tracks,
                collections: {
                    items: persistedCollections,
                    textGroups: persistedTextGroups,
                    renderQueue,
                },
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
            }, [title, TOTAL_DURATION, elements, tracks, collections, textCollectionGroups, renderQueue, compositionId, isSubCompositionEditor, persistSharedParentCollections]);

    const saveSkeletonRef = useRef(saveSkeleton);
    const savingRef = useRef(saving);
    const fetchingRef = useRef(fetching);

    useEffect(() => {
        saveSkeletonRef.current = saveSkeleton;
    }, [saveSkeleton]);

    useEffect(() => {
        savingRef.current = saving;
    }, [saving]);

    useEffect(() => {
        fetchingRef.current = fetching;
    }, [fetching]);

    useEffect(() => {
        if (!compositionId) return;

        const intervalId = window.setInterval(() => {
            if (fetchingRef.current || savingRef.current) return;
            saveSkeletonRef.current({ silent: true });
        }, 30_000);

        return () => window.clearInterval(intervalId);
    }, [compositionId]);

    const commitTitle = useCallback(async (nextTitle: string) => {
        const cleanTitle = nextTitle.trim();
        if (!cleanTitle) return;
        setTitle(cleanTitle);
        if (!compositionId) return;

        try {
            const res = await fetch(`/api/compositions/${compositionId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title: cleanTitle }),
            });
            if (!res.ok) throw new Error("Failed to save title");
        } catch (error) {
            console.error("Failed to persist title", error);
            showToast("Title updated locally, but failed to save.", "error");
        }
    }, [compositionId]);

    return (
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragMove={handleDragMove} onDragEnd={handleDragEnd} collisionDetection={pointerWithin}>
            <div className="text-gray-300 h-screen w-full overflow-hidden flex flex-col antialiased bg-[#050505]">
                {/* Top Nav */}
                <nav className="h-14 border-b border-white/5 flex items-center justify-between px-6 bg-[#0a0a0a]/80 backdrop-blur-md z-50 shrink-0">
                    <div className="flex items-center gap-4">
                        <Link href="/">
                            <div className="w-8 h-8 bg-white text-black rounded-md flex items-center justify-center font-bold font-mono text-lg border border-gray-400 hover:scale-105 transition-transform">D</div>
                        </Link>
                        <div className="flex items-center text-sm font-semibold tracking-wide">
                            <span className="text-white">DropAI</span>
                            <span className="text-gray-600 font-normal mx-2">/</span>
                            {parentComposition && (
                                <>
                                    <Link
                                        href={`/builder/${parentComposition.id}`}
                                        className="text-gray-300 hover:text-blue-400 transition-colors max-w-[220px] truncate"
                                        title={parentComposition.title}
                                    >
                                        {parentComposition.title}
                                    </Link>
                                    <span className="text-gray-600 font-normal mx-2">/</span>
                                </>
                            )}
                            {isRenaming ? (
                                <input
                                    autoFocus
                                    type="text"
                                    value={editTitle}
	                                    onChange={(e) => setEditTitle(e.target.value)}
	                                    onBlur={() => {
	                                        void commitTitle(editTitle);
	                                        setIsRenaming(false);
	                                    }}
	                                    onKeyDown={(e) => {
	                                        if (e.key === 'Enter') {
	                                            void commitTitle(editTitle);
	                                            setIsRenaming(false);
	                                        }
	                                    }}
                                    className="bg-white/10 border-none outline-none text-white px-1 rounded"
                                />
                            ) : (
                                <span
                                    onClick={() => {
                                        setEditTitle(title);
                                        setIsRenaming(true);
                                    }}
                                    className="text-white cursor-pointer hover:text-blue-400 transition-colors"
                                >
                                    {title}
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1">
                            <button
                                onClick={() => { void pasteElementFromClipboard(); }}
                                title="Paste Element"
                                className="p-1.5 px-2 bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white rounded-md transition-colors flex items-center justify-center"
                            >
                                <ClipboardPaste className="w-4 h-4" />
                            </button>
                            <button
                                onClick={undoHistory}
                                disabled={!canUndo}
                                title="Undo (Ctrl/Cmd+Z)"
                                className="p-1.5 px-2 bg-white/5 hover:bg-white/10 border border-white/10 disabled:opacity-40 disabled:cursor-not-allowed text-gray-300 hover:text-white rounded-md transition-colors flex items-center justify-center"
                            >
                                <RotateCcw className="w-4 h-4" />
                            </button>
                            <button
                                onClick={redoHistory}
                                disabled={!canRedo}
                                title="Redo (Ctrl/Cmd+Y or Ctrl/Cmd+Shift+Z)"
                                className="p-1.5 px-2 bg-white/5 hover:bg-white/10 border border-white/10 disabled:opacity-40 disabled:cursor-not-allowed text-gray-300 hover:text-white rounded-md transition-colors flex items-center justify-center"
                            >
                                <RotateCw className="w-4 h-4" />
                            </button>
                        </div>
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
                                                    <ScrubInput
                                                        min={10}
                                                        max={600}
                                                        value={TOTAL_DURATION}
                                                        onChange={(v) => setTOTAL_DURATION(v)}
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

                    <aside
                        className="relative border-r border-white/5 flex flex-col bg-[#0a0a0a] shrink-0 overflow-hidden"
                        style={{ width: isCollectionsPaneCollapsed ? COLLECTIONS_PANE_COLLAPSED_WIDTH : collectionsPaneWidth }}
                    >
                        {isCollectionsPaneCollapsed && (
                            <div className="flex h-full flex-col items-center py-3">
                                <button
                                    onClick={toggleCollectionsPaneCollapsed}
                                    className="w-8 h-8 rounded-md bg-white/5 border border-white/8 text-gray-400 hover:text-white hover:bg-white/10 transition-colors flex items-center justify-center"
                                    title="Expand collections pane"
                                    aria-label="Expand collections pane"
                                >
                                    <ChevronRight className="w-4 h-4" />
                                </button>
                                <div className="mt-4 text-[9px] font-bold uppercase tracking-widest text-gray-600 font-mono [writing-mode:vertical-rl] rotate-180">
                                    Collections
                                </div>
                            </div>
                        )}
                        {!isCollectionsPaneCollapsed && (
                            <div
                            role="separator"
                            aria-label="Resize collections pane"
                            aria-orientation="vertical"
                            tabIndex={0}
                            onPointerDown={handleCollectionsPaneResizeStart}
                            onKeyDown={(e) => {
                                if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
                                e.preventDefault();
                                const direction = e.key === "ArrowRight" ? 1 : -1;
                                const nextWidth = Math.max(
                                    COLLECTIONS_PANE_MIN_WIDTH,
                                    Math.min(COLLECTIONS_PANE_MAX_WIDTH, collectionsPaneWidth + direction * 16),
                                );
                                setCollectionsPaneWidth(nextWidth);
                                window.localStorage.setItem(COLLECTIONS_PANE_WIDTH_STORAGE_KEY, String(nextWidth));
                            }}
                            className="absolute top-0 right-[-4px] z-30 h-full w-2 cursor-col-resize outline-none group"
                        >
                            <div className="mx-auto h-full w-px bg-white/10 transition-colors group-hover:bg-blue-400/70 group-focus:bg-blue-400/70" />
                            </div>
                        )}
                        <div className={cn("flex min-h-0 flex-1 flex-col", isCollectionsPaneCollapsed && "hidden")}>
                        <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
                            <h2 className="text-[10px] font-bold uppercase tracking-widest text-gray-500 font-mono">Collections</h2>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={toggleCollectionsPaneCollapsed}
                                    className="text-gray-500 hover:text-gray-300 transition-colors"
                                    title="Collapse collections pane"
                                    aria-label="Collapse collections pane"
                                >
                                    <ChevronLeft className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={() => { void pasteCollectionsFromClipboard(); }}
                                    className="text-gray-500 hover:text-emerald-300 transition-colors"
                                    title="Paste copied collection"
                                >
                                    <ClipboardPaste className="w-3.5 h-3.5" />
                                </button>
                                <button
                                    onClick={() => setIsCreatingCollection(!isCreatingCollection)}
                                    className="text-gray-500 hover:text-gray-300 transition-colors"
                                    title="Create collection"
                                >
                                    <Plus className="w-4 h-4" />
                                </button>
                            </div>
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
                                        <div className="grid grid-cols-2 gap-1">
                                            {(isSubCompositionEditor
                                                ? (["text", "image", "video", "audio"] as CollectionType[])
                                                : (["text", "image", "video", "audio", "subComposition"] as CollectionType[])
                                            ).map(t => {
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
                                                        {t === "subComposition" ? "Sub-Compositions" : t}
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
                                                    applyCollectionsChange(current => [...current, newCol]);
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
                            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-2.5 space-y-2">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-[9px] font-bold uppercase tracking-widest text-amber-300/80 font-mono">Text Groups</h3>
                                    <button
                                        onClick={() => setIsCreatingTextGroup(v => !v)}
                                        className="text-amber-300/60 hover:text-amber-200 transition-colors"
                                        title="Create text group"
                                    >
                                        <Plus className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                                {isCreatingTextGroup && (
                                    <div className="space-y-1.5 border border-amber-500/20 rounded-md p-2 bg-black/20">
                                        <input
                                            value={newTextGroupTitle}
                                            onChange={(e) => setNewTextGroupTitle(e.target.value)}
                                            placeholder="Group name (e.g. Hooks)"
                                            className="w-full text-[10px] font-mono bg-black/40 border border-white/10 rounded px-2 py-1.5 text-gray-300 placeholder:text-gray-600 outline-none focus:border-white/20"
                                        />
                                        <div className="space-y-1 max-h-28 overflow-y-auto custom-scrollbar pr-1">
                                            {collections.filter(c => c.type === 'text').map(tc => (
                                                <label key={tc.id} className="flex items-center gap-2 text-[9px] font-mono text-gray-400 cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={!!newTextGroupSelection[tc.id]}
                                                        onChange={(e) => setNewTextGroupSelection(prev => ({ ...prev, [tc.id]: e.target.checked }))}
                                                        className="accent-amber-400"
                                                    />
                                                    <span className="truncate">{tc.title}</span>
                                                </label>
                                            ))}
                                        </div>
                                        <div className="flex gap-1.5">
                                            <button
	                                                onClick={() => {
	                                                    const selectedIds = Object.entries(newTextGroupSelection).filter(([, v]) => v).map(([id]) => id);
	                                                    if (!newTextGroupTitle.trim() || selectedIds.length < 2) return;
	                                                    const cleaned = textCollectionGroups
	                                                        .map(g => ({ ...g, collectionIds: g.collectionIds.filter(id => !selectedIds.includes(id)) }))
	                                                        .filter(g => g.collectionIds.length > 1);
	                                                    const nextGroups = [...cleaned, {
	                                                        id: `tg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
	                                                        title: newTextGroupTitle.trim(),
	                                                        collectionIds: selectedIds,
	                                                    }];
	                                                    replaceTextCollectionGroups(nextGroups);
	                                                    void persistCollections(collectionsRef.current, nextGroups);
	                                                    setNewTextGroupTitle("");
	                                                    setNewTextGroupSelection({});
	                                                    setIsCreatingTextGroup(false);
                                                }}
                                                className="flex-1 text-[9px] font-mono py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 rounded transition-colors"
                                            >
                                                Create
                                            </button>
                                            <button
                                                onClick={() => { setIsCreatingTextGroup(false); setNewTextGroupTitle(""); setNewTextGroupSelection({}); }}
                                                className="flex-1 text-[9px] font-mono py-1 bg-white/5 hover:bg-white/10 text-gray-500 rounded transition-colors"
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                        <p className="text-[8px] text-gray-600 font-mono">Pick at least 2 text collections.</p>
                                    </div>
                                )}
                                {textCollectionGroups.length === 0 ? (
                                    <p className="text-[8px] font-mono text-gray-600">Create a group to treat collections as higher-level variants.</p>
                                ) : (
                                    <div className="space-y-1.5">
                                        {textCollectionGroups.map(group => (
                                            <div key={group.id} className="border border-amber-500/20 rounded-md p-2 bg-black/20">
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="text-[9px] font-mono text-amber-200 truncate">{group.title}</span>
	                                                    <button
	                                                        onClick={() => {
	                                                            const nextGroups = textCollectionGroups.filter(g => g.id !== group.id);
	                                                            replaceTextCollectionGroups(nextGroups);
	                                                            void persistCollections(collectionsRef.current, nextGroups);
	                                                        }}
	                                                        className="text-gray-500 hover:text-red-400 transition-colors"
                                                        title="Delete text group"
                                                    >
                                                        <X className="w-3 h-3" />
                                                    </button>
                                                </div>
                                                <div className="mt-1 flex flex-wrap gap-1">
                                                    {group.collectionIds.map(colId => {
                                                        const col = collections.find(c => c.id === colId);
                                                        if (!col) return null;
                                                        return (
                                                            <span key={colId} className="px-1.5 py-0.5 rounded bg-white/5 text-[8px] font-mono text-gray-400">
                                                                {col.title}
                                                            </span>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                            {collections.map(col => (
                                <CollectionCard
                                    key={col.id}
                                    collection={col}
	                                    allCollections={collections}
	                                    onAddItem={(colId, label, value, duration) => {
	                                        applyCollectionsChange(current => current.map(c =>
	                                            c.id === colId ? { ...c, items: [...c.items, { id: `v-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, label, value, duration }] } : c
	                                        ));
	                                    }}
                                    onAddItems={(colId, items) => {
                                        applyCollectionsChange(current => current.map(c =>
                                            c.id === colId
                                                ? {
                                                    ...c,
                                                    items: [
                                                        ...c.items,
                                                        ...items.map(item => ({
                                                            id: `v-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                                                            ...item,
                                                        })),
                                                    ],
                                                }
                                                : c
                                        ));
                                    }}
                                    onAddNullVariant={(colId) => {
                                        applyCollectionsChange(current => current.map(c =>
                                            c.id === colId
                                                ? {
                                                    ...c,
                                                    items: [
                                                        ...c.items,
                                                        {
                                                            id: `null-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                                                            label: "Null",
                                                            value: "",
                                                            duration: 0,
                                                            isNull: true,
                                                        },
                                                    ],
                                                }
                                                : c
                                        ));
                                    }}
	                                    onDeleteItem={(colId, variantId) => {
	                                        const collection = collections.find(c => c.id === colId);
	                                        const variant = collection?.items.find(v => v.id === variantId);
	                                        if (collection?.type === 'subComposition' && variant && !isNullVariant(variant)) {
	                                            const sequenceId = variant.value || variant.id;
	                                            const referenceCount = collections.reduce((count, c) => {
	                                                if (c.type !== 'subComposition') return count;
	                                                return count + c.items.filter(item => !isNullVariant(item) && (item.value || item.id) === sequenceId).length;
	                                            }, 0);
	                                            if (referenceCount > 1) {
	                                                applyCollectionsChange(current => current.map(c =>
	                                                    c.id === colId ? { ...c, items: c.items.filter(v => v.id !== variantId) } : c
	                                                ));
	                                                return;
	                                            }
	                                            void deleteNestedSequence(sequenceId);
	                                            return;
	                                        }
	                                        applyCollectionsChange(current => current.map(c =>
	                                            c.id === colId ? { ...c, items: c.items.filter(v => v.id !== variantId) } : c
	                                        ));
	                                    }}
	                                    onUpdateItem={(colId, variantId, updates) => {
	                                        applyCollectionsChange(current => current.map(c =>
	                                            c.id === colId ? { ...c, items: c.items.map(v => v.id === variantId ? { ...v, ...updates } : v) } : c
	                                        ));
	                                    }}
	                                    onDuplicateItem={async (colId, variantId) => {
	                                        const collection = collections.find(c => c.id === colId);
	                                        const variant = collection?.items.find(v => v.id === variantId);
	                                        if (!collection || !variant) return;

	                                        let clone: CollectionVariant | null = null;
	                                        if (collection.type === 'subComposition' && !isNullVariant(variant)) {
	                                            const sourceId = variant.value || variant.id;
	                                            const source = nestedSequences.find(seq => seq.id === sourceId);
	                                            if (!source || !compositionId) {
	                                                showToast("Could not duplicate sub-composition.", "error");
	                                                return;
	                                            }

	                                            try {
	                                                const res = await fetch('/api/compositions', {
	                                                    method: 'POST',
	                                                    headers: { 'Content-Type': 'application/json' },
	                                                    body: JSON.stringify({
	                                                        title: `${source.title || variant.label} Copy`,
	                                                        angle: undefined,
	                                                        kind: source.kind || 'sequence',
	                                                        parentId: compositionId,
	                                                        duration: source.duration,
	                                                        elements: typeof source.elements === 'string' ? JSON.parse(source.elements || '[]') : source.elements,
	                                                        tracks: typeof source.tracks === 'string' ? JSON.parse(source.tracks || '[]') : source.tracks,
	                                                        collections: typeof source.collections === 'string' ? JSON.parse(source.collections || '{}') : source.collections,
	                                                    }),
	                                                });
	                                                const data = await res.json();
	                                                if (!res.ok) throw new Error(data.error || "Failed to duplicate sub-composition");
	                                                nestedSequencesRef.current = [data, ...nestedSequencesRef.current];
	                                                setNestedSequences(prev => [data, ...prev]);
	                                                clone = {
	                                                    ...variant,
	                                                    id: data.id,
	                                                    label: data.title,
	                                                    value: data.id,
	                                                    duration: Math.max(0.1, data.duration || variant.duration || EMPTY_NESTED_COMPOSITION_DISPLAY_DURATION),
	                                                    linkedVariantIds: variant.linkedVariantIds ? [...variant.linkedVariantIds] : undefined,
	                                                };
	                                            } catch (error) {
	                                                console.error("Failed to duplicate sub-composition", error);
	                                                showToast(error instanceof Error ? error.message : "Failed to duplicate sub-composition.", "error");
	                                                return;
	                                            }
	                                        } else {
	                                            clone = {
	                                                ...variant,
	                                                id: `v-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
	                                                label: `${variant.label} Copy`,
	                                                linkedVariantIds: variant.linkedVariantIds ? [...variant.linkedVariantIds] : undefined,
	                                            };
	                                        }

	                                        const nextCollections = collectionsRef.current.map(c => {
	                                            if (c.id !== colId || !clone) return c;
	                                            const index = c.items.findIndex(v => v.id === variantId);
	                                            const nextItems = [...c.items];
	                                            nextItems.splice(index + 1, 0, clone);
	                                            return { ...c, items: nextItems };
	                                        });
	                                        replaceCollections(nextCollections);
	                                        void persistCollections(nextCollections);
	                                    }}
                                    onCopyCollection={copyCollectionToClipboard}
	                                    onDeleteCollection={(colId) => {
	                                        const collection = collections.find(c => c.id === colId);
                                            if (isSubCompositionEditor && collection?.sharedFromParent) {
                                                showToast("Parent shared collections stay linked to the sub-composition.", "error");
                                                return;
                                            }
	                                        if (collection?.type === 'subComposition') {
	                                            const idsToDelete = new Set(collection.items.filter(item => !isNullVariant(item)).map(item => item.value || item.id));
	                                            const outsideIds = new Set(collections
	                                                .filter(c => c.id !== colId && c.type === 'subComposition')
	                                                .flatMap(c => c.items.filter(item => !isNullVariant(item)).map(item => item.value || item.id)));
	                                            idsToDelete.forEach(sequenceId => {
	                                                if (!outsideIds.has(sequenceId)) void deleteNestedSequence(sequenceId);
	                                            });
	                                        }
                                        const nextCollections = collectionsRef.current.filter(c => c.id !== colId);
                                        const nextTextGroups = textCollectionGroups
                                            .map(g => ({ ...g, collectionIds: g.collectionIds.filter(id => id !== colId) }))
                                            .filter(g => g.collectionIds.length > 1);
                                        replaceCollections(nextCollections);
                                        setElements(prev => prev.filter(el => el.collectionId !== colId));
                                        replaceTextCollectionGroups(nextTextGroups);
                                        void persistCollections(nextCollections, nextTextGroups);
                                        if (elements.find(el => el.elementId === selectedElementId && el.collectionId === colId)) {
                                            setSelectedElementId(null);
                                        }
                                    }}
                                    onCreateSubComposition={createSubComposition}
                                    onSwitchVersion={(colId, versionId) => {
                                        const nextCollections = collectionsRef.current.map(c =>
                                            c.id === colId ? switchCollectionVersion(c, versionId) : c
                                        );
                                        replaceCollections(nextCollections, "versions");
                                        void persistCollections(nextCollections);
                                    }}
                                    onCreateVersion={(colId, name, duplicateActive) => {
                                        const nextCollections = collectionsRef.current.map(c =>
                                            c.id === colId ? createCollectionVersion(c, name, duplicateActive) : c
                                        );
                                        replaceCollections(nextCollections, "versions");
                                        void persistCollections(nextCollections);
                                    }}
                                    onRenameVersion={(colId, versionId, name) => {
                                        const nextCollections = collectionsRef.current.map(c =>
                                            c.id === colId ? renameCollectionVersion(c, versionId, name) : c
                                        );
                                        replaceCollections(nextCollections, "versions");
                                        void persistCollections(nextCollections);
                                    }}
                                    onDeleteVersion={(colId, versionId) => {
                                        const collection = collectionsRef.current.find(c => c.id === colId);
                                        if (collection && getCollectionVersions(collection).length <= 1) {
                                            showToast("A collection needs at least one version.", "error");
                                            return;
                                        }
                                        const nextCollections = collectionsRef.current.map(c =>
                                            c.id === colId ? deleteCollectionVersion(c, versionId) : c
                                        );
                                        replaceCollections(nextCollections, "versions");
                                        void persistCollections(nextCollections);
                                    }}
                                />
                            ))}
                        </div>
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
                                                    .filter(baseEl => {
                                                        const elMode = getVariantMode(baseEl.elementId);
                                                        const rawEl = elMode !== 'all' ? getEffectiveElement(baseEl, elMode) : baseEl;
                                                        return rawEl.visible !== false;
                                                    })
                                                    .sort((a, b) => {
                                                        const ta = tracks.findIndex(t => t.id === (a.trackId || 'track-0'));
                                                        const tb = tracks.findIndex(t => t.id === (b.trackId || 'track-0'));
                                                        if (ta !== tb) return tb - ta; // Lower track index should map to later array order (to be on top)
                                                        return a.zIndex - b.zIndex;
                                                    })
                                                    .map(baseEl => {
                                                        const elMode = getVariantMode(baseEl.elementId);
                                                        const rawEl = elMode !== 'all' ? getEffectiveElement(baseEl, elMode) : baseEl;
                                                        const timing = elementTimings.get(baseEl.elementId);
                                                        
                                                        const trackIndex = tracks.findIndex(t => t.id === (baseEl.trackId || 'track-0'));
                                                        const el = { ...rawEl, ...(timing || {}), zIndex: getTrackStackZ(trackIndex, rawEl.zIndex || 0) };

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
                                                if (rawEl.visible === false) return null;
                                                const trackIndex = tracks.findIndex(t => t.id === (rawEl.trackId || 'track-0'));
                                                const el = { ...rawEl, zIndex: getTrackStackZ(trackIndex, rawEl.zIndex || 0, 100) }; // Boost selected on top of its track
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
                                                {selectedElement && effectiveElement && effectiveElement.visible !== false && (
                                                    // Only show rotation handles if the element is active in the current timeline position
                                                    (currentTime >= effectiveElement.startTime && currentTime < effectiveElement.startTime + effectiveElement.duration) && (
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
                                            {previewTimelineItems
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
                                                    const blur = Math.max(animStyle.blur, rawEl.nestedCompositionBlur || 0);
                                                    
                                                    const trackIndex = tracks.findIndex(t => t.id === (rawEl.trackId || 'track-0'));
                                                    const el = { ...rawEl, zIndex: getTrackStackZ(trackIndex, rawEl.zIndex || 0) };

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
                                                                transform: getPreviewElementTransform(el, animStyle),
                                                                transformOrigin: 'center center',
                                                                backfaceVisibility: 'hidden',
                                                                willChange: 'transform, opacity, filter',
                                                                transitionProperty: isPlaying ? 'transform, opacity, filter' : undefined,
                                                                transitionDuration: isPlaying ? `${PLAYBACK_STATE_INTERVAL_MS}ms` : undefined,
                                                                transitionTimingFunction: isPlaying ? 'linear' : undefined,
                                                                filter: blur > 0 ? `blur(${blur}px)` : undefined,
                                                            }}
                                                        >
                                                            {el.collectionType === 'text' ? (
                                                                <div className="w-full h-full flex items-center justify-center px-2">
                                                                    <span className="text-white text-sm w-full" style={{ fontSize: el.fontSize ? `${el.fontSize}px` : undefined, fontWeight: el.fontWeight || 'bold', fontStyle: el.fontStyle || 'normal', textDecoration: el.textDecoration || 'none', letterSpacing: el.letterSpacing ? `${el.letterSpacing}px` : undefined, lineHeight: el.lineHeight ? el.lineHeight : undefined, textAlign: el.textAlign || 'center', whiteSpace: 'pre-wrap', wordBreak: 'break-word', WebkitTextStroke: el.textStrokeWidth ? `${el.textStrokeWidth}px ${el.textStrokeColor || '#000000'}` : undefined, paintOrder: el.textStrokeWidth ? 'stroke fill' : undefined }}>
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
                                                                        ref={(videoEl) => {
                                                                            if (!videoEl) return;
                                                                            const rawDur = (videoEl.duration && !isNaN(videoEl.duration)) ? videoEl.duration : Infinity;
                                                                            const targetRate = getElementPlaybackSpeed(el);
                                                                            // Randomize window: pick a seeded-random start within the full media, preserving clip duration
                                                                            const baseOffset = el.randomizeWindow && rawDur !== Infinity
                                                                                ? mulberry32(hashString(`${variantSeed}-${getSelectionKey(el)}-window`))() * Math.max(0, rawDur - (el.duration * targetRate))
                                                                                : (el.mediaOffset ?? 0);
                                                                            const { time: safeLocalTime, sourceExhausted } = getPreviewMediaTime(currentTime, el, baseOffset, rawDur);

                                                                            // Sync time if scrubbing or drifting out of sync
                                                                            if (Math.abs(videoEl.currentTime - safeLocalTime) > 0.2) {
                                                                                videoEl.currentTime = safeLocalTime;
                                                                            }
                                                                            // Playback speed
                                                                            if (videoEl.playbackRate !== targetRate) videoEl.playbackRate = targetRate;
                                                                            // Audio fade in/out
                                                                            const baseVol = el.volume ?? 1;
                                                                            const elapsed = currentTime - el.startTime;
                                                                            const remaining = el.startTime + el.duration - currentTime;
                                                                            let fadeMult = 1;
                                                                            if (el.audioFadeIn && el.audioFadeIn > 0 && elapsed < el.audioFadeIn) fadeMult = Math.min(1, elapsed / el.audioFadeIn);
                                                                            else if (el.audioFadeOut && el.audioFadeOut > 0 && remaining < el.audioFadeOut) fadeMult = Math.min(1, remaining / el.audioFadeOut);
                                                                            const targetVol = Math.max(0, Math.min(1, baseVol * fadeMult));
                                                                            if (Math.abs(videoEl.volume - targetVol) > 0.01) videoEl.volume = targetVol;
                                                                            if (isPlaying && isActive && !sourceExhausted) {
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
                                                                    ref={(audioEl) => {
                                                                        if (!audioEl) return;
                                                                        const rawDur = (audioEl.duration && !isNaN(audioEl.duration)) ? audioEl.duration : Infinity;
                                                                        const targetRate = getElementPlaybackSpeed(el);
                                                                        const baseOffset = el.randomizeWindow && rawDur !== Infinity
                                                                            ? mulberry32(hashString(`${variantSeed}-${getSelectionKey(el)}-window`))() * Math.max(0, rawDur - (el.duration * targetRate))
                                                                            : (el.mediaOffset ?? 0);
                                                                        const { time: safeLocalTime, sourceExhausted } = getPreviewMediaTime(currentTime, el, baseOffset, rawDur);
                                                                        if (Math.abs(audioEl.currentTime - safeLocalTime) > 0.2) {
                                                                            audioEl.currentTime = safeLocalTime;
                                                                        }
                                                                        if (audioEl.playbackRate !== targetRate) audioEl.playbackRate = targetRate;
                                                                        const baseVol = el.volume ?? 1;
                                                                        const elapsed = currentTime - el.startTime;
                                                                        const remaining = el.startTime + el.duration - currentTime;
                                                                        let fadeMult = 1;
                                                                        if (el.audioFadeIn && el.audioFadeIn > 0 && elapsed < el.audioFadeIn) fadeMult = Math.min(1, elapsed / el.audioFadeIn);
                                                                        else if (el.audioFadeOut && el.audioFadeOut > 0 && remaining < el.audioFadeOut) fadeMult = Math.min(1, remaining / el.audioFadeOut);
                                                                        const targetVol = Math.max(0, Math.min(1, baseVol * fadeMult));
                                                                        if (Math.abs(audioEl.volume - targetVol) > 0.01) audioEl.volume = targetVol;
                                                                        if (isPlaying && isActive && !sourceExhausted) {
                                                                            if (audioEl.paused) audioEl.play().catch(() => { });
                                                                        } else {
                                                                            if (!audioEl.paused) audioEl.pause();
                                                                        }
                                                                    }}
                                                                />
                                                            ) : el.collectionType === 'nestedSequence' ? (
                                                                <div className="w-full h-full flex items-center justify-center bg-cyan-500/15 border border-cyan-400/30">
                                                                    <span className="text-[10px] font-mono text-cyan-100 truncate px-2">{el.title}</span>
                                                                </div>
                                                            ) : null}
                                                        </div>
                                                    );
                                                })}

                                            {/* Hidden audio elements for playback */}
                                            {previewTimelineItems
                                                .filter(({ el }) => el.collectionType === 'audio' && el.visible !== false)
                                                .map(({ el, variant }) => {
                                                    const isActive = currentTime >= el.startTime && currentTime < el.startTime + el.duration;
                                                    return (
                                                        <audio
                                                            key={`aud-${el.elementId}-${variant?.value || el.content || 'base'}`}
                                                            src={variant?.value || el.content}
                                                            ref={(audioEl) => {
                                                                if (!audioEl) return;
                                                                const rawDur = (audioEl.duration && !isNaN(audioEl.duration)) ? audioEl.duration : Infinity;
                                                                const targetRate = getElementPlaybackSpeed(el);
                                                                const baseOffset = el.randomizeWindow && rawDur !== Infinity
                                                                    ? mulberry32(hashString(`${variantSeed}-${getSelectionKey(el)}-window`))() * Math.max(0, rawDur - (el.duration * targetRate))
                                                                    : (el.mediaOffset ?? 0);
                                                                const { time: safeLocalTime, sourceExhausted } = getPreviewMediaTime(currentTime, el, baseOffset, rawDur);
                                                                if (Math.abs(audioEl.currentTime - safeLocalTime) > 0.2) {
                                                                    audioEl.currentTime = safeLocalTime;
                                                                }
                                                                if (audioEl.playbackRate !== targetRate) audioEl.playbackRate = targetRate;
                                                                const baseVol = el.volume ?? 1;
                                                                const elapsed = currentTime - el.startTime;
                                                                const remaining = el.startTime + el.duration - currentTime;
                                                                let fadeMult = 1;
                                                                if (el.audioFadeIn && el.audioFadeIn > 0 && elapsed < el.audioFadeIn) fadeMult = Math.min(1, elapsed / el.audioFadeIn);
                                                                else if (el.audioFadeOut && el.audioFadeOut > 0 && remaining < el.audioFadeOut) fadeMult = Math.min(1, remaining / el.audioFadeOut);
                                                                const targetVol = Math.max(0, Math.min(1, baseVol * fadeMult));
                                                                if (Math.abs(audioEl.volume - targetVol) > 0.01) audioEl.volume = targetVol;
                                                                if (isPlaying && isActive && !sourceExhausted) {
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
                                                                        {/* Track Shuffle — only available when magnet is ON */}
                                                                        <button
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                if (!track.magnet) return;
                                                                                // Collect track elements sorted by current resolved startTime
                                                                                const trackEls = (prevElements: CanvasElement[]) => {
                                                                                    const inTrack = prevElements
                                                                                        .filter((el: CanvasElement) => (el.trackId || 'track-0') === track.id)
                                                                                        // Exclude syncWith-anchored elements — they follow their target automatically
                                                                                        .filter((el: CanvasElement) => !el.syncWith?.targetId);
                                                                                    // Get their current resolved start times (the "slots")
                                                                                    const slots = inTrack
                                                                                        .map((el: CanvasElement) => elementTimings.get(el.elementId)?.startTime ?? el.startTime)
                                                                                        .sort((a: number, b: number) => a - b);
                                                                                    // Fisher-Yates shuffle of the element list
                                                                                    const shuffled = [...inTrack];
                                                                                    for (let i = shuffled.length - 1; i > 0; i--) {
                                                                                        const j = Math.floor(Math.random() * (i + 1));
                                                                                        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
                                                                                    }
                                                                                    // Assign sorted slots to shuffled elements
                                                                                    const idToNewStart = new Map(shuffled.map((el: CanvasElement, idx: number) => [el.elementId, slots[idx]]));
                                                                                    return prevElements.map((el: CanvasElement) => {
                                                                                        if (idToNewStart.has(el.elementId)) {
                                                                                            const mode = getVariantModeRef.current(el.elementId);
                                                                                            return applyToElement(el, { startTime: idToNewStart.get(el.elementId)! }, mode);
                                                                                        }
                                                                                        return el;
                                                                                    });
                                                                                };
                                                                                setElements(trackEls);
                                                                            }}
                                                                            onPointerDown={(e) => e.stopPropagation()}
                                                                            title={track.magnet ? "Shuffle element order in this track" : "Enable magnet to shuffle"}
                                                                            className={cn(
                                                                                "px-1.5 py-0.5 rounded transition-colors text-[9px] flex items-center gap-1",
                                                                                track.magnet
                                                                                    ? "bg-violet-500/20 text-violet-300 border border-violet-500/40 hover:bg-violet-500/30 cursor-pointer"
                                                                                    : "text-gray-700 cursor-not-allowed opacity-40"
                                                                            )}
                                                                        >
                                                                            <Shuffle className="w-2.5 h-2.5" />
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
                                                                                        const resolvedColId = resolvedCollectionIdByElement[el.elementId] || el.collectionId;
                                                                                        const col = collections.find(c => c.id === resolvedColId);
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
                                                                                                        el.collectionType === 'nestedSequence'
                                                                                                            ? (selectedElementId === el.elementId ? 'bg-violet-600 border border-violet-400' : 'bg-violet-900/80 border border-violet-500/30 hover:bg-violet-800')
                                                                                                            : isMediaAllMode
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
                                                onClick={() => { void copySelectedElementToClipboard(); }}
                                                className="p-1.5 bg-white/5 text-white/50 hover:bg-white/10 hover:text-cyan-300 rounded-md transition-colors"
                                                title="Copy Element"
                                            >
                                                <Copy className="w-3.5 h-3.5" />
                                            </button>
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

                                    {selectedNestedEditorTarget && (
                                        <Link
                                            href={`/builder/${selectedNestedEditorTarget.id}`}
                                            className="flex items-center justify-between gap-2 rounded-lg border border-violet-500/25 bg-violet-500/10 px-3 py-2 text-[10px] font-mono text-violet-200 hover:bg-violet-500/15 hover:border-violet-400/40 transition-colors"
                                        >
                                            <span className="flex items-center gap-2 min-w-0">
                                                <Film className="w-3.5 h-3.5 shrink-0 text-violet-300" />
                                                <span className="truncate">Open {selectedNestedEditorTarget.title}</span>
                                            </span>
                                            <span className="text-violet-300/70 shrink-0">Editor</span>
                                        </Link>
                                    )}

	                                    {/* Universal Variant Selector */}
                                    {(() => {
                                        const col = collections.find(c => c.id === selectedResolvedCollectionId);
                                        const variants = col?.items || [];
                                        if (variants.length === 0) return (
                                            <div className="bg-[#111] rounded-lg border border-dashed border-white/5 px-3 py-3 text-center">
                                                <span className="text-[10px] text-gray-600 font-mono">Add variants in the collection to customize per-variant</span>
                                            </div>
                                        );
                                        return (
                                            <div className="space-y-2 pb-4 border-b border-white/5">
                                                {selectedElement.collectionType === 'text' && selectedTextCollectionGroup && (
                                                    <div className="space-y-1.5 mb-2">
                                                        <h4 className="text-[9px] font-bold uppercase tracking-widest text-gray-500 font-mono flex items-center gap-1.5">
                                                            <ListPlus className="w-3 h-3 text-amber-400" /> Text Collection Variant
                                                            <span className="text-amber-400/60">({selectedTextCollectionGroup.collectionIds.length})</span>
                                                        </h4>
                                                        <div className="flex flex-wrap gap-1">
                                                            {selectedTextCollectionGroup.collectionIds.length > 1 && (
                                                                <button
                                                                    onClick={() => setElements(prev => prev.map(el => el.elementId === selectedElement.elementId ? { ...el, textCollectionMode: 'all' } : el))}
                                                                    className={cn("px-2.5 py-1.5 rounded-md text-[9px] font-mono font-bold uppercase tracking-wide transition-all border", (selectedElement.textCollectionMode || 'all') === 'all' ? "bg-amber-500/20 border-amber-500/40 text-amber-300 shadow-[0_0_8px_rgba(245,158,11,0.15)]" : "bg-white/5 border-white/5 text-gray-500 hover:text-gray-300 hover:bg-white/10")}
                                                                >
                                                                    ✦ All
                                                                </button>
                                                            )}
                                                            {selectedTextCollectionGroup.collectionIds.map(groupColId => {
                                                                const groupCol = collections.find(c => c.id === groupColId);
                                                                if (!groupCol) return null;
                                                                const isActive = (selectedElement.textCollectionMode || 'all') === groupColId;
                                                                return (
                                                                    <button
                                                                        key={groupColId}
                                                                        onClick={() => setElements(prev => prev.map(el => el.elementId === selectedElement.elementId ? { ...el, textCollectionMode: groupColId } : el))}
                                                                        className={cn("px-2.5 py-1.5 rounded-md text-[9px] font-mono transition-all border truncate max-w-[140px]", isActive ? "bg-amber-500/20 border-amber-500/40 text-amber-300 shadow-[0_0_8px_rgba(245,158,11,0.15)]" : "bg-white/5 border-white/5 text-gray-500 hover:text-gray-300 hover:bg-white/10")}
                                                                        title={groupCol.title}
                                                                    >
                                                                        {groupCol.title}
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                        <p className="text-[8px] font-mono text-amber-400/50">
                                                            Group source: <span className="text-amber-300/80">{col?.title || "N/A"}</span>
                                                        </p>
                                                    </div>
                                                )}
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
                                                {variants.length > 1 && selectedVariantMode === 'all' && (
                                                    <div className="pt-2 mt-2 border-t border-white/5">
                                                        <h5 className="text-[8px] font-bold uppercase tracking-widest text-gray-600 font-mono mb-1.5 flex items-center gap-1">
                                                            <ListOrdered className="w-2.5 h-2.5" /> Selection Mode
                                                        </h5>
                                                        <div className="grid grid-cols-2 gap-1">
                                                            {(["random", "sequential"] as VariantSelectionMode[]).map(mode => {
                                                                const isActive = getElementVariantSelectionMode(selectedElement) === mode;
                                                                return (
                                                                    <button
                                                                        key={mode}
                                                                        onClick={() => updateSelected({ variantSelectionMode: mode })}
                                                                        className={cn(
                                                                            "px-2.5 py-1.5 rounded-md text-[9px] font-mono uppercase transition-all border flex items-center justify-center gap-1.5",
                                                                            isActive
                                                                                ? "bg-violet-500/20 border-violet-500/40 text-violet-300 shadow-[0_0_8px_rgba(139,92,246,0.15)]"
                                                                                : "bg-white/5 border-white/5 text-gray-500 hover:text-gray-300 hover:bg-white/10"
                                                                        )}
                                                                    >
                                                                        {mode === "random" ? <Shuffle className="w-3 h-3" /> : <ListOrdered className="w-3 h-3" />}
                                                                        {mode}
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                )}
                                                {selectedVariantMode !== 'all' && (
                                                    <p className="text-[8px] font-mono text-blue-400/50">Changes only apply to this variant</p>
                                                )}

                                                {/* Local Instance Exclusions */}
                                                {variants.length > 1 && (
                                                    <div className="pt-2 mt-2 border-t border-white/5">
                                                        <h5 className="text-[8px] font-bold uppercase tracking-widest text-gray-600 font-mono mb-1.5 flex items-center gap-1">
                                                            <Ban className="w-2.5 h-2.5" /> Instance Exclusions
                                                        </h5>
                                                        <p className="text-[7px] font-mono text-gray-600 mb-2">Exclude variants only for this element — does not affect other instances of this collection.</p>
                                                        <div className="flex flex-wrap gap-1">
                                                            {variants.map(v => {
                                                                const isLocallyExcluded = selectedElement.localExcludedVariantIds?.includes(v.id) ?? false;
                                                                const isGloballyExcluded = v.excluded ?? false;
                                                                return (
                                                                    <button
                                                                        key={v.id}
                                                                        disabled={isGloballyExcluded}
                                                                        onClick={() => {
                                                                            setElements(prev => prev.map(el => {
                                                                                if (el.elementId !== selectedElement.elementId) return el;
                                                                                const current = el.localExcludedVariantIds || [];
                                                                                const next = isLocallyExcluded
                                                                                    ? current.filter(id => id !== v.id)
                                                                                    : [...current, v.id];
                                                                                return { ...el, localExcludedVariantIds: next };
                                                                            }));
                                                                        }}
                                                                        className={cn(
                                                                            "px-2 py-1 rounded text-[8px] font-mono transition-all border flex items-center gap-1 max-w-[120px]",
                                                                            isGloballyExcluded
                                                                                ? "border-white/5 bg-white/[0.02] text-gray-700 cursor-not-allowed line-through"
                                                                                : isLocallyExcluded
                                                                                    ? "border-orange-500/40 bg-orange-500/10 text-orange-400"
                                                                                    : "border-white/5 bg-white/5 text-gray-500 hover:text-gray-300 hover:bg-white/10"
                                                                        )}
                                                                        title={isGloballyExcluded ? `${v.label} is globally excluded` : isLocallyExcluded ? `Include ${v.label} in this instance` : `Exclude ${v.label} from this instance`}
                                                                    >
                                                                        <Ban className={cn("w-2.5 h-2.5 shrink-0", isLocallyExcluded ? "text-orange-400" : "text-gray-600")} />
                                                                        <span className="truncate">{v.label}</span>
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
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
                                                    <ScrubInput
                                                        value={Math.round((effectiveElement || selectedElement)[key])}
                                                        onChange={v => updateSelected({ [key]: v })}
                                                        className="bg-transparent text-white text-xs w-full focus:outline-none font-mono"
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <div className="flex-1 flex items-center bg-[#111] rounded-md border border-white/10 px-2.5 py-2 focus-within:border-blue-500/50 transition-colors">
                                                <span className="text-gray-500 text-[10px] font-mono mr-2 w-3">W</span>
                                                <ScrubInput
                                                    value={Math.round((effectiveElement || selectedElement).width)}
                                                    onChange={v => {
                                                        const el = effectiveElement || selectedElement;
                                                        const w = v;
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
                                                <ScrubInput
                                                    value={Math.round((effectiveElement || selectedElement).height)}
                                                    onChange={v => {
                                                        const el = effectiveElement || selectedElement;
                                                        const h = v;
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
                                                <ScrubInput value={(effectiveElement || selectedElement).rotation || 0} onChange={v => updateSelected({ rotation: v })} className="bg-transparent text-white text-[11px] w-full focus:outline-none font-mono" />
                                            </div>
                                            <div className="flex items-center bg-[#111] rounded-md border border-white/10 px-2.5 py-2 focus-within:border-blue-500/50 transition-colors">
                                                <Layers className="text-gray-500 w-3 h-3 mr-2" />
                                                <span className="text-[10px] text-gray-500 font-mono mr-2">Z</span>
                                                <ScrubInput value={(effectiveElement || selectedElement).zIndex} onChange={v => updateSelected({ zIndex: v })} className="bg-transparent text-white text-[11px] w-full focus:outline-none font-mono" />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Playback */}
                                    {(selectedElement.collectionType === 'video' || selectedElement.collectionType === 'audio') && (() => {
                                        const el = effectiveElement || selectedElement;
                                        const spd = getElementPlaybackSpeed(el);
                                        return (
                                            <div className="space-y-3 pt-4 border-t border-white/5">
                                                <h4 className="text-[9px] font-bold uppercase tracking-widest text-gray-500 font-mono">Playback</h4>
                                                <div className="space-y-1.5">
                                                    <div className="flex justify-between text-xs text-gray-400">
                                                        <span>Speed</span>
                                                        <span className="text-white font-mono font-medium">{spd.toFixed(2)}x</span>
                                                    </div>
                                                    <input
                                                        type="range" min="0.25" max="4" step="0.05"
                                                        value={spd}
                                                        onChange={e => updateSelected({ speed: Number(e.target.value) })}
                                                        className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-blue-500"
                                                    />
                                                    <div className="flex justify-between text-[9px] text-gray-600 font-mono">
                                                        <span>0.25x</span><span>1x</span><span>2x</span><span>4x</span>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })()}

                                    {/* Duration Linking */}
                                        <div className="space-y-3 pt-4 border-t border-white/5">
                                            <div className="flex items-center justify-between">
                                                <h4 className="text-[9px] font-bold uppercase tracking-widest text-gray-500 font-mono">Match Duration</h4>
                                                <div className="text-[8px] text-gray-600 font-mono">Cumulative Sum</div>
                                            </div>
                                            <div className="flex flex-col gap-2">
                                                {/* Current linked items */}
                                                {((effectiveElement || selectedElement).matchDurationWithIds || []).map(linkedId => {
                                                    const linkedEl = elements.find(e => e.elementId === linkedId);
                                                    if (!linkedEl) return null;
                                                    const offset = (effectiveElement || selectedElement).matchDurationOffsets?.[linkedId] || 0;
                                                    return (
                                                        <div key={linkedId} className="flex items-center justify-between bg-[#1a1a1a] rounded-md border border-white/10 px-2 py-1.5 gap-2">
                                                            <div className="flex items-center gap-1.5 overflow-hidden flex-1">
                                                                <Link2 className="w-3 h-3 text-cyan-500 shrink-0" />
                                                                <span className="text-[10px] text-gray-300 font-mono truncate">{linkedEl.title}</span>
                                                            </div>
                                                            <div className="flex items-center gap-1 shrink-0">
                                                                <span className="text-[9px] text-gray-500 font-mono">offset</span>
                                                                <input
                                                                    type="number"
                                                                    step="0.1"
                                                                    className="w-12 bg-[#111] text-[10px] font-mono text-gray-300 px-1 py-0.5 rounded border border-white/10 focus:outline-none focus:border-blue-500 text-center"
                                                                    value={offset}
                                                                    onChange={e => {
                                                                        const el = effectiveElement || selectedElement;
                                                                        const currentOffsets = el.matchDurationOffsets || {};
                                                                        updateSelected({ matchDurationOffsets: { ...currentOffsets, [linkedId]: parseFloat(e.target.value) || 0 } });
                                                                    }}
                                                                />
                                                                <span className="text-[9px] text-gray-500 font-mono">s</span>
                                                            </div>
                                                            <button 
                                                                onClick={() => {
                                                                    const el = effectiveElement || selectedElement;
                                                                    const currentIds = el.matchDurationWithIds || [];
                                                                    const currentOffsets = { ...(el.matchDurationOffsets || {}) };
                                                                    delete currentOffsets[linkedId];
                                                                    updateSelected({ 
                                                                        matchDurationWithIds: currentIds.filter(id => id !== linkedId),
                                                                        matchDurationOffsets: currentOffsets
                                                                    });
                                                                }}
                                                                className="p-1 hover:bg-white/10 rounded-md text-gray-500 hover:text-red-400 transition-colors shrink-0"
                                                            >
                                                                <X className="w-3 h-3" />
                                                            </button>
                                                        </div>
                                                    );
                                                })}
                                                
                                                {/* Legacy single link fallback rendering */}
                                                {(effectiveElement || selectedElement).matchDurationWithId && !((effectiveElement || selectedElement).matchDurationWithIds?.length) && (() => {
                                                    const linkedId = (effectiveElement || selectedElement).matchDurationWithId!;
                                                    const linkedEl = elements.find(e => e.elementId === linkedId);
                                                    if (!linkedEl) return null;
                                                    const offset = (effectiveElement || selectedElement).matchDurationOffsets?.[linkedId] || 0;
                                                    return (
                                                        <div key={linkedId} className="flex items-center justify-between bg-[#1a1a1a] rounded-md border border-white/10 px-2 py-1.5 gap-2">
                                                            <div className="flex items-center gap-1.5 overflow-hidden flex-1">
                                                                <Link2 className="w-3 h-3 text-cyan-500 shrink-0" />
                                                                <span className="text-[10px] text-gray-300 font-mono truncate">{linkedEl.title}</span>
                                                            </div>
                                                            <div className="flex items-center gap-1 shrink-0">
                                                                <span className="text-[9px] text-gray-500 font-mono">offset</span>
                                                                <input
                                                                    type="number"
                                                                    step="0.1"
                                                                    className="w-12 bg-[#111] text-[10px] font-mono text-gray-300 px-1 py-0.5 rounded border border-white/10 focus:outline-none focus:border-blue-500 text-center"
                                                                    value={offset}
                                                                    onChange={e => {
                                                                        const el = effectiveElement || selectedElement;
                                                                        const currentOffsets = el.matchDurationOffsets || {};
                                                                        updateSelected({ matchDurationOffsets: { ...currentOffsets, [linkedId]: parseFloat(e.target.value) || 0 } });
                                                                    }}
                                                                />
                                                                <span className="text-[9px] text-gray-500 font-mono">s</span>
                                                            </div>
                                                            <button 
                                                                onClick={() => {
                                                                    const el = effectiveElement || selectedElement;
                                                                    const currentOffsets = { ...(el.matchDurationOffsets || {}) };
                                                                    delete currentOffsets[linkedId];
                                                                    updateSelected({ matchDurationWithId: undefined, matchDurationOffsets: currentOffsets });
                                                                }}
                                                                className="p-1 hover:bg-white/10 rounded-md text-gray-500 hover:text-red-400 transition-colors shrink-0"
                                                            >
                                                                <X className="w-3 h-3" />
                                                            </button>
                                                        </div>
                                                    );
                                                })()}

                                                {/* Add new link */}
                                                <div className="flex items-center bg-[#111] rounded-md border border-white/10 px-2.5 py-1.5 focus-within:border-blue-500/50 transition-colors">
                                                    <Plus className="text-gray-500 w-3 h-3 mr-2 shrink-0" />
                                                    <select
                                                        value=""
                                                        onChange={e => {
                                                            if (!e.target.value) return;
                                                            const el = effectiveElement || selectedElement;
                                                            
                                                            // Migrate legacy single ID if it exists
                                                            let currentIds = el.matchDurationWithIds || [];
                                                            if (el.matchDurationWithId && !currentIds.length) {
                                                                currentIds = [el.matchDurationWithId];
                                                                updateSelected({ matchDurationWithId: undefined }); // Clear legacy
                                                            }
                                                            
                                                            if (!currentIds.includes(e.target.value)) {
                                                                updateSelected({ matchDurationWithIds: [...currentIds, e.target.value] });
                                                            }
                                                        }}
                                                        className="bg-transparent text-gray-400 text-[10px] w-full focus:outline-none font-mono"
                                                    >
                                                        <option value="" className="bg-[#111]">Add element to match...</option>
                                                        {elements
                                                            .filter(el => {
                                                                if (el.elementId === selectedElement.elementId) return false;
                                                                const isLegacyLinked = (effectiveElement || selectedElement).matchDurationWithId === el.elementId;
                                                                const isLinked = (effectiveElement || selectedElement).matchDurationWithIds?.includes(el.elementId);
                                                                return !isLegacyLinked && !isLinked;
                                                            })
                                                            .map(el => (
                                                                <option key={el.elementId} value={el.elementId} className="bg-[#111]">
                                                                    {el.title}
                                                                </option>
                                                            ))
                                                        }
                                                    </select>
                                                </div>
                                            </div>
                                        </div>

                                    {/* Text Content — only for text elements when a specific variant is selected */}
                                    {selectedElement.collectionType === 'text' && selectedVariantMode !== 'all' && (() => {
                                        const col = collections.find(c => c.id === selectedResolvedCollectionId);
                                        const variant = col?.items.find(v => v.id === selectedVariantMode);
                                        if (!variant || !col) return null;
                                        return (
                                            <div className="space-y-3 pt-4 border-t border-white/5">
                                                <h4 className="text-[9px] font-bold uppercase tracking-widest text-gray-500 font-mono">Content</h4>
	                                                <textarea
	                                                    value={variant.value}
	                                                    onChange={e => {
	                                                        replaceCollections(collectionsRef.current.map(c =>
	                                                            c.id === col.id ? { ...c, items: c.items.map(v => v.id === variant.id ? { ...v, value: e.target.value } : v) } : c
	                                                        ));
	                                                    }}
	                                                    onBlur={e => {
	                                                        const nextCollections = collections.map(c =>
	                                                            c.id === col.id ? { ...c, items: c.items.map(v => v.id === variant.id ? { ...v, value: e.currentTarget.value } : v) } : c
	                                                        );
	                                                        void persistCollections(nextCollections);
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
                                            <div className="grid grid-cols-2 gap-2">
                                                <button
                                                    onClick={() => { void copyAllProperties('textStyle'); }}
                                                    className="text-[9px] font-mono py-1.5 rounded border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-200 transition-colors"
                                                >
                                                    Copy Text Style
                                                </button>
                                                <button
                                                    onClick={() => { void pasteAllProperties('textStyle'); }}
                                                    className="text-[9px] font-mono py-1.5 rounded border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-200 transition-colors"
                                                >
                                                    Paste Text Style
                                                </button>
                                            </div>
                                            {/* Font Size & Line Height */}
                                            <div className="grid grid-cols-2 gap-2">
                                                <div className="flex items-center bg-[#111] rounded-md border border-white/10 px-2.5 py-2 focus-within:border-blue-500/50 transition-colors">
                                                    <span className="text-[10px] text-gray-500 font-mono mr-2">Sz</span>
                                                    <ScrubInput value={(effectiveElement || selectedElement).fontSize || 16} min={8} max={200} onChange={v => updateSelected({ fontSize: v })} className="bg-transparent text-white text-[11px] w-full focus:outline-none font-mono" />
                                                </div>
                                                <div className="flex items-center bg-[#111] rounded-md border border-white/10 px-2.5 py-2 focus-within:border-blue-500/50 transition-colors">
                                                    <span className="text-[10px] text-gray-500 font-mono mr-2">Lh</span>
                                                    <ScrubInput step={0.1} value={(effectiveElement || selectedElement).lineHeight || 1.4} min={0.5} max={5} onChange={v => updateSelected({ lineHeight: v })} className="bg-transparent text-white text-[11px] w-full focus:outline-none font-mono" />
                                                </div>
                                            </div>
                                            {/* Letter Spacing */}
                                            <div className="flex items-center bg-[#111] rounded-md border border-white/10 px-2.5 py-2 focus-within:border-blue-500/50 transition-colors">
                                                <span className="text-[10px] text-gray-500 font-mono mr-2 whitespace-nowrap">Tracking</span>
                                                <ScrubInput step={0.5} value={(effectiveElement || selectedElement).letterSpacing || 0} min={-5} max={20} onChange={v => updateSelected({ letterSpacing: v })} className="bg-transparent text-white text-[11px] w-full focus:outline-none font-mono" />
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

                                            {/* Text Stroke */}
                                            <div className="space-y-2">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-[10px] text-gray-400 font-mono">Stroke</span>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[9px] text-gray-500 font-mono">{(effectiveElement || selectedElement).textStrokeWidth ?? 0}px</span>
                                                        {/* Color swatch */}
                                                        <label className="relative w-5 h-5 rounded cursor-pointer border border-white/20 overflow-hidden" title="Stroke color">
                                                            <span className="absolute inset-0" style={{ background: (effectiveElement || selectedElement).textStrokeColor || '#000000' }} />
                                                            <input
                                                                type="color"
                                                                value={(effectiveElement || selectedElement).textStrokeColor || '#000000'}
                                                                onChange={e => updateSelected({ textStrokeColor: e.target.value })}
                                                                className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                                                            />
                                                        </label>
                                                    </div>
                                                </div>
                                                <input
                                                    type="range" min="0" max="20" step="0.5"
                                                    value={(effectiveElement || selectedElement).textStrokeWidth ?? 0}
                                                    onChange={e => updateSelected({ textStrokeWidth: Number(e.target.value) })}
                                                    className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-orange-400"
                                                />
                                            </div>
                                        </div>
                                    )}

                                    {/* AUDIO Config */}
                                    {(selectedElement.collectionType === 'video' || selectedElement.collectionType === 'audio') && (() => {
                                        const el = effectiveElement || selectedElement;
                                        const vol = el.volume ?? 1;
                                        const spd = getElementPlaybackSpeed(el);
                                        const fadeIn = el.audioFadeIn ?? 0;
                                        const fadeOut = el.audioFadeOut ?? 0;
                                        return (
                                            <div className="space-y-4 pt-4 border-t border-white/5">
                                                <h4 className="text-[9px] font-bold uppercase tracking-widest text-gray-500 font-mono">Audio</h4>

                                                {/* Volume */}
                                                <div className="space-y-1.5">
                                                    <div className="flex justify-between text-xs text-gray-400">
                                                        <span>Volume</span>
                                                        <span className="text-white font-mono font-medium">{Math.round(vol * 100)}%</span>
                                                    </div>
                                                    <input
                                                        type="range" min="0" max="1" step="0.05"
                                                        value={vol}
                                                        onChange={e => updateSelected({ volume: Number(e.target.value) })}
                                                        className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                                                    />
                                                </div>

                                                {/* Speed */}
                                                <div className="hidden">
                                                    <div className="flex justify-between text-xs text-gray-400">
                                                        <span>Speed</span>
                                                        <span className="text-white font-mono font-medium">{spd.toFixed(2)}×</span>
                                                    </div>
                                                    <input
                                                        type="range" min="0.25" max="4" step="0.05"
                                                        value={spd}
                                                        onChange={e => updateSelected({ speed: Number(e.target.value) })}
                                                        className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-blue-500"
                                                    />
                                                    <div className="flex justify-between text-[9px] text-gray-600 font-mono">
                                                        <span>0.25×</span><span>1×</span><span>2×</span><span>4×</span>
                                                    </div>
                                                </div>

                                                {/* Fade In / Fade Out */}
                                                <div className="grid grid-cols-2 gap-2">
                                                    <div className="space-y-1">
                                                        <div className="flex justify-between text-[10px] text-gray-400">
                                                            <span>Fade In</span>
                                                            <span className="text-white font-mono">{fadeIn.toFixed(1)}s</span>
                                                        </div>
                                                        <input
                                                            type="range" min="0" max={Math.max(0.1, (el.duration ?? 5) / 2)} step="0.1"
                                                            value={fadeIn}
                                                            onChange={e => updateSelected({ audioFadeIn: Number(e.target.value) })}
                                                            className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-violet-500"
                                                        />
                                                    </div>
                                                    <div className="space-y-1">
                                                        <div className="flex justify-between text-[10px] text-gray-400">
                                                            <span>Fade Out</span>
                                                            <span className="text-white font-mono">{fadeOut.toFixed(1)}s</span>
                                                        </div>
                                                        <input
                                                            type="range" min="0" max={Math.max(0.1, (el.duration ?? 5) / 2)} step="0.1"
                                                            value={fadeOut}
                                                            onChange={e => updateSelected({ audioFadeOut: Number(e.target.value) })}
                                                            className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-violet-500"
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })()}

                                    {/* Media Trim Config */}
                                    {(selectedElement.collectionType === 'video' || selectedElement.collectionType === 'audio') && selectedVariantMode !== 'all' && (
                                        <div className="space-y-3 pt-4 border-t border-white/5">
                                            <h4 className="text-[9px] font-bold uppercase tracking-widest text-gray-500 font-mono">Media Trim</h4>

                                            {/* Start / End inputs — only meaningful in per-variant mode */}
                                            {selectedVariantMode !== 'all' && (
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
                                            )}

                                            {/* Randomize Window toggle — always on base element, not per-variant */}
                                            <button
                                                onClick={() => updateSelected({ randomizeWindow: !((selectedElement).randomizeWindow ?? false) })}
                                                className={cn(
                                                    "w-full flex items-center justify-between px-3 py-2 rounded-md border text-[10px] font-mono transition-all",
                                                    (selectedElement).randomizeWindow
                                                        ? "border-violet-500/50 bg-violet-500/10 text-violet-300"
                                                        : "border-white/10 bg-white/5 text-gray-400 hover:bg-white/10 hover:text-gray-300"
                                                )}
                                            >
                                                <span className="flex items-center gap-2">
                                                    <Shuffle className="w-3 h-3" />
                                                    Randomize Window
                                                </span>
                                                <span className={cn(
                                                    "text-[9px] px-1.5 py-0.5 rounded font-bold tracking-wide",
                                                    (selectedElement).randomizeWindow
                                                        ? "bg-violet-500/30 text-violet-300"
                                                        : "bg-white/10 text-gray-500"
                                                )}>
                                                    {(selectedElement).randomizeWindow ? 'ON' : 'OFF'}
                                                </span>
                                            </button>
                                            {(selectedElement).randomizeWindow && (
                                                <p className="text-[8px] font-mono text-violet-400/70 leading-relaxed">
                                                    Picks a random {((effectiveElement || selectedElement).duration ?? 5).toFixed(1)}s window from the full media on each shuffle. Start/End trim is ignored.
                                                </p>
                                            )}
                                            {!(selectedElement).randomizeWindow && selectedVariantMode !== 'all' && (
                                                <p className="text-[8px] font-mono text-gray-600">Trims source media. To move on timeline, drag element horizontally.</p>
                                            )}
                                        </div>
                                    )}

                                    {/* Position Anchor / Link */}
                                    <div className="space-y-3 pt-4 border-t border-white/5">
                                        <h4 className="text-[9px] font-bold uppercase tracking-widest text-gray-500 font-mono">Position Link</h4>
                                        <div className="flex flex-col gap-2">
                                            <div className="flex items-center bg-[#111] rounded-md border border-white/10 px-2.5 py-2 focus-within:border-blue-500/50 transition-colors">
                                                <Link2 className="text-gray-500 w-3 h-3 mr-2 shrink-0" />
                                                <select
                                                    value={(effectiveElement || selectedElement).syncWith?.targetId || ""}
                                                    onChange={e => {
                                                        const targetId = e.target.value;
                                                        if (!targetId) {
                                                            updateSelected({ syncWith: null });
                                                        } else {
                                                            updateSelected({ syncWith: { targetId, targetEdge: 'start', myEdge: 'start' } });
                                                        }
                                                    }}
                                                    className="bg-transparent text-white text-[11px] w-full focus:outline-none font-mono appearance-none"
                                                >
                                                    <option value="" className="bg-[#111] text-gray-500">None (Free Position)</option>
                                                    {elements
                                                        .filter(el => el.elementId !== selectedElement.elementId && el.trackId !== selectedElement.trackId)
                                                        .map(el => {
                                                            const resolvedColId = resolvedCollectionIdByElement[el.elementId] || el.collectionId;
                                                            const col = collections.find(c => c.id === resolvedColId);
                                                            const label = col?.title || "Element";
                                                            return (
                                                                <option key={el.elementId} value={el.elementId} className="bg-[#111]">
                                                                    Anchor to: {label} (Trk {tracks.findIndex(t => t.id === el.trackId) + 1})
                                                                </option>
                                                            );
                                                        })}
                                                </select>
                                            </div>
                                            {(effectiveElement || selectedElement).syncWith?.targetId && (
                                                <p className="text-[8px] font-mono text-cyan-500/70">
                                                    Start position is locked to the selected element.
                                                </p>
                                            )}
                                        </div>
                                    </div>



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
                                                                    <ScrubInput
                                                                        step="0.1" min={0} max={(effectiveElement || selectedElement).duration}
                                                                        value={anim.start}
                                                                        onChange={v => {
                                                                            const updated = ((effectiveElement || selectedElement).animations || []).map(a =>
                                                                                a.id === anim.id ? { ...a, start: Math.max(0, v) } : a
                                                                            );
                                                                            updateSelected({ animations: updated });
                                                                        }}
                                                                        className="w-full bg-black/30 rounded px-1.5 py-1 text-[9px] font-mono text-white focus:outline-none focus:ring-1 focus:ring-purple-400/40"
                                                                    />
                                                                </div>
                                                                {/* Duration */}
                                                                <div className="space-y-0.5">
                                                                    <span className="text-[7px] font-mono text-gray-600 uppercase">Duration</span>
                                                                    <ScrubInput
                                                                        step="0.1" min={0.1} max={(effectiveElement || selectedElement).duration}
                                                                        value={anim.duration}
                                                                        onChange={v => {
                                                                            const updated = ((effectiveElement || selectedElement).animations || []).map(a =>
                                                                                a.id === anim.id ? { ...a, duration: Math.max(0.1, v) } : a
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
                                                                        <ScrubInput
                                                                            step="0.1"
                                                                            value={anim.from ?? (anim.type === 'scaleOut' ? 1 : 0)}
                                                                            onChange={v => {
                                                                                const updated = ((effectiveElement || selectedElement).animations || []).map(a =>
                                                                                    a.id === anim.id ? { ...a, from: v } : a
                                                                                );
                                                                                updateSelected({ animations: updated });
                                                                            }}
                                                                            className="w-full bg-black/30 rounded px-1.5 py-1 text-[9px] font-mono text-white focus:outline-none focus:ring-1 focus:ring-purple-400/40"
                                                                        />
                                                                    </div>
                                                                    <div className="space-y-0.5">
                                                                        <span className="text-[7px] font-mono text-gray-600 uppercase">To</span>
                                                                        <ScrubInput
                                                                            step="0.1"
                                                                            value={anim.to ?? (anim.type === 'scaleOut' ? 0 : 1)}
                                                                            onChange={v => {
                                                                                const updated = ((effectiveElement || selectedElement).animations || []).map(a =>
                                                                                    a.id === anim.id ? { ...a, to: v } : a
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

                                    {/* All Properties */}
                                    <div className="space-y-3 pt-4 border-t border-white/5">
                                        <div className="flex items-center justify-between">
                                            <h4 className="text-[9px] font-bold uppercase tracking-widest text-gray-500 font-mono">
                                                All Properties
                                            </h4>
                                            <span className="text-[8px] font-mono text-gray-600">
                                                Paste matches by key + type
                                            </span>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <button
                                                onClick={() => { void copyAllProperties(); }}
                                                className="text-[9px] font-mono py-1.5 rounded border border-white/10 bg-white/5 hover:bg-white/10 text-gray-300 transition-colors"
                                            >
                                                Copy Properties
                                            </button>
                                            <button
                                                onClick={() => { void pasteAllProperties(); }}
                                                className="text-[9px] font-mono py-1.5 rounded border border-cyan-500/30 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-200 transition-colors"
                                            >
                                                Paste Properties
                                            </button>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <button
                                                onClick={() => { void copyAllProperties('transform'); }}
                                                className="text-[9px] font-mono py-1.5 rounded border border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 text-blue-200 transition-colors"
                                            >
                                                Copy Transform
                                            </button>
                                            <button
                                                onClick={() => { void pasteAllProperties('transform'); }}
                                                className="text-[9px] font-mono py-1.5 rounded border border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 text-blue-200 transition-colors"
                                            >
                                                Paste Transform
                                            </button>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <button
                                                onClick={() => { void copyAllProperties('animation'); }}
                                                className="text-[9px] font-mono py-1.5 rounded border border-purple-500/30 bg-purple-500/10 hover:bg-purple-500/20 text-purple-200 transition-colors"
                                            >
                                                Copy Animation
                                            </button>
                                            <button
                                                onClick={() => { void pasteAllProperties('animation'); }}
                                                className="text-[9px] font-mono py-1.5 rounded border border-purple-500/30 bg-purple-500/10 hover:bg-purple-500/20 text-purple-200 transition-colors"
                                            >
                                                Paste Animation
                                            </button>
                                        </div>
                                        <pre className="max-h-28 overflow-auto rounded-md border border-white/10 bg-black/30 p-2 text-[8px] leading-relaxed text-gray-500 font-mono custom-scrollbar">
                                            {JSON.stringify(extractCopyableProperties((effectiveElement || selectedElement)), null, 2)}
                                        </pre>
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
                        <CollectionCard collection={activeCollection} allCollections={collections} onAddItem={() => { }} onAddItems={() => { }} onAddNullVariant={() => { }} onDeleteItem={() => { }} onUpdateItem={() => { }} onDuplicateItem={() => { }} onCopyCollection={() => { }} onDeleteCollection={() => { }} onCreateSubComposition={() => { }} onSwitchVersion={() => { }} onCreateVersion={() => { }} onRenameVersion={() => { }} onDeleteVersion={() => { }} />
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
                                    <div>
                                        <label className="text-[10px] font-mono uppercase tracking-widest text-gray-500 mb-2 block">Output Folder</label>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={chooseExportOutputDirectory}
                                                className="shrink-0 py-2 px-3 rounded-lg text-[10px] font-mono border border-white/8 bg-white/5 text-gray-300 hover:text-white hover:bg-white/10 transition-colors flex items-center gap-2"
                                            >
                                                <FolderOpen className="w-3.5 h-3.5" />
                                                Choose
                                            </button>
                                            <div className="min-w-0 flex-1 rounded-lg border border-white/5 bg-black/20 px-3 py-2">
                                                <p className="text-[10px] font-mono text-gray-400 truncate">
                                                    {exportOutputDirName || "Browser downloads folder"}
                                                </p>
                                            </div>
                                            {exportOutputDir && (
                                                <button
                                                    onClick={() => { setExportOutputDir(null); setExportOutputDirName(null); }}
                                                    className="text-[10px] font-mono text-red-400 hover:text-red-300 px-2"
                                                >
                                                    Clear
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 bg-amber-500/8 border border-amber-500/15 rounded-lg px-3 py-2.5">
                                        <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                        <p className="text-[10px] text-amber-300/80 leading-relaxed">
                                            Export renders frame-by-frame in your browser. You can switch tabs while it runs; keep this window open.
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
                                                <button onClick={() => void persistRenderQueue([], "Composition bucket cleared")} className="text-red-400 hover:text-red-300">Clear</button>
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

