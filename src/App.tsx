import { useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, X } from "lucide-react";
import type {
  ActivityEvent,
  AgentPlan,
  AgentPlanStep,
  ChainId,
  Conversation,
  HealthStatus,
  PreparedExecution,
  ToolCatalogEntry,
} from "@yieldbot/shared";
import { Topbar, Sidebar, type AppView } from "./components/AppChrome";
import { AgentHero, CapabilityStrip, ChatWorkspace } from "./components/AgentWorkspace";
import { PlanHistory, PlanSummary } from "./components/PlanBoard";
import { ExecutionPanel } from "./components/ExecutionPanel";
import { ActivityView, IntegrationsView } from "./components/SystemViews";
import {
  createConversation,
  getActivity,
  getConversations,
  getPlans,
  getToolCatalog,
  preparePlanStep,
  recordExecutionReceipt,
  sendAgentMessage,
  submitCasperExecution,
} from "./services/agent";
import { getIntegrationHealth } from "./services/integrations";
import { CHAINS } from "./services/chains";
import { connectCasperWallet, disconnectCasperWallet, signCasperDeploy } from "./services/casperWallet";
import { connectEvmWallet, readEvmBalance, sendEvmTransaction, switchEvmChain, waitForEvmReceipt } from "./services/evmWallet";

interface Notice { type: "success" | "error"; message: string }

