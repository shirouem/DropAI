"use client";

import dynamic from "next/dynamic";
import { useParams } from "next/navigation";

// Dynamically import the builder canvas with SSR disabled
const BuilderCanvas = dynamic(() => import("../BuilderCanvas"), {
    ssr: false,
    loading: () => (
        <div className="h-screen w-full bg-[#050505] flex items-center justify-center">
            <div className="text-gray-500 text-sm font-mono animate-pulse">Loading Builder...</div>
        </div>
    ),
});

import { use } from "react";

export default function BuilderPage({ params }: { params: Promise<{ id: string }> }) {
    const resolvedParams = use(params);
    return <BuilderCanvas compositionId={resolvedParams.id} />;
}
