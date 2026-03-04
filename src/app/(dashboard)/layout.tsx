import { Sidebar } from "@/components/layout/Sidebar";

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <>
            <Sidebar />
            <main className="flex-1 flex flex-col h-full relative z-10 overflow-hidden bg-gradient-to-br from-[#050505] via-[#0a0a0a] to-[#0f0f0f]">
                {children}
            </main>
        </>
    );
}
