import { type ChangeEvent, type KeyboardEvent, useMemo } from "react";
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  CircleDollarSign,
  Coins,
  Database,
  Layers3,
  MessageSquareText,
  Send,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import type { AgentPlan, ChainId, Conversation, ToolCatalogEntry } from "@yieldbot/shared";
import type { ChainDefinition } from "../types/defi";
import { capabilityLabels, shortAddress } from "../lib/presentation";

const prompts: Record<ChainId, string[]> = {
  casper: [
    "Show my live Casper portfolio and explain the result.",
    "Prepare a 10 CSPR to sCSPR swap with no more than 3% slippage.",
    "What verified DeFi actions can you currently perform on Casper?",
  ],
  base: [
    "Show my Base balance and explain what is live in YieldBot.",
    "Prepare a 0.001 ETH to USDC swap on Base.",
    "Create a cautious plan for idle ETH without inventing yields.",
  ],
  arbitrum: [
    "Show my Arbitrum balance.",
    "Prepare a 0.001 ETH to USDC swap on Arbitrum.",
    "Explain which Arbitrum actions still need adapters.",
  ],
};

function capabilityIcon(capability: string) {
  if (capability === "swap") return <CircleDollarSign size={18} />;
  if (capability.includes("staking")) return <Coins size={18} />;
  if (capability === "portfolio") return <Database size={18} />;
  return <Layers3 size={18} />;
}

export function AgentHero(props: {
  chain: ChainDefinition;
  walletConnected: boolean;
  walletAddress: string;
  balance?: string;
  working: boolean;
  onConnect: () => void;
}) {
  return (
    <section className="hero panel">
      <div className="hero-copy">
        <div className="hero-kicker"><span className="live-dot" /> Active network · {props.chain.name}</div>
        <h1>Ask. Plan. Protect. Execute.</h1>
        <p>YieldBot turns a natural-language goal into a transparent DeFi plan, prepares only verified actions, and requires a live Magen3 decision before wallet signing.</p>
        <div className="hero-trust-row">
          <span><Bot size={14} /> AI planning</span>
          <span><ShieldCheck size={14} /> Deterministic security</span>
          <span><Wallet size={14} /> Local wallet signing</span>
        </div>
      </div>
      <div className="wallet-hero-card">
        <span className="card-label">{props.chain.name} wallet</span>
        <strong>{props.walletConnected ? shortAddress(props.walletAddress) : "Not connected"}</strong>
        <small>{props.balance ? `${props.balance} ${props.chain.nativeSymbol}` : props.walletConnected ? "Connected · balance not loaded" : "Connect to prepare or execute live actions"}</small>
        <button className={props.walletConnected ? "secondary-button" : "primary-button"} disabled={props.working} onClick={props.onConnect}>
          <Wallet size={16} /> {props.walletConnected ? "Disconnect wallet" : `Connect ${props.chain.family === "casper" ? "Casper" : "EVM"} wallet`}
        </button>
      </div>
    </section>
  );
}

export function CapabilityStrip({ chain, catalog }: { chain: ChainDefinition; catalog: ToolCatalogEntry[] }) {
  return (
    <div className="capability-grid">
      {chain.capabilities.slice(0, 5).map((capability) => {
        const entry = catalog.find((tool) => tool.chainId === chain.id && tool.capability === capability);
        const live = entry?.status === "live";
        return (
          <div className="capability-card panel" key={capability} title={entry?.description}>
            <div className="capability-icon">{capabilityIcon(capability)}</div>
            <div><strong>{capabilityLabels[capability]}</strong><small>{live ? "Live adapter" : "Adapter required"}</small></div>
            <span className={live ? "mini-status live" : "mini-status planned"}>{live ? "Live" : "Next"}</span>
          </div>
        );
      })}
    </div>
  );
}

export function ChatWorkspace(props: {
  chainId: ChainId;
  conversation: Conversation | null;
  input: string;
  onInput: (value: string) => void;
  onSubmit: () => void;
  onPrompt: (value: string) => void;
  onNewConversation: () => void;
  working: boolean;
  activePlan: AgentPlan | null;
}) {
  const messages = props.conversation?.messages || [];
  const planSummary = useMemo(() => props.activePlan ? `${props.activePlan.steps.length} steps · ${props.activePlan.riskLevel} risk` : "No active plan", [props.activePlan]);
  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      props.onSubmit();
    }
  }
  return (
    <section className="chat panel">
      <div className="panel-heading">
        <div><MessageSquareText size={18} /><div><strong>Agent conversation</strong><small>Natural language → validated plan</small></div></div>
        <div className="panel-actions"><span className="subtle-chip">{planSummary}</span><button className="new-chat-button" disabled={props.working} onClick={props.onNewConversation}>New chat</button></div>
      </div>
      <div className="messages" aria-live="polite">
        {messages.map((message) => (
          <div key={message.id} className={`message ${message.role}`}>
            <div className="avatar">{message.role === "assistant" ? <Bot size={15} /> : <Wallet size={15} />}</div>
            <div className="message-body"><p>{message.text}</p><small>{new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</small></div>
          </div>
        ))}
        {props.working && <div className="message assistant"><div className="avatar"><Bot size={15} /></div><div className="message-body"><p className="thinking"><span /><span /><span /></p><small>YieldBot is working</small></div></div>}
      </div>
      <div className="prompt-row">
        {prompts[props.chainId].map((prompt) => <button key={prompt} disabled={props.working} onClick={() => props.onPrompt(prompt)}><span>{prompt}</span><ArrowRight size={14} /></button>)}
      </div>
      <div className="composer">
        <textarea value={props.input} onChange={(event: ChangeEvent<HTMLTextAreaElement>) => props.onInput(event.target.value)} onKeyDown={onKeyDown} placeholder="Describe what you want YieldBot to analyse or prepare…" rows={2} maxLength={4000} />
        <button className="send-button" onClick={props.onSubmit} disabled={props.working || !props.input.trim()} aria-label="Send message"><Send size={18} /></button>
      </div>
      <div className="composer-note"><CheckCircle2 size={13} /> YieldBot never asks for seed phrases and never signs for you.</div>
    </section>
  );
}
