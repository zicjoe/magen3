import test from "node:test";
import assert from "node:assert/strict";
import { createX402Authorization, applyX402AuthorizationEvent, assertX402AccountingInvariants } from "./x402MeteredPayments.mjs";

const audit = (mode="upto") => ({ id:"AUD-1", agentId:"AG-1", action:"x402 Payment", decision:"Allowed", originalIntent:{ action:{ x402:{ mode, scheme:mode, requestFingerprint:"a".repeat(64), paymentRequiredHash:"b".repeat(64), network:"eip155:84532", asset:"USDC", payTo:"0x1111111111111111111111111111111111111111", merchantDomain:"api.example.com", requestId:"req-1", amountAtomic:"1000", validUntil:"2030-01-01T00:00:00.000Z", unitPriceAtomic:"10", usageUnit:"request" }}}});
const policy = (modes=["exact","upto","metered"]) => ({ structuredRules:{ x402AllowedSchemes:modes }});

test("creates a bounded upto authorization",()=>{
 const a=createX402Authorization({auditLog:audit(),body:{maximumAuthorizedAtomic:"1000"},policy:policy(),now:new Date("2029-01-01T00:00:00Z")});
 assert.equal(a.state,"active"); assert.equal(a.remainingAuthorizationAtomic,"1000");
});

test("reserve capture settle release and refund preserve invariants",()=>{
 let a=createX402Authorization({auditLog:audit(),body:{maximumAuthorizedAtomic:"1000"},policy:policy(),now:new Date("2029-01-01T00:00:00Z")});
 for (const [i,type,amount] of [[1,"reserve","800"],[2,"capture","600"],[3,"settle","500"],[4,"release","200"],[5,"refund","100"]]) {
  a=applyX402AuthorizationEvent(a,{type,amountAtomic:amount,eventId:`e${i}`,idempotencyKey:`k${i}`},{now:new Date(`2029-01-01T00:0${i}:00Z`)}).authorization;
 }
 assert.deepEqual(assertX402AccountingInvariants(a).remaining,400n); assert.equal(a.refundedAtomic,"100");
});

test("prevents overcharge and settlement without capture",()=>{
 let a=createX402Authorization({auditLog:audit(),body:{maximumAuthorizedAtomic:"1000"},policy:policy(),now:new Date("2029-01-01T00:00:00Z")});
 assert.throws(()=>applyX402AuthorizationEvent(a,{type:"reserve",amountAtomic:"1001",eventId:"e",idempotencyKey:"k"},{now:new Date("2029-01-01T00:01:00Z")}),/exceeds maximum/);
 assert.throws(()=>applyX402AuthorizationEvent(a,{type:"settle",amountAtomic:"1",eventId:"e2",idempotencyKey:"k2"},{now:new Date("2029-01-01T00:01:00Z")}),/prior capture/);
});

test("metered usage charges exact base-unit quantity times unit price and deduplicates",()=>{
 let a=createX402Authorization({auditLog:audit("metered"),body:{maximumAuthorizedAtomic:"1000",unitPriceAtomic:"10",usageUnit:"request"},policy:policy(),now:new Date("2029-01-01T00:00:00Z")});
 a=applyX402AuthorizationEvent(a,{type:"reserve",amountAtomic:"1000",eventId:"r",idempotencyKey:"rk"},{now:new Date("2029-01-01T00:01:00Z")}).authorization;
 let result=applyX402AuthorizationEvent(a,{type:"usage",usageQuantity:"3",unitPriceAtomic:"10",eventId:"u1",idempotencyKey:"uk1",resourceId:a.resourceId,providerId:a.providerId,sessionId:a.sessionId},{now:new Date("2029-01-01T00:02:00Z")});
 assert.equal(result.authorization.capturedAtomic,"30"); assert.equal(result.authorization.cumulativeUsage,"3");
 const duplicate=applyX402AuthorizationEvent(result.authorization,{type:"usage",usageQuantity:"3",eventId:"u1",idempotencyKey:"uk-new"},{now:new Date("2029-01-01T00:03:00Z")});
 assert.equal(duplicate.duplicate,true); assert.equal(duplicate.authorization.capturedAtomic,"30");
});

test("blocks cross-resource usage and post-revocation activity",()=>{
 let a=createX402Authorization({auditLog:audit("metered"),body:{maximumAuthorizedAtomic:"1000",unitPriceAtomic:"10",usageUnit:"request"},policy:policy(),now:new Date("2029-01-01T00:00:00Z")});
 assert.throws(()=>applyX402AuthorizationEvent(a,{type:"usage",usageQuantity:"1",eventId:"u",idempotencyKey:"uk",resourceId:"other"},{now:new Date("2029-01-01T00:01:00Z")}),/resourceId/);
 a=applyX402AuthorizationEvent(a,{type:"revoke",eventId:"rv",idempotencyKey:"rvk"},{now:new Date("2029-01-01T00:02:00Z")}).authorization;
 assert.throws(()=>applyX402AuthorizationEvent(a,{type:"reserve",amountAtomic:"1",eventId:"r",idempotencyKey:"rk"},{now:new Date("2029-01-01T00:03:00Z")}),/revoked/);
});
