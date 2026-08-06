import test from "node:test";
import assert from "node:assert/strict";
import { evaluateAction } from "./policyEngine.mjs";
const agent={id:"a",status:"Active",executionCapabilities:["Trading"]};
const basePolicy={id:"p",agentId:"a",status:"Active",mode:"Enforce",allowedActions:["Swap"],blockedActions:[],maxTransaction:1000,dailyLimit:10000,structuredRules:{mevExecutionQuality:{enabled:true,maxQuoteAgeSeconds:60,maxSlippageBps:300}}};
const request={agentId:"a",actionType:"Swap",amount:10,target:"0x1111111111111111111111111111111111111111",targetType:"Trusted Contract",expectedOutput:100,minimumReceived:90,executionQuoteTimestamp:new Date().toISOString(),executionChannel:"private",privateExecutionAvailable:true};
test("policy engine blocks excessive swap slippage",()=>{const r=evaluateAction({request,agents:[agent],policies:[basePolicy],auditLogs:[]});assert.equal(r.decision,"Blocked");assert.ok(r.moduleFindings.some(f=>f.module==="MEV & Execution Quality"&&f.rule==="Slippage protection"));});
test("successful execution quality does not override another block",()=>{const r=evaluateAction({request:{...request,minimumReceived:99,actionType:"Swap"},agents:[agent],policies:[{...basePolicy,blockedActions:["Swap"]}],auditLogs:[]});assert.equal(r.decision,"Blocked");});