function App() {
  const [view, setView] = useState<AppView>("agent");
  const [chainId, setChainId] = useState<ChainId>("casper");
  const [casperPublicKey, setCasperPublicKey] = useState("");
  const [evmAddress, setEvmAddress] = useState("");
  const [balances, setBalances] = useState<Partial<Record<ChainId, string>>>({});
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [input, setInput] = useState("");
  const [activePlan, setActivePlan] = useState<AgentPlan | null>(null);
  const [planHistory, setPlanHistory] = useState<AgentPlan[]>([]);
  const [selectedStepId, setSelectedStepId] = useState<string>();
  const [prepared, setPrepared] = useState<PreparedExecution | null>(null);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [catalog, setCatalog] = useState<ToolCatalogEntry[]>([]);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [workingLabel, setWorkingLabel] = useState<string>();
  const [notice, setNotice] = useState<Notice>();

  const chain = useMemo(() => CHAINS.find((item) => item.id === chainId)!, [chainId]);
  const walletAddress = chain.family === "casper" ? casperPublicKey : evmAddress;
  const walletConnected = Boolean(walletAddress);
  const selectedStep = useMemo(
    () => activePlan?.steps.find((step) => step.id === selectedStepId) || null,
    [activePlan, selectedStepId],
  );

  useEffect(() => {
    let active = true;
    async function bootstrap() {
      setWorkingLabel("Starting agent workspace");
      try {
        const [conversationResult, planResult, nextHealth, toolResult, activityResult] = await Promise.all([
          getConversations(1),
          getPlans(20),
          getIntegrationHealth(true),
          getToolCatalog(),
          getActivity(),
        ]);
        const nextConversation = conversationResult.conversations[0] || await createConversation();
        if (!active) return;
        const latestPlan = planResult.plans.find((plan) => plan.conversationId === nextConversation.id) || null;
        setConversation(nextConversation);
        setPlanHistory(planResult.plans);
        setActivePlan(latestPlan);
        const firstStep = latestPlan?.steps.find((step) => step.adapterStatus === "live") || latestPlan?.steps[0];
        setSelectedStepId(firstStep?.id);
        if (firstStep) setChainId(firstStep.chainId);
        setHealth(nextHealth);
        setCatalog(toolResult.tools);
        setActivity(activityResult.events);
        if (nextHealth.diagnostics.warnings.length) setNotice({ type: "error", message: nextHealth.diagnostics.warnings[0] });
      } catch (error) {
        if (active) setNotice({ type: "error", message: error instanceof Error ? error.message : "YieldBot could not start." });
      } finally {
        if (active) setWorkingLabel(undefined);
      }
    }
    void bootstrap();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (chain.family === "evm" && evmAddress) {
      void switchEvmChain(chainId as "base" | "arbitrum")
        .then(() => readEvmBalance(evmAddress))
        .then((value) => setBalances((current) => ({ ...current, [chainId]: value })))
        .catch((error) => setNotice({ type: "error", message: error instanceof Error ? error.message : "Network switch failed." }));
    }
  }, [chainId, chain.family, evmAddress]);

  function showError(error: unknown) {
    setNotice({ type: "error", message: error instanceof Error ? error.message : "The operation failed." });
  }

  async function refreshActivity() {
    const result = await getActivity();
    setActivity(result.events);
  }

  async function refreshHealth() {
    try {
      setWorkingLabel("Checking integrations");
      setHealth(await getIntegrationHealth(true));
    } catch (error) { showError(error); }
    finally { setWorkingLabel(undefined); }
  }

  async function connectOrDisconnectWallet() {
    try {
      setWorkingLabel(walletConnected ? "Disconnecting wallet" : "Connecting wallet");
      if (chain.family === "casper") {
        if (casperPublicKey) {
          await disconnectCasperWallet();
          setCasperPublicKey("");
          setBalances((current) => ({ ...current, casper: undefined }));
          setNotice({ type: "success", message: "Casper Wallet disconnected from this session." });
        } else {
          const publicKey = await connectCasperWallet();
          setCasperPublicKey(publicKey);
          setNotice({ type: "success", message: "Casper Wallet connected. Ask YieldBot to read the live portfolio." });
        }
      } else if (evmAddress) {
        setEvmAddress("");
        setBalances((current) => ({ ...current, base: undefined, arbitrum: undefined }));
        setNotice({ type: "success", message: "EVM wallet disconnected from this YieldBot session." });
      } else {
        const result = await connectEvmWallet(chainId as "base" | "arbitrum");
        setEvmAddress(result.address);
        const balance = await readEvmBalance(result.address);
        setBalances((current) => ({ ...current, [chainId]: balance }));
        setNotice({ type: "success", message: `${chain.name} wallet connected.` });
      }
    } catch (error) { showError(error); }
    finally { setWorkingLabel(undefined); }
  }

  function rememberPlan(plan: AgentPlan) {
    setPlanHistory((current) => [plan, ...current.filter((candidate) => candidate.id !== plan.id)].slice(0, 20));
  }

  async function startNewConversation() {
    try {
      setWorkingLabel("Starting a new conversation");
      const nextConversation = await createConversation();
      setConversation(nextConversation);
      setActivePlan(null);
      setSelectedStepId(undefined);
      setPrepared(null);
      setInput("");
      await refreshActivity();
    } catch (error) { showError(error); }
    finally { setWorkingLabel(undefined); }
  }

  async function submitMessage(messageOverride?: string) {
    const message = (messageOverride ?? input).trim();
    if (!message || workingLabel) return;
    try {
      setInput("");
      setWorkingLabel("YieldBot is planning");
      const result = await sendAgentMessage(conversation?.id, message, {
        activeChain: chainId,
        casperPublicKey: casperPublicKey || undefined,
        evmAddress: evmAddress || undefined,
        visibleBalance: balances[chainId],
        riskPreference: "moderate",
      });
      setConversation(result.conversation);
      if (result.plan) {
        setActivePlan(result.plan);
        rememberPlan(result.plan);
        const first = result.plan.steps.find((step) => step.adapterStatus === "live") || result.plan.steps[0];
        setSelectedStepId(first?.id);
        setPrepared(null);
        if (first) setChainId(first.chainId);
      }
      await refreshActivity();
    } catch (error) { showError(error); }
    finally { setWorkingLabel(undefined); }
  }

  function walletAvailable(step: AgentPlanStep) {
    return step.chainId === "casper" ? Boolean(casperPublicKey) : Boolean(evmAddress);
  }

  function selectStep(step: AgentPlanStep) {
    setSelectedStepId(step.id);
    setPrepared((current) => current?.stepId === step.id ? current : null);
    setChainId(step.chainId);
  }

  async function prepareStep(step: AgentPlanStep) {
    try {
      const address = step.chainId === "casper" ? casperPublicKey : evmAddress;
      if (!address) throw new Error(`Connect the ${step.chainId === "casper" ? "Casper" : "EVM"} wallet first.`);
      setSelectedStepId(step.id);
      setChainId(step.chainId);
      setWorkingLabel("Preparing verified action");
      let nativeBalance: string | undefined;
      if (step.chainId !== "casper") {
        await switchEvmChain(step.chainId);
        nativeBalance = await readEvmBalance(evmAddress);
        setBalances((current) => ({ ...current, [step.chainId]: nativeBalance }));
      }
      const result = await preparePlanStep(activePlan!.id, step.id, address, { nativeBalance });
      setActivePlan(result.plan);
      rememberPlan(result.plan);
      setPrepared(result.prepared);
      if (result.prepared.evaluation?.decision === "allowed") {
        setNotice({ type: "success", message: "Magen3 allowed the prepared payload. Wallet signing is now available." });
      } else if (result.prepared.evaluation?.decision === "review-required") {
        setNotice({ type: "error", message: "Magen3 requires human review. Signing remains locked." });
      } else if (result.prepared.evaluation?.decision === "blocked") {
        setNotice({ type: "error", message: `Magen3 blocked this action: ${result.prepared.evaluation.reason}` });
      } else if (result.prepared.kind === "read-result") {
        setNotice({ type: "success", message: "Live read-only data retrieved." });
      }
      await refreshActivity();
    } catch (error) { showError(error); }
    finally { setWorkingLabel(undefined); }
  }

  async function executePrepared() {
    if (!activePlan || !selectedStep || !prepared || prepared.evaluation?.decision !== "allowed") return;
    if (prepared.expiresAt && Date.parse(prepared.expiresAt) <= Date.now()) {
      setNotice({ type: "error", message: "This quote and authorization expired. Prepare the step again." });
      return;
    }
    const expectedWallet = selectedStep.chainId === "casper" ? casperPublicKey : evmAddress;
    if (!expectedWallet || expectedWallet.toLowerCase() !== prepared.walletAddress.toLowerCase()) {
      setNotice({ type: "error", message: "The connected wallet does not match the wallet bound to this prepared action." });
      return;
    }
    try {
      setWorkingLabel("Waiting for wallet signature");
      if (prepared.kind === "casper") {
        const signed = await signCasperDeploy(prepared.transaction, casperPublicKey);
        setWorkingLabel("Submitting Casper transaction");
        const result = await submitCasperExecution({
          planId: activePlan.id,
          stepId: selectedStep.id,
          preparationId: prepared.id,
          signedTransaction: signed,
        });
        setActivePlan(result.plan);
        rememberPlan(result.plan);
        setNotice({ type: "success", message: `Casper transaction submitted: ${result.transactionHash}` });
      } else if (prepared.kind === "evm") {
        await switchEvmChain(selectedStep.chainId as "base" | "arbitrum");
        const transaction = { ...(prepared.transaction as Record<string, unknown>), from: evmAddress };
        const transactionHash = await sendEvmTransaction(transaction);
        setWorkingLabel("Recording execution receipt");
        const result = await recordExecutionReceipt({
          planId: activePlan.id,
          stepId: selectedStep.id,
          preparationId: prepared.id,
          status: "submitted",
          transactionHash,
        });
        setActivePlan(result.plan);
        rememberPlan(result.plan);
        const executionChain = CHAINS.find((item) => item.id === selectedStep.chainId);
        setNotice({ type: "success", message: `${executionChain?.name || selectedStep.chainId} transaction submitted: ${transactionHash}` });
        void waitForEvmReceipt(transactionHash)
          .then(async (status) => {
            const confirmed = await recordExecutionReceipt({
              planId: activePlan.id,
              stepId: selectedStep.id,
              preparationId: prepared.id,
              status,
              transactionHash,
              error: status === "failed" ? "The EVM transaction reverted on-chain." : undefined,
            });
            setActivePlan(confirmed.plan);
            rememberPlan(confirmed.plan);
            await refreshActivity();
            setNotice({ type: status === "confirmed" ? "success" : "error", message: status === "confirmed" ? "EVM transaction confirmed and reconciled with Magen3." : "The EVM transaction reverted on-chain." });
          })
          .catch((monitorError) => setNotice({ type: "error", message: monitorError instanceof Error ? monitorError.message : "Transaction monitoring stopped." }));
      }
      await refreshActivity();
    } catch (error) {
      showError(error);
      try {
        const failed = await recordExecutionReceipt({
          planId: activePlan.id,
          stepId: selectedStep.id,
          preparationId: prepared.id,
          status: "failed",
          error: error instanceof Error ? error.message : "Wallet execution failed.",
        });
        setActivePlan(failed.plan);
        rememberPlan(failed.plan);
        await refreshActivity();
      } catch {
        // The original wallet error is more useful to the user.
      }
    } finally { setWorkingLabel(undefined); }
  }

  const explorerLink = selectedStep?.transactionHash
    ? `${CHAINS.find((item) => item.id === selectedStep.chainId)?.explorer}/${selectedStep.chainId === "casper" ? "deploy" : "tx"}/${selectedStep.transactionHash}`
    : undefined;

  return (
    <main className="app-shell">
      <div className="grid-bg" />
      <Topbar health={health} workingLabel={workingLabel} />
      <div className="workspace">
        <Sidebar
          view={view}
          onView={setView}
          chainId={chainId}
          onChain={setChainId}
          casperPublicKey={casperPublicKey}
          evmAddress={evmAddress}
          health={health}
        />

        <section className="content-area">
          {view === "agent" && (
            <>
              <AgentHero
                chain={chain}
                walletConnected={walletConnected}
                walletAddress={walletAddress}
                balance={balances[chainId]}
                working={Boolean(workingLabel)}
                onConnect={() => void connectOrDisconnectWallet()}
              />
              <CapabilityStrip chain={chain} catalog={catalog} />
              <div className="agent-layout">
                <ChatWorkspace
                  chainId={chainId}
                  conversation={conversation}
                  input={input}
                  onInput={setInput}
                  onSubmit={() => void submitMessage()}
                  onPrompt={(value) => void submitMessage(value)}
                  onNewConversation={() => void startNewConversation()}
                  working={Boolean(workingLabel)}
                  activePlan={activePlan}
                />
                <div className="agent-side-stack">
                  <PlanSummary
                    plan={activePlan}
                    selectedStepId={selectedStepId}
                    onSelectStep={selectStep}
                    onPrepare={(step) => void prepareStep(step)}
                    walletAvailable={walletAvailable}
                    working={Boolean(workingLabel)}
                  />
                  <ExecutionPanel step={selectedStep} prepared={prepared} working={Boolean(workingLabel)} onExecute={() => void executePrepared()} explorerLink={explorerLink} />
                </div>
              </div>
            </>
          )}

          {view === "plans" && (
            <section className="view-stack">
              <div className="view-heading"><div><p className="eyebrow">Agent orchestration</p><h1>Plans</h1><p>Review every assumption, protocol, safety stage, and execution status before signing.</p></div></div>
              <div className="plans-workspace">
                <PlanHistory
                  plans={planHistory}
                  activePlanId={activePlan?.id}
                  onSelect={(plan) => {
                    setActivePlan(plan);
                    const first = plan.steps.find((step) => step.adapterStatus === "live") || plan.steps[0];
                    setSelectedStepId(first?.id);
                    setPrepared(null);
                    if (first) setChainId(first.chainId);
                  }}
                />
                <div className="plans-detail">
                  <PlanSummary
                    plan={activePlan}
                    selectedStepId={selectedStepId}
                    onSelectStep={selectStep}
                    onPrepare={(step) => void prepareStep(step)}
                    walletAvailable={walletAvailable}
                    working={Boolean(workingLabel)}
                    expanded
                  />
                  <ExecutionPanel step={selectedStep} prepared={prepared} working={Boolean(workingLabel)} onExecute={() => void executePrepared()} explorerLink={explorerLink} />
                </div>
              </div>
            </section>
          )}

          {view === "activity" && <ActivityView events={activity} refreshing={Boolean(workingLabel)} onRefresh={() => void refreshActivity().catch(showError)} />}
          {view === "integrations" && <IntegrationsView health={health} catalog={catalog} refreshing={Boolean(workingLabel)} onRefresh={() => void refreshHealth()} />}
        </section>
      </div>

      {notice && <div className={`toast ${notice.type}`}>{notice.type === "success" ? <CheckCircle2 size={17} /> : <AlertCircle size={17} />}<span>{notice.message}</span><button onClick={() => setNotice(undefined)} aria-label="Dismiss"><X size={15} /></button></div>}
    </main>
  );
}

export default App;
