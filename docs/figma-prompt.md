Build a professional production-style Web3 security dashboard frontend for a product called Magen3.

Product description:
Magen3 is a Web3 execution firewall for autonomous AI agents, smart contracts, DAOs, RWA protocols, and oracle-driven actions. It checks important Web3 actions before they happen, decides whether they should be Allowed, Blocked, or Review Required, and records the decision on Casper Testnet.

Design style:
Use a premium dark cyber-security theme. The product should feel like a serious Web3 infrastructure/security app, not a meme coin app or generic DeFi dashboard.

Color palette:

* Primary background: #050B14
* Secondary background: #0B1220
* Card background: #111827
* Primary accent: #22D3EE
* Casper accent: #FF3B3B
* Success: #22C55E
* Warning: #F59E0B
* Danger: #EF4444
* Primary text: #F8FAFC
* Secondary text: #94A3B8
* Border: #1E293B

Typography:
Use a clean modern SaaS/security font style. Large confident headings, readable body text, clear labels, and professional spacing.

Frontend stack:
Generate a clean React + TypeScript frontend using Vite-style structure and TailwindCSS. Use reusable components and clean file organization. Do not create backend logic. Use mock data only, but structure the mock data in a way that can easily be replaced by API calls later.

Important developer requirement:
The frontend must be easy to wire to a backend, Casper wallet connection, Casper Testnet transactions, and AI/policy decision logic later. Avoid messy hardcoded logic inside UI components.

Create the following app pages:

1. Landing Page
    Purpose: Explain Magen3 clearly and professionally.
    Sections:

* Hero section
* Problem section
* How Magen3 works
* Shield modules section
* Demo/security preview section
* Call-to-action to launch app

Hero copy:
“Magen3 is a Web3 execution firewall for autonomous agents.”
Subtext:
“Protect wallets, AI agents, smart contracts, DAOs, RWA protocols, and oracle-driven actions before unsafe execution reaches the blockchain.”

Primary CTA:
“Launch App”
Secondary CTA:
“View Audit Demo”

Shield modules to show:

* Agent Shield: Protect wallets and protocols from unsafe AI-agent actions.
* Contract Shield: Analyze risky smart-contract interactions, upgrades, and admin permission changes.
* DAO Shield: Verify that treasury execution matches approved governance decisions.
* RWA Shield: Check asset verification, proof expiry, and risk status before protocol action.
* Oracle Shield: Detect suspicious data updates before they trigger on-chain decisions.

2. App Dashboard
    Purpose: Security command center after wallet connection.
    Include:

* Sidebar navigation
* Top bar with Connect Wallet button
* Network badge showing Casper Testnet
* Wallet protection status
* Dashboard cards:
    * Active Shields
    * Protected Actions
    * Blocked Actions
    * Review Required
    * Casper Audit Records
* Recent activity table
* Risk overview panel
* Active policy summary

Dashboard should show both connected and not-connected states. When wallet is not connected, show a professional empty state asking user to connect wallet.

3. Shields Page
    Purpose: Show available and future protection modules.
    Cards:

* Agent Shield — Available
* Contract Shield — Preview
* DAO Shield — Preview
* RWA Shield — Preview
* Oracle Shield — Preview

Each shield card should include:

* Shield name
* Short description
* Status badge
* Risk category
* “Open Shield” or “Coming Soon” button

4. Agent Shield Page
    Purpose: Register an AI agent and manage protection setup.
    Sections:

* Agent registration form
* Existing protected agents list
* Policy status card
* Agent activity preview

Agent registration fields:

* Agent Name
* Agent Type dropdown: DeFi Agent, Trading Agent, Treasury Agent, RWA Agent, Oracle Agent, Custom Agent
* Agent Purpose
* Permission Level dropdown: Read Only, Limited Execution, Full Execution with Review
* Save/Register Agent button

Use mock agent:
Agent Name: YieldBot
Agent Type: DeFi Agent
Purpose: Manage staking and yield actions
Agent ID: MAG-AGENT-001
Status: Policy Active

5. Policies Page
    Purpose: Create and manage firewall rules.
    Include a policy creation form with:

* Policy Name
* Maximum Transaction Amount
* Daily Spending Limit
* Trusted Contracts textarea/list input
* Blocked Actions multi-select
* Approval Required Above amount
* Risk Mode dropdown: Conservative, Balanced, Aggressive
* Activate Policy button

Also include policy cards showing:

* Policy name
* Connected agent
* Risk mode
* Max transaction amount
* Daily limit
* Status
* Created date
* Policy hash placeholder

