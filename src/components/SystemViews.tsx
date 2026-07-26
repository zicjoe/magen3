import type { ReactNode } from "react";
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  CircleGauge,
  Database,
  ExternalLink,
  RefreshCcw,
  Server,
  ShieldCheck,
  Wrench,
  XCircle,
} from "lucide-react";
import type { ActivityEvent, HealthStatus, IntegrationDetail, ToolCatalogEntry } from "@yieldbot/shared";
import { chainLabels, integrationLabel, relativeTime } from "../lib/presentation";

function integrationIcon(detail?: IntegrationDetail) {
  if (detail?.status === "ready" || detail?.status === "configured") return <CheckCircle2 size={18} />;
  if (detail?.status === "missing" || detail?.status === "unreachable") return <XCircle size={18} />;
  return <CircleGauge size={18} />;
}

function IntegrationCard({ title, detail, icon }: { title: string; detail?: IntegrationDetail; icon: ReactNode }) {
  return (
    <article className={`integration-card panel ${detail?.status || "checking"}`}>
      <div className="integration-title"><span className="integration-icon">{icon}</span><div><strong>{title}</strong><small>{detail?.mode || "integration"}</small></div><span className={`integration-state ${detail?.status || "checking"}`}>{integrationIcon(detail)}{integrationLabel(detail)}</span></div>
      <p>{detail?.message || "Checking configuration and connectivity…"}</p>
      {detail?.metadata && <details><summary>Technical details</summary><pre>{JSON.stringify(detail.metadata, null, 2)}</pre></details>}
    </article>
  );
}

export function IntegrationsView(props: {
  health: HealthStatus | null;
  catalog: ToolCatalogEntry[];
  refreshing: boolean;
  onRefresh: () => void;
}) {
  return (
    <section className="view-stack">
      <div className="view-heading"><div><p className="eyebrow">System readiness</p><h1>Integrations</h1><p>Credentials, live connectivity, execution transports, and protocol adapter coverage.</p></div><button className="secondary-button" disabled={props.refreshing} onClick={props.onRefresh}><RefreshCcw size={15} /> Refresh probes</button></div>
      <div className="integration-grid">
        <IntegrationCard title="OpenAI agent planner" detail={props.health?.integrations.ai} icon={<CircleGauge size={20} />} />
        <IntegrationCard title="Magen3 execution firewall" detail={props.health?.integrations.magen3} icon={<ShieldCheck size={20} />} />
        <IntegrationCard title="CSPR.trade MCP" detail={props.health?.integrations.csprTrade} icon={<Server size={20} />} />
        <IntegrationCard title="0x swap API" detail={props.health?.integrations.zeroX} icon={<Wrench size={20} />} />
      </div>
      <div className="persistence-card panel">
        <div><Database size={19} /><div><strong>Persistence</strong><small>{props.health?.persistence.mode || "Checking"}</small></div></div>
        <p>{props.health?.persistence.message || "Checking storage configuration…"}</p>
      </div>
      <div className="adapter-table panel">
        <div className="panel-heading"><div><Wrench size={18} /><div><strong>Protocol adapter catalog</strong><small>What YieldBot can actually perform today</small></div></div><span className="subtle-chip">{props.catalog.filter((tool) => tool.status === "live").length} live</span></div>
        <div className="table-scroll"><table><thead><tr><th>Adapter</th><th>Chain</th><th>Protocol</th><th>Operation</th><th>Status</th></tr></thead><tbody>{props.catalog.map((tool) => <tr key={tool.id}><td><strong>{tool.name}</strong><small>{tool.description}</small></td><td>{chainLabels[tool.chainId]}</td><td>{tool.protocol}</td><td>{tool.operation}</td><td><span className={`catalog-status ${tool.status}`}>{tool.status === "live" ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}{tool.status === "live" ? "Live" : "Adapter required"}</span></td></tr>)}</tbody></table></div>
      </div>
    </section>
  );
}

function ActivityIcon({ type }: { type: ActivityEvent["type"] }) {
  if (type === "magen3.decision") return <ShieldCheck size={16} />;
  if (type.includes("execution")) return <ExternalLink size={16} />;
  if (type === "agent.plan.created") return <CircleGauge size={16} />;
  return <Activity size={16} />;
}

export function ActivityView({ events, refreshing, onRefresh }: { events: ActivityEvent[]; refreshing: boolean; onRefresh: () => void }) {
  return (
    <section className="view-stack">
      <div className="view-heading"><div><p className="eyebrow">Audit and operations</p><h1>Activity</h1><p>Conversation, planning, authorization, and execution events recorded by the YieldBot backend.</p></div><button className="secondary-button" disabled={refreshing} onClick={onRefresh}><RefreshCcw size={15} /> Refresh</button></div>
      <div className="activity-panel panel">
        {events.length === 0 ? <div className="large-empty"><Activity size={30} /><h3>No activity yet</h3><p>Create a plan or prepare an action to populate this timeline.</p></div> : <div className="activity-list">{events.map((event) => <article className="activity-row" key={event.id}><div className="activity-icon"><ActivityIcon type={event.type} /></div><div className="activity-copy"><div><strong>{event.title}</strong><span>{relativeTime(event.createdAt)}</span></div><p>{event.detail}</p><small>{[event.chainId && chainLabels[event.chainId], event.transactionHash].filter(Boolean).join(" · ")}</small></div></article>)}</div>}
      </div>
    </section>
  );
}
