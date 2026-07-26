import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Code2,
  ExternalLink,
  FileLock2,
  LockKeyhole,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import type { AgentPlanStep, PreparedExecution } from "@yieldbot/shared";
import { capabilityLabels, chainLabels, formatUnknown } from "../lib/presentation";

export function ExecutionPanel(props: {
  step: AgentPlanStep | null;
  prepared: PreparedExecution | null;
  working: boolean;
  onExecute: () => void;
  explorerLink?: string;
}) {
  if (!props.step) {
    return (
      <section className="execution-panel panel">
        <div className="panel-heading"><div><FileLock2 size={18} /><strong>Execution control</strong></div></div>
        <div className="execution-empty"><ShieldCheck size={34} /><h3>Nothing can execute yet</h3><p>Select a plan step. YieldBot separates planning, preparation, Magen3 authorization, and wallet signing.</p></div>
      </section>
    );
  }
  const evaluation = props.prepared?.evaluation;
  const expired = Boolean(props.prepared?.expiresAt && Date.parse(props.prepared.expiresAt) <= Date.now());
  const canExecute = Boolean(props.prepared?.executable && evaluation?.decision === "allowed" && props.prepared.transaction && !props.working && !expired);
  return (
    <section className="execution-panel panel">
      <div className="panel-heading"><div><FileLock2 size={18} /><div><strong>Execution control</strong><small>Exact payload protection</small></div></div><span className="subtle-chip">{chainLabels[props.step.chainId]}</span></div>
      <div className="execution-facts">
        <div><span>Action</span><strong>{capabilityLabels[props.step.capability]}</strong></div>
        <div><span>Protocol</span><strong>{props.step.protocol || "Not selected"}</strong></div>
        <div><span>Amount</span><strong>{props.step.amount || "Read-only"}</strong></div>
        <div><span>Adapter</span><strong className={props.step.adapterStatus === "live" ? "positive" : "muted"}>{props.step.adapterStatus === "live" ? "Verified" : "Required"}</strong></div>
      </div>

      {!props.prepared && <div className="security-stage pending"><Clock3 size={18} /><div><strong>Waiting for preparation</strong><p>No quote or transaction exists. Nothing has been sent to Magen3.</p></div></div>}

      {props.prepared && (
        <>
          <div className="payload-card">
            <div><Code2 size={15} /><strong>{props.prepared.kind === "read-result" ? "Verified result" : "Prepared payload"}</strong></div>
            <p>{props.prepared.notice}</p>
            <details><summary>Inspect technical data</summary><pre>{formatUnknown(props.prepared.kind === "read-result" ? props.prepared.result : { quote: props.prepared.quote, analysis: props.prepared.analysis, transaction: props.prepared.transaction })}</pre></details>
          </div>
          {props.prepared.kind !== "read-result" && (
            <div className={`security-stage ${evaluation?.decision || "pending"}`}>
              {evaluation?.decision === "allowed" ? <CheckCircle2 size={19} /> : evaluation?.decision === "blocked" ? <XCircle size={19} /> : evaluation?.decision === "review-required" ? <AlertTriangle size={19} /> : <Clock3 size={19} />}
              <div>
                <strong>{evaluation ? `Magen3: ${evaluation.decision}` : "Waiting for Magen3"}</strong>
                <p>{evaluation?.reason || "Execution remains locked until the live policy decision returns."}</p>
                {(evaluation?.auditId || evaluation?.policyId || evaluation?.proofStatus) && <small>{[evaluation.policyId, evaluation.auditId && `Audit ${evaluation.auditId}`, evaluation.proofStatus && `Proof ${evaluation.proofStatus}`].filter(Boolean).join(" · ")}</small>}
              </div>
            </div>
          )}
          {props.step.transactionHash && <div className="transaction-result"><CheckCircle2 size={16} /><div><strong>Transaction submitted</strong><span>{props.step.transactionHash}</span></div>{props.explorerLink && <a href={props.explorerLink} target="_blank" rel="noreferrer"><ExternalLink size={14} /></a>}</div>}
        </>
      )}

      {props.prepared?.kind !== "read-result" && (
        <button className={canExecute ? "execute-button" : "execute-button locked"} disabled={!canExecute} onClick={props.onExecute}>
          <LockKeyhole size={16} /> {props.working ? "Working…" : expired ? "Preparation expired" : canExecute ? "Sign and submit" : evaluation?.decision === "review-required" ? "Human review required" : evaluation?.decision === "blocked" ? "Blocked by Magen3" : "Execution locked"}
        </button>
      )}
      <div className="execution-note"><ShieldCheck size={13} /> The AI cannot override Magen3 or the connected wallet.</div>
    </section>
  );
}