Use mock policy:
Policy Name: Safe DeFi Policy
Agent: YieldBot
Maximum Transaction: 50 CSPR
Daily Limit: 200 CSPR
Approval Required Above: 100 CSPR
Risk Mode: Balanced
Status: Active

6. Action Review Page
    Purpose: Simulate an AI agent requesting a Web3 action and Magen3 reviewing it.
    Include:

* Action request form
* Agent selector
* Action type dropdown: Stake, Transfer, Swap, Claim Rewards, Deposit to Vault, Contract Interaction, DAO Treasury Payment, RWA Proof Update, Oracle Data Update
* Amount input
* Target address/contract input
* Target type dropdown: Trusted Contract, Unknown Contract, Wallet Address, DAO Treasury, RWA Registry, Oracle Feed
* Analyze Action button

After analysis, show decision result card:
Decision can be:

* Allowed
* Blocked
* Review Required

Decision result should include:

* Risk level
* Policy checks passed/failed
* Reason
* Recommended next step
* Record Decision on Casper button

Create three mock examples:
Example 1:
Agent: YieldBot
Action: Stake
Amount: 25 CSPR
Target: trusted staking contract
Decision: Allowed
Risk: Low
Reason: Amount is within policy limit and target contract is trusted.

Example 2:
Agent: YieldBot
Action: Transfer
Amount: 500 CSPR
Target: unknown contract
Decision: Blocked
Risk: High
Reason: Amount exceeds max transaction limit and target is not trusted.

Example 3:
Agent: YieldBot
Action: Deposit to Vault
Amount: 120 CSPR
Target: trusted yield vault
Decision: Review Required
Risk: Medium
Reason: Target is trusted, but amount is above approval threshold.

7. Audit Log Page
    Purpose: Show every Magen3 security decision recorded or ready to be recorded on Casper.
    Include:

* Search/filter bar
* Filter by Shield Type
* Filter by Decision
* Filter by Risk
* Audit table with columns:
    * Time
    * Shield
    * Source/Agent
    * Action
    * Amount
    * Decision
    * Risk
    * Transaction Hash
* Detail drawer/modal for each audit record

Audit record detail should show:

* Decision ID
* Wallet Address
* Agent ID
* Policy Used
* Shield Type
* Action Type
* Target
* Amount
* Decision
* Risk Score
* Reason
* Transaction Hash placeholder
* Timestamp

8. Settings Page
    Purpose: Basic app settings.
    Include:

* Network setting: Casper Testnet
* Default risk mode
* Notification preferences
* API/Integration placeholder
* Developer mode toggle

Navigation:
Use a left sidebar with:

* Dashboard
* Shields
* Agent Shield
* Policies
* Action Review
* Audit Log
* Settings

Top bar:

* Product name/logo: Magen3
* Network badge: Casper Testnet
* Connect Wallet button
* Wallet address placeholder when connected
* Protection status badge

Component requirements:
Create reusable components:

* Sidebar
* TopBar
* StatCard
* ShieldCard
* PolicyCard
* AgentCard
* DecisionBadge
* RiskBadge
* AuditTable
* ActionReviewPanel
* EmptyState
* Button
* Input
* Select
* Modal/Drawer

Data structure requirement:
Put mock data in a separate file or clearly separated section so it can later be replaced with real backend/API data.

Please create mock TypeScript-style objects for:

* agents
* policies
* actionRequests
* auditLogs
* dashboardStats
* shieldModules

Integration-readiness requirement:
Name buttons and handlers clearly:

* connectWallet
* registerAgent
* createPolicy
* analyzeAction
* recordDecisionOnChain
* approveOnce
* rejectAction
* updatePolicy

Do not make the UI depend on real wallet or real blockchain calls yet. Use placeholders and mock states. The exported code should be clean enough for a developer to later wire:

* Casper wallet connection
* backend API
* AI decision engine
* Casper Testnet contract calls
* audit log persistence

Visual details:
Use glassy dark cards, subtle cyan glow, thin borders, professional spacing, and clean security-style badges.
Allowed decisions should be green.
Blocked decisions should be red.
Review Required decisions should be amber.
Primary buttons should use electric cyan.
Danger actions should use red.
Use icons where useful, but keep the design professional and lightweight.

Responsive behavior:
Make it work well on desktop first, but also responsive for tablet and mobile.

Important:
Do not create a simple one-page landing page only. Build the full multi-page app shell with routing/navigation and realistic mock data. The final result should feel like a real Web3 security SaaS product ready for backend and blockchain wiring.