"use client";

import { useState, useEffect } from "react";
import { Layers, Plus, Search, Trash2, Edit2, Clock } from "lucide-react";
import { motion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function CompositionsPage() {
    const [compositions, setCompositions] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const router = useRouter();

    useEffect(() => {
        fetchCompositions();
    }, []);

    const fetchCompositions = async () => {
        try {
            const res = await fetch("/api/compositions");
            const data = await res.json();
            setCompositions(data);
        } catch (error) {
            console.error("Failed to fetch compositions", error);
        } finally {
            setLoading(false);
        }
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
                    collections: []
                })
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
            fetchCompositions();
        } catch (error) {
            console.error("Failed to delete", error);
        }
    };

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

            <div className="p-8">
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
                        {compositions.map((comp) => (
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
                                            <button className="p-2 bg-white/5 hover:bg-white/10 rounded text-gray-400 hover:text-white transition-colors">
                                                <Edit2 className="w-4 h-4" />
                                            </button>
                                            <button onClick={(e) => handleDelete(comp.id, e)} className="p-2 bg-red-500/10 hover:bg-red-500/20 rounded text-red-500 hover:text-red-400 transition-colors">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>

                                    <div>
                                        <h3 className="text-lg font-medium text-white mb-1 group-hover:text-blue-400 transition-colors">{comp.title}</h3>
                                        <div className="flex items-center gap-4 text-xs font-mono text-gray-500">
                                            <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> {comp.duration}s</span>
                                            <span>{new Date(comp.updatedAt).toLocaleDateString()}</span>
                                        </div>
                                    </div>
                                </motion.div>
                            </Link>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
