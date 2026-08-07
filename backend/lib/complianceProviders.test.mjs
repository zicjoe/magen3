import assert from 'node:assert/strict';
import test from 'node:test';
import { collectComplianceSubjects, getComplianceProviderCapabilities, resetComplianceProviderRuntime, screenComplianceSubjectsWithProviders } from './complianceProviders.mjs';

const ADDRESS='0x1111111111111111111111111111111111111111';
const REQUEST={executionWalletAddress:ADDRESS,target:'0x2222222222222222222222222222222222222222',network:'base-sepolia',chainId:'84532',actionType:'Transfer'};
function env(overrides={}){return {COMPLIANCE_PROVIDERS:'ofac_api',COMPLIANCE_OFAC_API_KEY:'test-secret',COMPLIANCE_PROVIDER_MAX_RETRIES:'0',...overrides};}
function response(payload,status=200){return new Response(JSON.stringify(payload),{status,headers:{'content-type':'application/json'}});}

test('collectComplianceSubjects is chain-aware and bounded',()=>{const items=collectComplianceSubjects(REQUEST);assert.equal(items.length,2);assert.equal(items[0].chainFamily,'evm');assert.match(items[0].canonical,/0x1111/i);});

test('OFAC-API adapter uses fixed server-controlled origin and keeps API key out of output',async()=>{resetComplianceProviderRuntime();let seenUrl='',seenHeaders={},seenBody={};const subjects=collectComplianceSubjects(REQUEST).slice(0,1);const result=await screenComplianceSubjectsWithProviders(subjects,{env:env(),now:new Date('2026-08-07T15:00:00Z'),fetchImpl:async(url,init)=>{seenUrl=String(url);seenHeaders=init.headers;seenBody=JSON.parse(init.body);return response({error:false,sources:[{source:'SDN'}],results:[{id:seenBody.cases[0].id,matchCount:0,matches:[]}]});}});assert.equal(seenUrl,'https://api.ofac-api.com/v4/screen');assert.equal(seenHeaders.apiKey,'test-secret');assert.equal(seenBody.cases[0].cryptoId,ADDRESS);assert.equal(result.providerEvidence[0].providerVerdict,'clear');assert.equal(JSON.stringify(result).includes('test-secret'),false);});

test('provider match is normalized as provider claim with confidence and evidence hash',async()=>{resetComplianceProviderRuntime();const subjects=collectComplianceSubjects(REQUEST).slice(0,1);const result=await screenComplianceSubjectsWithProviders(subjects,{env:env(),fetchImpl:async(_url,init)=>{const body=JSON.parse(init.body);return response({error:false,sources:[{source:'SDN'}],results:[{id:body.cases[0].id,matchCount:1,matches:[{score:99,matchSummary:{matchFields:[{similarity:'EXACT',fieldName:'cryptoId'}]},sanction:{id:'SAN-1',source:'SDN'}}]}]});}});const evidence=result.providerEvidence[0];assert.equal(evidence.providerVerdict,'match');assert.deepEqual(evidence.riskCategories,['sanctions-related']);assert.equal(evidence.providerConfidence,99);assert.match(evidence.evidenceHash,/^[a-f0-9]{64}$/);});

test('missing credentials is explicit and never represented as clear',async()=>{const result=await screenComplianceSubjectsWithProviders(collectComplianceSubjects(REQUEST).slice(0,1),{env:env({COMPLIANCE_OFAC_API_KEY:''}),fetchImpl:async()=>{throw new Error('must not fetch');}});assert.equal(result.providerEvidence.length,0);assert.equal(result.providerStatuses[0].status,'authentication_unavailable');});

test('malformed provider response is unavailable, not a clean screening',async()=>{resetComplianceProviderRuntime();const result=await screenComplianceSubjectsWithProviders(collectComplianceSubjects(REQUEST).slice(0,1),{env:env(),fetchImpl:async()=>new Response('{bad',{status:200})});assert.equal(result.providerEvidence.length,0);assert.equal(result.providerStatuses[0].status,'unavailable');});

test('capability discovery exposes fixed provider origin without credential value',()=>{const capabilities=getComplianceProviderCapabilities({env:env()});assert.equal(capabilities[0].serverControlledOrigin,'https://api.ofac-api.com');assert.equal(capabilities[0].configured,true);assert.equal(JSON.stringify(capabilities).includes('test-secret'),false);});
