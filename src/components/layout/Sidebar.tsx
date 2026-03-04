"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    Infinity,
    LayoutDashboard,
    Megaphone,
    Library,
    BarChart2,
    Network,
    ChevronDown,
    Layers
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
    { name: "Dashboard", href: "/", icon: LayoutDashboard },
    { name: "Compositions", href: "/compositions", icon: Layers },
    { name: "Campaigns", href: "/campaigns", icon: Megaphone },
    { name: "Asset Library", href: "/assets", icon: Library },
    { name: "Analytics", href: "/analytics", icon: BarChart2 },
    { name: "Integrations", href: "/integrations", icon: Network },
];

export function Sidebar() {
    const pathname = usePathname();

    return (
        <aside className="w-20 lg:w-64 flex-shrink-0 z-20 flex flex-col sidebar-glass transition-all duration-300">
            <div className="h-16 flex items-center justify-center lg:justify-start lg:px-6 border-b border-white/5">
                <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center shadow-[0_0_15px_rgba(255,255,255,0.3)]">
                    <Infinity className="w-5 h-5 text-black" strokeWidth={2.5} />
                </div>
                <span className="hidden lg:block ml-3 font-bold text-lg tracking-tight text-white">DropAI</span>
            </div>

            <nav className="flex-1 overflow-y-auto py-6 flex flex-col gap-2 px-3">
                {navItems.map((item) => {
                    const isActive = pathname === item.href;
                    const Icon = item.icon;

                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={cn(
                                "flex items-center p-3 rounded-lg group transition-all",
                                isActive
                                    ? "bg-white/10 text-white border border-white/5"
                                    : "hover:bg-white/5 text-gray-400 hover:text-white"
                            )}
                        >
                            <Icon className="w-5 h-5" />
                            <span className="hidden lg:block ml-3 font-medium">{item.name}</span>
                        </Link>
                    );
                })}
            </nav>

            <div className="p-4 border-t border-white/5">
                <button className="flex items-center w-full p-2 rounded-lg hover:bg-white/5 transition-colors group">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-gray-700 to-gray-600 p-[1px] shrink-0">
                        <img
                            alt="User"
                            className="w-full h-full rounded-full object-cover"
                            src="https://lh3.googleusercontent.com/aida-public/AB6AXuB3cuKGSuV6tMJ6FmKw6wivZIoy-oc9rRpG-rjvERD-PUcuhX5ZOy2-BiUHcjm27GPWc-8hRGSjak8JRwdlYA8ZFdNf0CuPxmwOPkr4ILFpTJToAXq53j2E33n4oLFRFgYHiZHlnIKHVDTQk2Znp39AfTO2NXtPU3nXyHVDr5tbLma0MXm02GTotjIYv6LTS9ZPFJFfUtr7DB-ye-CXn6fQeeih2RUMZsi0KAiW0niiB-wftZA0Po9Vs12QWoDiwxHegLYlgt6h0ZHl"
                        />
                    </div>
                    <div className="hidden lg:block ml-3 text-left">
                        <p className="text-sm font-medium text-white group-hover:text-white transition-colors">Alex R.</p>
                        <p className="text-xs text-gray-500">Pro Plan</p>
                    </div>
                    <ChevronDown className="w-4 h-4 ml-auto text-gray-500 hidden lg:block group-hover:text-white transition-colors" />
                </button>
            </div>
        </aside>
    );
}
