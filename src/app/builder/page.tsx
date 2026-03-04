"use client";

import dynamic from "next/dynamic";

const BuilderCanvas = dynamic(() => import("./BuilderCanvas"), {
    ssr: false,
    loading: () => (
        <div className="h-screen w-full bg-[#050505] flex items-center justify-center">
            <div className="text-gray-500 text-sm font-mono animate-pulse">Loading Builder...</div>
        </div>
    ),
});

export default function BuilderPage() {
    return <BuilderCanvas />;
}
