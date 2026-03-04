"use client";

import { motion, Variants } from "framer-motion";
import {
  Search,
  Bell,
  Plus,
  ChevronRight,
  TrendingUp,
  DollarSign,
  Film,
  ThumbsUp,
  LayoutGrid,
  List,
  ArrowRight,
  RefreshCw,
  Image as ImageIcon
} from "lucide-react";

const stats = [
  { label: "Total Revenue", value: "$12,405", icon: DollarSign, trend: "14%", up: true },
  { label: "Generated Assets", value: "842", icon: Film, limit: "1000 limit" },
  { label: "Avg. Engagement", value: "4.2%", icon: ThumbsUp, trend: "0.8%", up: true },
];

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
};

const itemVariants: Variants = {
  hidden: { y: 20, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: { type: "spring", stiffness: 300, damping: 24 }
  }
};

export default function DashboardPage() {
  return (
    <div className="flex-1 overflow-y-auto relative h-full">
      {/* Header */}
      <header className="h-16 flex items-center justify-between px-8 border-b border-white/5 bg-[#050505]/50 backdrop-blur-sm sticky top-0 z-30">
        <div className="flex items-center gap-4 text-sm text-gray-500">
          <span>Workspace</span>
          <ChevronRight className="w-3 h-3" />
          <span className="text-white font-medium">Overview</span>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative hidden md:block group">
            <Search className="absolute left-3 top-2.5 text-gray-500 group-focus-within:text-white transition-colors w-4 h-4" />
            <input
              type="text"
              placeholder="Search assets..."
              className="pl-10 pr-4 py-2 bg-white/5 border border-transparent focus:border-white/10 rounded-full text-sm w-64 focus:ring-0 focus:bg-white/10 text-white placeholder-gray-600 transition-all outline-none"
            />
          </div>
          <button className="p-2 rounded-full hover:bg-white/10 relative text-gray-400 hover:text-white transition-colors">
            <Bell className="w-5 h-5" />
            <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border border-[#050505]"></span>
          </button>
          <button className="bg-white text-black px-4 py-2 rounded-full text-sm font-semibold flex items-center gap-2 hover:bg-gray-200 transition-all shadow-[0_0_15px_rgba(255,255,255,0.1)]">
            <Plus className="w-5 h-5" />
            Create Campaign
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="p-8 pb-16 relative">
        <div className="mb-10 relative">
          {/* Decorative SVG */}
          <svg className="absolute top-10 left-[18%] w-[60%] h-32 stroke-white/10 fill-none pointer-events-none hidden xl:block" strokeWidth="1">
            <motion.path
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1.5, ease: "easeOut" }}
              d="M0,50 C100,50 100,10 200,10"
            />
            <motion.path
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1.5, ease: "easeOut", delay: 0.2 }}
              d="M0,50 C100,50 100,90 200,90"
            />
            <circle cx="0" cy="50" r="3" className="fill-white" />
            <circle cx="200" cy="10" r="2" className="fill-gray-600" />
            <circle cx="200" cy="90" r="2" className="fill-gray-600" />
          </svg>

          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-end justify-between mb-8 relative z-10"
          >
            <div>
              <h1 className="text-3xl font-light tracking-tight text-white mb-2">Welcome back, Alex</h1>
              <p className="text-gray-400 font-light">
                Your content farm is running at <span className="text-white font-mono border-b border-green-500/50">98% efficiency</span>.
              </p>
            </div>
            <div className="flex gap-2">
              <span className="px-3 py-1.5 rounded-full border border-white/10 bg-white/5 text-xs font-mono text-gray-300 flex items-center gap-2 backdrop-blur-md">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]"></span>
                System Operational
              </span>
            </div>
          </motion.div>

          {/* Stats Cards */}
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="grid grid-cols-1 md:grid-cols-3 gap-6 relative z-10"
          >
            {stats.map((stat, i) => (
              <motion.div key={i} variants={itemVariants} className="glass-panel p-6 rounded-2xl flex flex-col justify-between h-36 hover:bg-white/[0.04] transition-all duration-300 group">
                <div className="flex justify-between items-start">
                  <span className="text-gray-400 text-sm font-medium uppercase tracking-wider">{stat.label}</span>
                  <div className="p-2 rounded-lg bg-white/5 text-white/70 group-hover:text-white transition-colors">
                    <stat.icon className="w-5 h-5" />
                  </div>
                </div>
                <div className="flex items-end justify-between gap-3">
                  <span className="text-4xl font-light text-white tracking-tight">{stat.value}</span>
                  {stat.trend ? (
                    <span className="text-green-400 text-xs flex items-center mb-1 bg-green-500/10 px-2 py-1 rounded border border-green-500/20">
                      <TrendingUp className="w-3 h-3 mr-1" /> {stat.trend}
                    </span>
                  ) : (
                    <span className="text-gray-500 text-xs mb-1 font-mono">/ {stat.limit}</span>
                  )}
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>

        {/* Campaigns Header */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="mb-6 flex items-center justify-between"
        >
          <h2 className="text-xl font-light tracking-wide text-white">Active Campaigns</h2>
          <div className="flex gap-2 p-1 rounded-lg bg-white/5 border border-white/5">
            <button className="p-1.5 rounded bg-white/10 text-white shadow-sm">
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button className="p-1.5 rounded hover:bg-white/5 text-gray-500 hover:text-white transition-colors">
              <List className="w-4 h-4" />
            </button>
          </div>
        </motion.div>

        {/* Campaigns Grid */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6"
        >
          {/* Campaign 1: Active */}
          <motion.div variants={itemVariants} className="glass-panel rounded-2xl overflow-hidden group border-t border-t-white/10 hover:border-t-white/40 transition-all duration-500">
            <div className="relative h-52 overflow-hidden">
              <img
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuAHRR_8UTyloHJBpUES0a-d6JSnIJXrxUCu8IlrhqNhyBe5IbSXDmUyM2tFRW9kfF058G1I6EjNJEglDV9Y-Soe7jCSkcwsTy4tZ3LOrLw9ETssf_6damTkgqZfMPTf0PGj9RsyhvfimZZGtzUJVtGJ8uynjzPhn1hs2gM6Q6VQXCFsZrxgyZ2-eIdLH_w6i9eSkOoF52-v179avktBpmQsEWbX-zYx-rbER3qFsDsjUM00EvHQrHjKGQOlQlyuzttZIXUXWXjg6Zbm"
                alt="Posture Corrector"
                className="w-full h-full object-cover opacity-60 grayscale group-hover:grayscale-0 group-hover:opacity-100 group-hover:scale-105 transition-all duration-700"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a]/50 to-transparent"></div>

              <div className="absolute top-4 right-4 bg-black/60 backdrop-blur-md border border-white/10 text-green-400 text-[10px] px-2 py-1 rounded-full flex items-center gap-1.5 uppercase tracking-wide font-medium shadow-lg">
                <span className="w-1.5 h-1.5 bg-green-400 rounded-full shadow-[0_0_5px_rgba(74,222,128,0.8)]"></span> Active
              </div>

              <div className="absolute bottom-4 left-5 right-5 flex justify-between items-end">
                <div>
                  <span className="text-xs text-gray-300 mb-1 block font-mono tracking-tight">Health & Wellness</span>
                  <h3 className="text-white font-medium text-lg tracking-wide">Posture Corrector Pro</h3>
                </div>
                <button className="bg-white/10 backdrop-blur-sm border border-white/20 text-white rounded-full p-2.5 hover:bg-white hover:text-black transition-all duration-300">
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-5 border-t border-white/5 bg-white/[0.01]">
              <div className="space-y-5">
                <div>
                  <div className="flex justify-between text-[10px] uppercase tracking-wider text-gray-500 mb-2">
                    <span>Generation Queue</span>
                    <span className="text-white">8/12 Done</span>
                  </div>
                  <div className="w-full bg-white/5 rounded-full h-1 overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: "66%" }}
                      transition={{ duration: 1, delay: 0.5 }}
                      className="bg-white h-1 rounded-full shadow-[0_0_10px_rgba(255,255,255,0.3)]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white/5 rounded-lg p-3 border border-white/5">
                    <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">CTR</p>
                    <p className="text-sm font-medium text-white font-mono">2.4%</p>
                  </div>
                  <div className="bg-white/5 rounded-lg p-3 border border-white/5">
                    <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Spend</p>
                    <p className="text-sm font-medium text-white font-mono">$450</p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <span className="text-[10px] bg-white/5 border border-white/5 text-gray-400 px-2 py-1 rounded-md">TikTok</span>
                  <span className="text-[10px] bg-white/5 border border-white/5 text-gray-400 px-2 py-1 rounded-md">Reels</span>
                  <span className="text-[10px] bg-white/5 border border-white/5 text-gray-400 px-2 py-1 rounded-md">UGC Style</span>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Campaign 2: Generating */}
          <motion.div variants={itemVariants} className="glass-panel rounded-2xl overflow-hidden group border-t border-t-white/10 hover:border-t-white/40 transition-all duration-500">
            <div className="relative h-52 overflow-hidden">
              <img
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuCjq0pda8mIKgjAl0oF8NuYnENJC5-QvcHneYAwApL6SR5_825XUwMS7dgBxWGqtqZ-B_dauFgm0H0ohBI9E61rms-xOqKtPNlVRgW63VUD9CSgppqON5T6G3mVWMUyYDHfh9BXvmaD2aMsG15uecb237AkAUO5zsS9MiZ8Ts99rWaJhrI0nuz0iOwOlskpTty8J-yvMHcG_sFwgnao1xcwbyPw-PA7UfiMP1YIS4Mifm6rxFsJGO0HM-wq_RCOGJ0ZE5gQ8wyvl7O-"
                alt="Headphones"
                className="w-full h-full object-cover opacity-60 grayscale group-hover:grayscale-0 group-hover:opacity-100 group-hover:scale-105 transition-all duration-700"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a]/50 to-transparent"></div>

              <div className="absolute top-4 right-4 bg-black/60 backdrop-blur-md border border-white/10 text-blue-400 text-[10px] px-2 py-1 rounded-full flex items-center gap-1.5 uppercase tracking-wide font-medium shadow-lg">
                <RefreshCw className="w-3 h-3 animate-spin" /> Generating
              </div>

              <div className="absolute bottom-4 left-5 right-5 flex justify-between items-end">
                <div>
                  <span className="text-xs text-gray-300 mb-1 block font-mono tracking-tight">Tech Gadgets</span>
                  <h3 className="text-white font-medium text-lg tracking-wide">SonicBoom Wireless</h3>
                </div>
                <button className="bg-white/10 backdrop-blur-sm border border-white/20 text-white rounded-full p-2.5 hover:bg-white hover:text-black transition-all duration-300">
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-5 border-t border-white/5 bg-white/[0.01]">
              <div className="space-y-5">
                <div>
                  <div className="flex justify-between text-[10px] uppercase tracking-wider text-gray-500 mb-2">
                    <span>AI Processing</span>
                    <span className="text-blue-400">Processing Video 3...</span>
                  </div>
                  <div className="w-full bg-white/5 rounded-full h-1 overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: "30%" }}
                      transition={{ duration: 0.8, delay: 0.6 }}
                      className="bg-blue-500 h-1 rounded-full animate-pulse shadow-[0_0_10px_rgba(59,130,246,0.5)]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white/5 rounded-lg p-3 border border-white/5">
                    <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Exp. ROAS</p>
                    <p className="text-sm font-medium text-white font-mono">3.2x</p>
                  </div>
                  <div className="bg-white/5 rounded-lg p-3 border border-white/5">
                    <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Source</p>
                    <p className="text-sm font-medium text-white font-mono">AliExpress</p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <span className="text-[10px] bg-white/5 border border-white/5 text-gray-400 px-2 py-1 rounded-md">Facebook</span>
                  <span className="text-[10px] bg-white/5 border border-white/5 text-gray-400 px-2 py-1 rounded-md">Minimalist</span>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Campaign 3: Draft */}
          <motion.div variants={itemVariants} className="glass-panel rounded-2xl overflow-hidden group border-t border-t-white/10 hover:border-t-white/40 transition-all duration-500 opacity-80 hover:opacity-100">
            <div className="relative h-52 overflow-hidden bg-white/[0.02] flex items-center justify-center">
              <ImageIcon className="w-16 h-16 text-white/5" strokeWidth={1} />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-transparent to-transparent"></div>

              <div className="absolute top-4 right-4 bg-white/5 backdrop-blur-md border border-white/10 text-gray-400 text-[10px] px-2 py-1 rounded-full flex items-center gap-1.5 uppercase tracking-wide font-medium">
                Draft
              </div>

              <div className="absolute bottom-4 left-5 right-5 flex justify-between items-end">
                <div>
                  <span className="text-xs text-gray-300 mb-1 block font-mono tracking-tight">Home Decor</span>
                  <h3 className="text-white font-medium text-lg tracking-wide">Sunset Lamp</h3>
                </div>
                <button className="bg-white/10 backdrop-blur-sm border border-white/20 text-white rounded-full p-2.5 hover:bg-white hover:text-black transition-all duration-300">
                  <span className="material-symbols-outlined text-sm">edit</span>
                </button>
              </div>
            </div>

            <div className="p-5 border-t border-white/5 bg-white/[0.01]">
              <div className="space-y-5">
                <div>
                  <div className="flex justify-between text-[10px] uppercase tracking-wider text-gray-500 mb-2">
                    <span>Setup Status</span>
                    <span className="text-yellow-500/80">Missing Assets</span>
                  </div>
                  <div className="w-full bg-white/5 rounded-full h-1 overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: "15%" }}
                      transition={{ duration: 0.5, delay: 0.7 }}
                      className="bg-gray-600 h-1 rounded-full"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white/5 rounded-lg p-3 border border-white/5">
                    <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Potential</p>
                    <p className="text-sm font-medium text-white font-mono">High</p>
                  </div>
                  <div className="bg-white/5 rounded-lg p-3 border border-white/5">
                    <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Competitors</p>
                    <p className="text-sm font-medium text-white font-mono">12</p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <span className="text-[10px] bg-white/5 border border-white/5 text-gray-400 px-2 py-1 rounded-md">TikTok</span>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>

        {/* Connect Dropdown Box */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="mt-8 border border-dashed border-white/10 rounded-2xl p-6 flex flex-col items-center justify-center text-center hover:bg-white/5 hover:border-white/20 transition-all cursor-pointer h-36 group"
        >
          <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
            <Plus className="w-6 h-6 text-gray-400 group-hover:text-white transition-colors" />
          </div>
          <p className="text-sm font-medium text-white">Connect New Data Source</p>
          <p className="text-xs text-gray-500 mt-1">Import from Shopify, AliExpress, or CSV</p>
        </motion.div>

        <footer className="mt-12 text-center text-xs text-gray-600 pb-4 font-mono">
          <p>© 2026 DropAI Inc. v2.4.1 (Stable)</p>
        </footer>
      </div>
    </div>
  );
}
