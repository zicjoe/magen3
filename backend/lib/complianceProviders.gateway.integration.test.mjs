import assert from 'node:assert/strict';
import test from 'node:test';

process.env.CASPER_RECORDING_MODE='manual';
process.env.CASPER_CHAIN_NAME='casper-test';
process.env.COMPLIANCE_PROVIDERS='ofac_api';
process.env.COMPLIANCE_OFAC_API_KEY='integration-secret';
process.env.COMPLIANCE_PROVIDER_MAX_RETRIES='0';
process.env.COMPLIANCE_CONTROLS_FEED_JSON='';
process.env.COMPLIANCE_CONTROLS_FEED_PATH='';
process.env.COMPLIANCE_CONTROLS_FEED_URL='';

const { resetComplianceControlsCache } = await import('./complianceControls.mjs');
const { createMemoryStore } = await import('../store/memoryStore.mjs');

const OWNER=`01${'1'.repeat(64)}`;
const EXECUTION=`01${'2'.repeat(64)}`;
const TARGET=`01${'3'.repeat(64)}`;

test('request-scoped compliance provider evidence reaches the real Gateway, Risk Assessment, and audit', async () => {
  resetComplianceControlsCache();
  const originalFetch=globalThis.fetch;
  const requests=[];
  globalThis.fetch=async (url, init={}) => {
    if (String(url)==='https://api.ofac-api.com/v4/screen') {
      requests.push({url:String(url),headers:init.headers,body:JSON.parse(init.body)});
      const id=JSON.parse(init.body).cases[0].id;
      return new Response(JSON.stringify({error:false,sources:[{source:'SDN'}],results:[{id,matchCount:0,matches:[]}]}),{status:200,headers:{'content-type':'application/json'}});
    }
    return originalFetch(url,init);
  };
  try {
    const store=createMemoryStore();
    const agent=await store.createAgent({name:'Compliance Provider Agent',type:'Treasury Agent',purpose:'Milestone 27 gateway integration',permissionLevel:'Limited Execution',walletAddress:OWNER,executionCapabilities:['Treasury Operations','Wallet Management']});
    await store.createPolicy({name:'Compliance Provider Policy',agentId:agent.id,walletAddress:OWNER,maxTransaction:100,dailyLimit:500,approvalThreshold:80,trustedContracts:[TARGET],blockedActions:[],riskMode:'Balanced',structuredRules:{complianceControlsEnabled:true,complianceControlMode:'Review',complianceProviderRequired:true,complianceProviderUnavailableAction:'Block',complianceAllowedProviders:['ofac_api'],complianceMinimumProviderConfidence:95,complianceMaxProviderEvidenceAgeSeconds:3600,complianceRequireSanctionsScreening:false,threatIntelligenceMode:'Observe',threatIntelligenceUnavailableAction:'Warn',oracleValidationMode:'Observe',oracleValidationUnavailableAction:'Warn'}});
    const response=await store.submitAgentGatewayIntent({source:'m27-provider-test',agentId:agent.id,executionWalletAddress:EXECUTION,network:'casper-testnet',chainId:'casper-test',action:{type:'Transfer',amount:5,asset:'CSPR',target:TARGET,targetType:'Wallet Address',preflight:{paymentAmountMotes:'5000000000',gasPriceTolerance:1,ttl:'30m',timestamp:new Date().toISOString()}}},{apiKey:agent.apiKey});
    assert.equal(response.result.decision,'Allowed');
    assert.ok(requests.length>=1);
    assert.equal(requests[0].url,'https://api.ofac-api.com/v4/screen');
    assert.equal(requests[0].headers.apiKey,'integration-secret');
    assert.equal(JSON.stringify(response).includes('integration-secret'),false);
    assert.equal(response.result.complianceControlsContext.availableProviderIds.includes('ofac_api'),true);
    assert.equal(response.result.moduleFindings.some(item=>item.module==='Compliance Controls' && item.rule==='Compliance provider screening'),true);
    assert.equal(response.auditLog.moduleFindings.some(item=>item.module==='Compliance Controls' && item.rule==='Compliance provider screening'),true);
    assert.equal(response.result.pipelineStages.some(stage=>stage.id==='compliance-controls'),true);
  } finally {
    globalThis.fetch=originalFetch;
    resetComplianceControlsCache();
  }
});
