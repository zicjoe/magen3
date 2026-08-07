import assert from 'node:assert/strict';
import test from 'node:test';
import { collectOracleProviderEvidence, getOracleProviderCapabilities, resetOracleProviderRuntime } from './oracleProviders.mjs';
import { deviationBps, pythPriceToDecimal } from './oracleDecimal.mjs';

const FEED='a'.repeat(64);
const REQUEST={oracleBaseAsset:'ETH',oracleQuoteAsset:'USD',asset:'ETH',outputAsset:'USD',chainName:'base-sepolia',chainFamily:'EVM',chainId:'84532'};
function env(overrides={}){return {ORACLE_PROVIDERS:'pyth_hermes',ORACLE_PYTH_FEED_MAP_JSON:JSON.stringify({'ETH/USD':FEED}),ORACLE_PROVIDER_MAX_RETRIES:'0',...overrides};}
function response(body,status=200){return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});}

test('Pyth decimal normalization is exact and integer-safe',()=>{assert.equal(pythPriceToDecimal('351234567890','-8'),'3512.3456789');assert.equal(deviationBps('3512.3456789','3512.3456789'),0);});

test('Pyth Hermes adapter uses fixed server-controlled origin and normalized evidence',async()=>{resetOracleProviderRuntime();let seen='';const result=await collectOracleProviderEvidence({request:REQUEST,env:env(),now:new Date('2026-08-07T12:00:00Z'),fetchImpl:async(url)=>{seen=String(url);return response([{id:FEED,price:{price:'351234567890',conf:'1200000',expo:-8,publish_time:1786104000}}]);}});assert.match(seen,/^https:\/\/hermes\.pyth\.network\/api\/latest_price_feeds/);assert.equal(result.evidence[0].normalizedPrice,'3512.3456789');assert.equal(result.evidence[0].feedIdentifier,FEED);assert.equal(result.observations[0].providerId,'pyth_hermes');assert.equal(result.providerStatuses[0].status,'available');});

test('asset/feed mapping is required and unsupported state is explicit',async()=>{const result=await collectOracleProviderEvidence({request:REQUEST,env:env({ORACLE_PYTH_FEED_MAP_JSON:'{}'}),fetchImpl:async()=>{throw new Error('must not fetch');}});assert.equal(result.observations.length,0);assert.equal(result.providerStatuses[0].status,'unsupported');});

test('feed substitution is rejected',async()=>{const result=await collectOracleProviderEvidence({request:REQUEST,env:env(),fetchImpl:async()=>response([{id:'b'.repeat(64),price:{price:'1',conf:'1',expo:0,publish_time:Date.now()/1000|0}}])});assert.equal(result.observations.length,0);assert.equal(result.providerStatuses[0].status,'unavailable');assert.match(result.providerStatuses[0].reason,/feed identifier/i);});

test('malformed provider JSON is unavailable, never a clean zero-price result',async()=>{const result=await collectOracleProviderEvidence({request:REQUEST,env:env(),fetchImpl:async()=>new Response('{bad',{status:200})});assert.equal(result.observations.length,0);assert.equal(result.providerStatuses[0].status,'unavailable');});

test('capability discovery exposes Pyth without credentials',()=>{const caps=getOracleProviderCapabilities({env:env()});assert.equal(caps[0].id,'pyth_hermes');assert.equal(caps[0].enabled,true);assert.equal(caps[0].configured,true);assert.equal(caps[0].serverControlledOrigin,'https://hermes.pyth.network');});
