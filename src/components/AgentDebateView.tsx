import { Brain, Cpu, Network, Activity, Sparkles } from 'lucide-react';
import React from 'react';

export function AgentDebateView({ round, isProcessing }: { round: number, isProcessing: boolean }) {
  const getGeminiStatus = () => {
    if (!isProcessing) return "Idle";
    if (round === 1) return "Analyzing input context... Generating initial analysis.";
    if (round > 1) return "Awaiting critique synthesis...";
    return "Processing...";
  };

  const getDeepSeekStatus = () => {
    if (!isProcessing) return "Idle";
    if (round < 2) return "Waiting for Prime's initial analysis...";
    if (round === 2) return "Critiquing Prime's analysis. Identifying flaws...";
    if (round > 2) return "Reviewing subsequent critiques...";
    return "Processing...";
  };

  const getQwenStatus = () => {
    if (!isProcessing) return "Idle";
    if (round < 3) return "Waiting for DeepSeek's critique...";
    if (round === 3) return "Analyzing prior critiques and context...";
    if (round > 3) return "Awaiting final synthesis...";
    return "Processing...";
  };

  const getLlamaStatus = () => {
    if (!isProcessing) return "Idle";
    if (round < 4) return "Waiting for all context and critiques...";
    if (round === 4) return "Synthesizing final consensus... Resolving debate.";
    return "Processing...";
  };

  return (
    <div className="w-[450px] bg-zinc-950 flex flex-col">
      <div className="p-3 border-b border-zinc-800 bg-zinc-900/30 flex items-center justify-between">
        <h3 className="text-[11px] font-semibold text-zinc-400 tracking-wider uppercase flex items-center gap-2">
          <Activity size={14} className="text-blue-400" />
          Live Agent Debate
        </h3>
        <span className={`text-[10px] px-2 py-0.5 rounded-full border ${isProcessing ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 'bg-zinc-800 text-zinc-500 border-zinc-700'}`}>
          {isProcessing ? `ROUND ${round} / 4` : 'STANDBY'}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <AgentCard
          name="GEMINI-PRIME"
          role="Lead Orchestrator"
          icon={<Brain size={16} className="text-blue-400" />}
          status={getGeminiStatus()}
          color="blue"
          isActive={isProcessing && round === 1}
        />
        <AgentCard
          name="DEEPSEEK"
          role="Critical Thinker"
          icon={<Cpu size={16} className="text-orange-400" />}
          status={getDeepSeekStatus()}
          color="orange"
          isActive={isProcessing && round === 2}
        />
        <AgentCard
          name="QWEN"
          role="Detail Analyzer"
          icon={<Sparkles size={16} className="text-purple-400" />}
          status={getQwenStatus()}
          color="purple"
          isActive={isProcessing && round === 3}
        />
        <AgentCard
          name="LLAMA"
          role="Final Synthesizer"
          icon={<Network size={16} className="text-emerald-400" />}
          status={getLlamaStatus()}
          color="emerald"
          isActive={isProcessing && round === 4}
        />
      </div>
    </div>
  );
}

function AgentCard({ name, role, icon, status, color, isActive }: { name: string, role: string, icon: React.ReactNode, status: string, color: string, isActive: boolean }) {
  const colorMap = {
    blue: isActive ? 'border-blue-500/50 bg-blue-500/10 shadow-[0_0_15px_rgba(59,130,246,0.15)]' : 'border-blue-500/20 bg-blue-500/5 opacity-60',
    orange: isActive ? 'border-orange-500/50 bg-orange-500/10 shadow-[0_0_15px_rgba(249,115,22,0.15)]' : 'border-orange-500/20 bg-orange-500/5 opacity-60',
    emerald: isActive ? 'border-emerald-500/50 bg-emerald-500/10 shadow-[0_0_15px_rgba(16,185,129,0.15)]' : 'border-emerald-500/20 bg-emerald-500/5 opacity-60',
    purple: isActive ? 'border-purple-500/50 bg-purple-500/10 shadow-[0_0_15px_rgba(168,85,247,0.15)]' : 'border-purple-500/20 bg-purple-500/5 opacity-60',
  };

  return (
    <div className={`p-4 rounded-lg border transition-all duration-500 ${colorMap[color as keyof typeof colorMap]} flex flex-col gap-3`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-xs font-bold text-zinc-200">{name}</span>
        </div>
        <span className="text-[10px] text-zinc-500 uppercase tracking-wider">{role}</span>
      </div>
      <div className="text-[11px] text-zinc-400 font-mono bg-zinc-950/50 p-2 rounded border border-zinc-800/50">
        &gt; {status}
      </div>
    </div>
  );
}
