import type { MouseEvent } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Ban,
  CheckCircle2,
  CircleDashed,
  Clock3,
  ListChecks,
  LockKeyhole,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import type { AgentPlan, AgentPlanStep } from "@yieldbot/shared";
import { capabilityLabels, chainLabels, stepStatusLabels } from "../lib/presentation";

function statusIcon(step: AgentPlanStep) {
  if (step.status === "confirmed" || step.status === "submitted" || step.status === "allowed") return <CheckCircle2 size={16} />;
  if (step.status === "blocked" || step.status === "failed") return <Ban size={16} />;
  if (step.status === "review-required") return <ShieldAlert size={16} />;
  if (step.status === "adapter-required") return <Clock3 size={16} />;
  if (step.status === "preparing") return <span className="spinner small" />;
  return <CircleDashed size={16} />;
}

export function PlanSummary(props: {
  plan: AgentPlan | null;
  selectedStepId?: string;
  onSelectStep: (step: AgentPlanStep) => void;
  onPrepare: (step: AgentPlanStep) => void;
  walletAvailable: (step: AgentPlanStep) => boolean;
  working: boolean;
  expanded?: boolean;
}) {
  if (!props.plan) {
    return (
      <section className="plan-empty panel">
        <div className="empty-icon"><ListChecks size={24} /></div>
        <h3>No active plan</h3>
        <p>Ask YieldBot for an analysis or action. The AI will create a plan, but no transaction will be prepared automatically.</p>
      </section>
    );
  }
  const plan = props.plan;
  return (
    <section className={`plan-board panel ${props.expanded ? "expanded" : ""}`}>
      <div className="panel-heading">
        <div><ListChecks size={18} /><div><strong>{plan.title}</strong><small>{plan.objective}</small></div></div>
        <span className={`risk-chip ${plan.riskLevel}`}>{plan.riskLevel} risk</span>
      </div>
      {(plan.warnings.length > 0 || plan.assumptions.length > 0) && (
        <div className="plan-context">
          {plan.warnings.slice(0, 2).map((warning) => <div className="context-note warning" key={warning}><AlertTriangle size={14} /><span>{warning}</span></div>)}
          {props.expanded && plan.assumptions.map((assumption) => <div className="context-note" key={assumption}><Sparkles size={14} /><span>Assumption: {assumption}</span></div>)}
        </div>
      )}
      <div className="step-list">
        {plan.steps.map((step, index) => {
          const selected = props.selectedStepId === step.id;
          const canPrepare = step.adapterStatus === "live" && ["ready", "failed", "allowed", "blocked", "review-required"].includes(step.status) && props.walletAvailable(step);
          return (
            <article key={step.id} className={`plan-step status-${step.status} ${selected ? "selected" : ""}`} onClick={() => props.onSelectStep(step)}>
              <div className="step-rail"><span className="step-number">{index + 1}</span>{index < plan.steps.length - 1 && <span className="rail-line" />}</div>
              <div className="step-content">
                <div className="step-topline"><div><strong>{step.summary}</strong><small>{chainLabels[step.chainId]} · {capabilityLabels[step.capability]} · {step.protocol || "No protocol"}</small></div><span className={`status-chip ${step.status}`}>{statusIcon(step)}{stepStatusLabels[step.status]}</span></div>
                {props.expanded && <p>{step.rationale}</p>}
                <div className="step-meta">
                  {step.amount && <span>{step.amount}</span>}
                  {step.maxSlippageBps && <span>Max slippage {(step.maxSlippageBps / 100).toFixed(2)}%</span>}
                  <span>{step.operation === "write" ? <><LockKeyhole size={12} /> Magen3 + signature</> : "Read-only"}</span>
                </div>
                {step.error && <div className="step-error">{step.error}</div>}
                {canPrepare && selected && <button className="prepare-button" disabled={props.working} onClick={(event: MouseEvent<HTMLButtonElement>) => { event.stopPropagation(); props.onPrepare(step); }}>Prepare this step <ArrowRight size={14} /></button>}
                {!props.walletAvailable(step) && step.adapterStatus === "live" && selected && <div className="step-hint">Connect the {step.chainId === "casper" ? "Casper" : "EVM"} wallet to continue.</div>}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}


export function PlanHistory(props: {
  plans: AgentPlan[];
  activePlanId?: string;
  onSelect: (plan: AgentPlan) => void;
}) {
  return (
    <section className="plan-history panel">
      <div className="panel-heading">
        <div><Clock3 size={18} /><div><strong>Plan history</strong><small>Persisted agent workflows</small></div></div>
        <span className="subtle-chip">{props.plans.length} saved</span>
      </div>
      <div className="plan-history-list">
        {props.plans.length === 0 && <div className="history-empty">No plans have been created yet.</div>}
        {props.plans.map((plan) => (
          <button key={plan.id} className={plan.id === props.activePlanId ? "active" : ""} onClick={() => props.onSelect(plan)}>
            <div><strong>{plan.title}</strong><small>{plan.steps.length} step{plan.steps.length === 1 ? "" : "s"} · {plan.riskLevel} risk</small></div>
            <span>{new Date(plan.updatedAt).toLocaleDateString([], { month: "short", day: "numeric" })}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
