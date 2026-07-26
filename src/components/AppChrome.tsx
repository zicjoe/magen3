import {
  Activity,
  Bot,
  Boxes,
  CircleGauge,
  Network,
  Orbit,
  ShieldCheck,
  Sparkles,
  Wallet,
} from "lucide-react";
import type { ChainId, HealthStatus } from "@yieldbot/shared";
import { CHAINS } from "../services/chains";
import { integrationLabel, shortAddress } from "../lib/presentation";

export type AppView = "agent" | "plans" | "activity" | "integrations";

const views: Array<{ id: AppView; label: string; icon: typeof Bot }> = [
  { id: "agent", label: "AI Agent", icon: Bot },
  { id: "plans", label: "Plans", icon: Boxes },
  { id: "activity", label: "Activity", icon: Activity },
  { id: "integrations", label: "Integrations", icon: CircleGauge },
];

export function Topbar({ health, workingLabel }: { health: HealthStatus | null; workingLabel?: string }) {
  const magen = health?.integrations.magen3;
  return (
    <header className="topbar">
      <div className="brand">
        <div className="brand-mark"><Orbit size={19} /></div>
        <div><strong>YieldBot AI</strong><span>Professional multichain DeFi agent</span></div>
      </div>
      <div className="topbar-actions">
        {workingLabel && <div className="working-indicator"><span className="spinner" />{workingLabel}</div>}
        <div className={`protection-pill ${magen?.status || "checking"}`} title={magen?.message}>
          <ShieldCheck size={15} />
          <span>Magen3 {integrationLabel(magen)}</span>
        </div>
        <div className="version-pill">v1.0</div>
      </div>
    </header>
  );
}

export function Sidebar(props: {
  view: AppView;
  onView: (view: AppView) => void;
  chainId: ChainId;
  onChain: (chain: ChainId) => void;
  casperPublicKey: string;
  evmAddress: string;
  health: HealthStatus | null;
}) {
  return (
    <aside className="sidebar panel">
      <div className="sidebar-nav">
        <p className="eyebrow">Workspace</p>
        {views.map((item) => {
          const Icon = item.icon;
          return <button key={item.id} className={`nav-row ${props.view === item.id ? "active" : ""}`} onClick={() => props.onView(item.id)}><Icon size={17} /><span>{item.label}</span></button>;
        })}
      </div>

      <div className="sidebar-section">
        <p className="eyebrow">Networks</p>
        {CHAINS.map((chain) => (
          <button key={chain.id} onClick={() => props.onChain(chain.id)} className={`network-row ${props.chainId === chain.id ? "active" : ""}`}>
            <span className="network-icon">{chain.family === "casper" ? <Sparkles size={17} /> : <Network size={17} />}</span>
            <span className="network-copy"><strong>{chain.name}</strong><small>{chain.family === "casper" ? "Native Casper" : "EVM network"}</small></span>
            <span className="status-dot" />
          </button>
        ))}
      </div>

      <div className="sidebar-section wallet-summary">
        <p className="eyebrow">Wallet sessions</p>
        <div className={props.casperPublicKey ? "wallet-mini connected" : "wallet-mini"}>
          <Wallet size={16} /><div><strong>Casper</strong><small>{props.casperPublicKey ? shortAddress(props.casperPublicKey) : "Not connected"}</small></div>
        </div>
        <div className={props.evmAddress ? "wallet-mini connected" : "wallet-mini"}>
          <Wallet size={16} /><div><strong>EVM</strong><small>{props.evmAddress ? shortAddress(props.evmAddress) : "Not connected"}</small></div>
        </div>
      </div>

      <div className="sidebar-footer">
        <ShieldCheck size={17} />
        <div><strong>Execution firewall</strong><small>{props.health?.integrations.magen3.message || "Checking Magen3 integration…"}</small></div>
      </div>
    </aside>
  );
}
