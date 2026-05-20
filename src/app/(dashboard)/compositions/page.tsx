"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Layers, Plus, Search, Trash2, Edit2, Clock, Copy, Clapperboard, ListPlus, Loader2, X, CheckCircle2, AlertCircle } from "lucide-react";
import { motion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { renderComposition, type RenderJob, type RenderProgress } from "@/app/builder/renderer";

type QueuedRenderJob = {
    id: string;
    name: string;
    job: RenderJob;
    usedVariantIds?: string[];
};

type CollectionsPayload =
    | unknown[]
    | {
        items?: unknown[];
        textGroups?: unknown[];
        renderQueue?: QueuedRenderJob[];
    };

type CompositionRecord = {
    id: string;
    title: string;
    angle?: string | null;
    duration: number;
    elements: string | unknown[];
    tracks?: string | unknown[];
    collections: string | CollectionsPayload;
    updatedAt: string;
};

type MasterQueueItem = QueuedRenderJob & {
    compositionId: string;
    compositionTitle: string;
};

function parseCollections(input: CompositionRecord["collections"]): CollectionsPayload {
    if (!input) return [];
    if (typeof input !== "string") return input;
    try {
        return JSON.parse(input) as CollectionsPayload;
    } catch {
        return [];
    }
}

function getRenderQueue(comp: CompositionRecord): QueuedRenderJob[] {
    const parsed = parseCollections(comp.collections);
    if (Array.isArray(parsed)) return [];
    return Array.isArray(parsed.renderQueue) ? parsed.renderQueue : [];
}

function buildCollectionsWithQueue(comp: CompositionRecord, renderQueue: QueuedRenderJob[]) {
    const parsed = parseCollections(comp.collections);
    if (Array.isArray(parsed)) {
        return { items: parsed, textGroups: [], renderQueue };
    }
    return {
        ...parsed,
        items: Array.isArray(parsed.items) ? parsed.items : [],
        textGroups: Array.isArray(parsed.textGroups) ? parsed.textGroups : [],
        renderQueue,
    };
}

export default function CompositionsPage() {
    const [compositions, setCompositions] = useState<CompositionRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [editName, setEditName] = useState("");
    const [masterProgress, setMasterProgress] = useState<RenderProgress | null>(null);
    const [isMasterRendering, setIsMasterRendering] = useState(false);
    const masterAbortRef = useRef<AbortController | null>(null);
    const router = useRouter();

    useEffect(() => {
        void fetchCompositions();
    }, []);

    const masterQueue = useMemo<MasterQueueItem[]>(() => {
        return compositions.flatMap(comp =>
            getRenderQueue(comp).map(item => ({
                ...item,
                compositionId: comp.id,
                compositionTitle: comp.title,
            }))
        );
    }, [compositions]);

    const fetchCompositions = async () => {
        try {
            const res = await fetch("/api/compositions");
            const data = await res.json();
            setCompositions(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error("Failed to fetch compositions", error);
        } finally {
            setLoading(false);
        }
    };

    const updateCompositionQueue = async (comp: CompositionRecord, nextQueue: QueuedRenderJob[]) => {
        const collections = buildCollectionsWithQueue(comp, nextQueue);
        const res = await fetch(`/api/compositions/${comp.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ collections }),
        });
        if (!res.ok) throw new Error(`Failed to update ${comp.title}`);
        setCompositions(prev => prev.map(item => (
            item.id === comp.id ? { ...item, collections } : item
        )));
    };

    const startMasterRender = async () => {
        if (masterQueue.length === 0 || isMasterRendering) return;

        const abortCtrl = new AbortController();
        masterAbortRef.current = abortCtrl;
        setIsMasterRendering(true);
        setMasterProgress({ phase: "preparing", progress: 0, message: "Starting master render..." });

        try {
            for (let i = 0; i < masterQueue.length; i++) {
                const item = masterQueue[i];
                if (abortCtrl.signal.aborted) break;

                const comp = compositions.find(c => c.id === item.compositionId);
                if (!comp) continue;

                const label = `${item.compositionTitle} - ${item.name}`;
                setMasterProgress({ phase: "preparing", progress: 0, message: `[${i + 1}/${masterQueue.length}] ${label}` });

                await renderComposition(
                    { ...item.job, outputName: item.job.outputName || label },
                    (progress) => {
                        setMasterProgress({
                            ...progress,
                            message: `[${i + 1}/${masterQueue.length}] ${label}: ${progress.message}`,
                        });
                    },
                    abortCtrl.signal
                );

                const nextQueue = getRenderQueue(comp).filter(queueItem => queueItem.id !== item.id);
                await updateCompositionQueue(comp, nextQueue);
            }

            if (!abortCtrl.signal.aborted) {
                setMasterProgress({ phase: "done", progress: 1, message: "Master render complete" });
            }
        } catch (error) {
            setMasterProgress({
                phase: "error",
                progress: 0,
                message: "Master render failed",
                error: error instanceof Error ? error.message : String(error),
            });
        } finally {
            setIsMasterRendering(false);
        }
    };

    const clearMasterQueue = async () => {
        if (masterQueue.length === 0) return;
        if (!confirm("Clear every queued sequence from all compositions?")) return;

        try {
            await Promise.all(
                compositions
                    .filter(comp => getRenderQueue(comp).length > 0)
                    .map(comp => updateCompositionQueue(comp, []))
            );
            setMasterProgress(null);
        } catch (error) {
            console.error("Failed to clear master queue", error);
            alert("Failed to clear one or more composition buckets.");
        }
    };

    const handleRename = async (id: string, e: React.MouseEvent | React.KeyboardEvent | React.FocusEvent) => {
        e.preventDefault();
        e.stopPropagation();

        if (!editName.trim()) {
            setRenamingId(null);
            return;
        }

        try {
            const res = await fetch(`/api/compositions/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title: editName.trim() }),
            });

            if (res.ok) {
                setCompositions(compositions.map(c => c.id === id ? { ...c, title: editName.trim() } : c));
            }
        } catch (error) {
            console.error("Failed to rename:", error);
        } finally {
            setRenamingId(null);
        }
    };

    const startRenaming = (comp: CompositionRecord, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setRenamingId(comp.id);
        setEditName(comp.title);
    };

    const handleCreateNew = async () => {
        try {
            const res = await fetch("/api/compositions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    title: "Untitled Composition",
                    duration: 120,
                    elements: [],
                    collections: { items: [], textGroups: [], renderQueue: [] },
                }),
            });
            const data = await res.json();
            if (data.id) {
                router.push(`/builder/${data.id}`);
            }
        } catch (error) {
            console.error("Failed to create new composition", error);
        }
    };

    const handleDelete = async (id: string, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (!confirm("Are you sure you want to delete this composition?")) return;

        try {
            await fetch(`/api/compositions/${id}`, { method: "DELETE" });
            void fetchCompositions();
        } catch (error) {
            console.error("Failed to delete", error);
        }
    };

    const handleDuplicate = async (comp: CompositionRecord, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        try {
            const elements = typeof comp.elements === "string" ? JSON.parse(comp.elements || "[]") : comp.elements;
            const tracks = typeof comp.tracks === "string" ? JSON.parse(comp.tracks || "[]") : comp.tracks;
            const collections = buildCollectionsWithQueue(comp, []);

            await fetch("/api/compositions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    title: `${comp.title} (Copy)`,
                    duration: comp.duration,
                    angle: comp.angle,
                    elements,
                    tracks,
                    collections,
                }),
            });
            void fetchCompositions();
        } catch (error) {
            console.error("Failed to duplicate composition", error);
        }
    };

    const queuedCompositionCount = compositions.filter(comp => getRenderQueue(comp).length > 0).length;

    return (
        <div className="flex-1 overflow-y-auto relative h-full">
            <header className="h-16 flex items-center justify-between px-8 border-b border-white/5 bg-[#050505]/50 backdrop-blur-sm sticky top-0 z-30">
                <div className="flex items-center gap-4 text-sm text-gray-500">
                    <span className="text-white font-medium flex items-center gap-2"><Layers className="w-4 h-4" /> Compositions</span>
                </div>

                <div className="flex items-center gap-4">
                    <div className="relative hidden md:block group">
                        <Search className="absolute left-3 top-2.5 text-gray-500 group-focus-within:text-white transition-colors w-4 h-4" />
                        <input
                            type="text"
                            placeholder="Search compositions..."
                            className="pl-10 pr-4 py-2 bg-white/5 border border-transparent focus:border-white/10 rounded-full text-sm w-64 focus:ring-0 focus:bg-white/10 text-white placeholder-gray-600 transition-all outline-none"
                        />
                    </div>
                    <button onClick={handleCreateNew} className="bg-blue-600 text-white px-4 py-2 rounded-full text-sm font-semibold flex items-center gap-2 hover:bg-blue-500 transition-all shadow-[0_0_15px_rgba(59,130,246,0.3)]">
                        <Plus className="w-5 h-5" />
                        New Composition
                    </button>
                </div>
            </header>

            <div className="p-8 space-y-8">
                <section className="border border-white/8 bg-white/[0.03] rounded-xl overflow-hidden">
                    <div className="p-5 flex flex-col lg:flex-row lg:items-center gap-5 justify-between">
                        <div className="flex items-center gap-4 min-w-0">
                            <div className="w-11 h-11 rounded-lg bg-white/5 border border-white/8 flex items-center justify-center shrink-0">
                                <Clapperboard className="w-5 h-5 text-white" />
                            </div>
                            <div className="min-w-0">
                                <h2 className="text-white text-sm font-semibold">Master Render Panel</h2>
                                <p className="text-[11px] text-gray-500 font-mono mt-1">
                                    {masterQueue.length} queued sequence(s) across {queuedCompositionCount} composition(s)
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                onClick={clearMasterQueue}
                                disabled={masterQueue.length === 0 || isMasterRendering}
                                className="px-3 py-2 rounded-lg bg-white/5 border border-white/8 text-xs font-semibold text-gray-400 hover:text-white hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            >
                                Clear All
                            </button>
                            {isMasterRendering ? (
                                <button
                                    onClick={() => masterAbortRef.current?.abort()}
                                    className="px-4 py-2 rounded-lg bg-red-600/20 border border-red-500/20 text-xs font-semibold text-red-300 hover:bg-red-600/30 transition-colors flex items-center gap-2"
                                >
                                    <X className="w-4 h-4" />
                                    Cancel
                                </button>
                            ) : (
                                <button
                                    onClick={startMasterRender}
                                    disabled={masterQueue.length === 0}
                                    className="px-4 py-2 rounded-lg bg-white text-black text-xs font-semibold hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                                >
                                    <Clapperboard className="w-4 h-4" />
                                    Render All
                                </button>
                            )}
                        </div>
                    </div>

                    {masterProgress && (
                        <div className="px-5 pb-5">
                            <div className="bg-black/30 border border-white/8 rounded-lg p-3">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                                        {masterProgress.phase === "done" ? (
                                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                                        ) : masterProgress.phase === "error" ? (
                                            <AlertCircle className="w-4 h-4 text-red-400" />
                                        ) : (
                                            <Loader2 className="w-4 h-4 text-white animate-spin" />
                                        )}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-[11px] text-gray-300 font-mono truncate">{masterProgress.message}</p>
                                        {masterProgress.error && <p className="text-[10px] text-red-400 font-mono mt-1 break-all">{masterProgress.error}</p>}
                                    </div>
                                    <span className="text-[10px] text-gray-500 font-mono">{Math.round(masterProgress.progress * 100)}%</span>
                                </div>
                                <div className="w-full bg-white/5 rounded-full h-1.5 overflow-hidden mt-3">
                                    <motion.div
                                        className={masterProgress.phase === "error" ? "h-full bg-red-500" : masterProgress.phase === "done" ? "h-full bg-emerald-500" : "h-full bg-white"}
                                        animate={{ width: `${Math.round(masterProgress.progress * 100)}%` }}
                                        transition={{ ease: "linear", duration: 0.2 }}
                                    />
                                </div>
                            </div>
                        </div>
                    )}
                </section>

                {loading ? (
                    <div className="flex justify-center py-20">
                        <div className="w-8 h-8 rounded-full border-t-2 border-l-2 border-white animate-spin"></div>
                    </div>
                ) : compositions.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-32 text-center border border-dashed border-white/10 rounded-2xl bg-white/[0.02]">
                        <div className="w-16 h-16 bg-white/5 flex items-center justify-center rounded-full mb-4">
                            <Layers className="w-8 h-8 text-gray-500" />
                        </div>
                        <h2 className="text-xl font-medium text-white mb-2">No compositions yet</h2>
                        <p className="text-gray-400 max-w-sm mb-6">Create your first parameterized composition template to rapidly generate video variations.</p>
                        <button onClick={handleCreateNew} className="bg-white text-black px-5 py-2.5 rounded-full font-medium hover:bg-gray-200 transition-colors">
                            Create First Composition
                        </button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {compositions.map((comp) => {
                            const queueCount = getRenderQueue(comp).length;
                            return (
                                <Link key={comp.id} href={`/builder/${comp.id}`}>
                                    <motion.div
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className="glass-panel p-5 rounded-2xl flex flex-col justify-between h-52 group border border-white/5 hover:border-white/20 transition-all cursor-pointer relative overflow-hidden"
                                    >
                                        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-600 to-purple-500 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                        <div className="flex justify-between items-start">
                                            <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center group-hover:scale-110 transition-transform shadow-lg border border-white/5">
                                                <Layers className="w-5 h-5 text-gray-300" />
                                            </div>
                                            <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button onClick={(e) => handleDuplicate(comp, e)} className="p-2 bg-white/5 hover:bg-white/10 rounded text-gray-400 hover:text-white transition-colors" title="Duplicate">
                                                    <Copy className="w-4 h-4" />
                                                </button>
                                                <button onClick={(e) => startRenaming(comp, e)} className="p-2 bg-white/5 hover:bg-white/10 rounded text-gray-400 hover:text-white transition-colors" title="Rename">
                                                    <Edit2 className="w-4 h-4" />
                                                </button>
                                                <button onClick={(e) => handleDelete(comp.id, e)} className="p-2 bg-red-500/10 hover:bg-red-500/20 rounded text-red-500 hover:text-red-400 transition-colors" title="Delete">
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>

                                        <div>
                                            {queueCount > 0 && (
                                                <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-blue-500/10 border border-blue-500/20 text-blue-300 text-[10px] font-mono mb-3">
                                                    <ListPlus className="w-3.5 h-3.5" />
                                                    {queueCount} queued
                                                </div>
                                            )}
                                            {renamingId === comp.id ? (
                                                <input
                                                    autoFocus
                                                    type="text"
                                                    value={editName}
                                                    onChange={(e) => setEditName(e.target.value)}
                                                    onBlur={(e) => void handleRename(comp.id, e)}
                                                    onKeyDown={(e) => e.key === "Enter" && void handleRename(comp.id, e)}
                                                    onClick={(e) => e.stopPropagation()}
                                                    className="w-full bg-white/10 border border-white/20 rounded px-2 py-1 text-white text-lg font-medium outline-none focus:border-blue-500 mb-1"
                                                />
                                            ) : (
                                                <h3 className="text-lg font-medium text-white mb-1 group-hover:text-blue-400 transition-colors">{comp.title}</h3>
                                            )}
                                            <div className="flex items-center gap-4 text-xs font-mono text-gray-500">
                                                <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> {comp.duration}s</span>
                                                <span>{new Date(comp.updatedAt).toLocaleDateString()}</span>
                                            </div>
                                        </div>
                                    </motion.div>
                                </Link>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
