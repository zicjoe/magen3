import { createHash } from 'node:crypto';
import { canonicalAssetReference } from './assetIdentity.mjs';
import { normalizeDecimal, pythPriceToDecimal } from './oracleDecimal.mjs';

const PYTH_HERMES_ORIGIN = 'https://hermes.pyth.network';
const DEFAULT_TIMEOUT_MS = 2500;
const DEFAULT_MAX_RESPONSE_BYTES = 512_000;
const DEFAULT_CACHE_TTL_MS = 15_000;
const DEFAULT_RATE_LIMIT_PER_MINUTE = 120;
const DEFAULT_CIRCUIT_FAILURES = 4;
const DEFAULT_CIRCUIT_OPEN_MS = 30_000;
const cache = new Map();
const runtime = new Map();

function clean(value) { return String(value ?? '').trim(); }
function safeInteger(value, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) { const parsed = Number(value); return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.trunc(parsed))) : fallback; }
function envBool(value, fallback = false) { if (value === undefined || value === null || value === '') return fallback; return ['1','true','yes','on'].includes(clean(value).toLowerCase()); }
function stable(value) { if (Array.isArray(value)) return value.map(stable); if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])])); return value; }
function hashEvidence(value) { return createHash('sha256').update(JSON.stringify(stable(value))).digest('hex'); }
function providerRuntime(id) { if (!runtime.has(id)) runtime.set(id, { failures: 0, circuitOpenUntil: 0, calls: [] }); return runtime.get(id); }
function noteSuccess(id) { Object.assign(providerRuntime(id), { failures: 0, circuitOpenUntil: 0 }); }
function noteFailure(id, env, nowMs) { const state = providerRuntime(id); state.failures += 1; const threshold = safeInteger(env.ORACLE_PROVIDER_CIRCUIT_FAILURE_THRESHOLD, DEFAULT_CIRCUIT_FAILURES, { min: 1, max: 20 }); if (state.failures >= threshold) state.circuitOpenUntil = nowMs + safeInteger(env.ORACLE_PROVIDER_CIRCUIT_OPEN_MS, DEFAULT_CIRCUIT_OPEN_MS, { min: 1000, max: 3600000 }); }
function ensureCircuit(id, nowMs) { if (providerRuntime(id).circuitOpenUntil > nowMs) throw Object.assign(new Error('Oracle provider circuit is open after repeated failures'), { code: 'CIRCUIT_OPEN' }); }
function rateLimit(id, env, nowMs) { const state = providerRuntime(id); const limit = safeInteger(env.ORACLE_PROVIDER_RATE_LIMIT_PER_MINUTE, DEFAULT_RATE_LIMIT_PER_MINUTE, { min: 1, max: 10000 }); state.calls = state.calls.filter((ts) => nowMs - ts < 60000); if (state.calls.length >= limit) throw Object.assign(new Error('Oracle provider rate limit reached'), { code: 'RATE_LIMITED' }); state.calls.push(nowMs); }
function redact(error) { return clean(error instanceof Error ? error.message : error).replace(/[?&](api[_-]?key|key|token|secret)=[^&\s]+/gi, '$1=[REDACTED]').slice(0,240) || 'Oracle provider request failed'; }

async function readBodyLimited(response, maxBytes) {
  const length = Number(response.headers?.get?.('content-length'));
  if (Number.isFinite(length) && length > maxBytes) throw new Error(`Oracle provider response exceeds ${maxBytes} bytes`);
  if (!response.body || typeof response.body.getReader !== 'function') { const raw = await response.text(); if (Buffer.byteLength(raw, 'utf8') > maxBytes) throw new Error(`Oracle provider response exceeds ${maxBytes} bytes`); return raw; }
  const reader = response.body.getReader(); const decoder = new TextDecoder(); let bytes = 0; let raw = '';
  try { while (true) { const {done,value} = await reader.read(); if (done) break; bytes += value.byteLength; if (bytes > maxBytes) { await reader.cancel().catch(()=>{}); throw new Error(`Oracle provider response exceeds ${maxBytes} bytes`); } raw += decoder.decode(value,{stream:true}); } raw += decoder.decode(); return raw; } finally { reader.releaseLock(); }
}
function parseJson(raw) { let value; try { value = JSON.parse(raw); } catch { throw new Error('Oracle provider returned malformed JSON'); } if (!Array.isArray(value)) throw new Error('Oracle provider returned an invalid response shape'); return value; }

function normalizePairRequest(request = {}) {
  const baseAsset = clean(request.oracleBaseAsset || request.asset).toUpperCase();
  const quoteAsset = clean(request.oracleQuoteAsset || request.outputAsset).toUpperCase();
  const pair = baseAsset && quoteAsset && baseAsset !== quoteAsset ? `${baseAsset}/${quoteAsset}` : '';
  const baseIdentity = canonicalAssetReference({ ...request, symbol: baseAsset, asset: baseAsset });
  return { baseAsset, quoteAsset, pair, canonicalAssetId: baseIdentity.canonicalId, chainFamily: baseIdentity.chainFamily, chainId: baseIdentity.chainId, network: baseIdentity.network };
}
function loadFeedMap(env) {
  const raw = clean(env.ORACLE_PYTH_FEED_MAP_JSON);
  if (!raw) return {};
  let value; try { value = JSON.parse(raw); } catch { throw new Error('ORACLE_PYTH_FEED_MAP_JSON is not valid JSON'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('ORACLE_PYTH_FEED_MAP_JSON must be a JSON object');
  const output = {};
  for (const [key,val] of Object.entries(value).slice(0,1000)) { const feedId = clean(typeof val === 'object' ? val.feedId : val).replace(/^0x/i,'').toLowerCase(); if (/^[a-f0-9]{64}$/.test(feedId)) output[clean(key)] = feedId; }
  return output;
}
function resolveFeed(pair, env) {
  const mapping = loadFeedMap(env);
  const candidates = [pair.canonicalAssetId, pair.pair, `${pair.chainFamily}:${pair.chainId}:${pair.pair}`, pair.baseAsset].filter(Boolean);
  for (const key of candidates) if (mapping[key]) return { feedId: mapping[key], mappingKey: key };
  return null;
}

export const oracleProviderRegistry = Object.freeze({
  pyth_hermes: Object.freeze({ id:'pyth_hermes', name:'Pyth Network Hermes', version:'v2-latest-price-feeds', authentication:'none', capabilities:['latest_price','confidence_interval','publish_time','feed_id'], chainFamilies:['chain-agnostic-feed'], serverControlledOrigin: PYTH_HERMES_ORIGIN }),
});
function configuredProviderIds(env = process.env) { const explicit = clean(env.ORACLE_PROVIDERS); if (explicit) return [...new Set(explicit.split(',').map(v=>clean(v).toLowerCase()).filter(Boolean))]; return envBool(env.ORACLE_PYTH_ENABLED,false) ? ['pyth_hermes'] : []; }
export function getOracleProviderCapabilities({env=process.env}={}) { const enabled = new Set(configuredProviderIds(env)); return Object.values(oracleProviderRegistry).map((provider)=>{ const state=providerRuntime(provider.id); let configured=false; try { configured = provider.id==='pyth_hermes' && enabled.has(provider.id) && Object.keys(loadFeedMap(env)).length>0; } catch {} return {...provider,enabled:enabled.has(provider.id),configured,health:state.circuitOpenUntil>Date.now()?'degraded':'ready',circuitOpenUntil:state.circuitOpenUntil?new Date(state.circuitOpenUntil).toISOString():''}; }); }

function normalizePyth(payload, pair, mapping, { now, cached=false }={}) {
  const record = payload[0]; if (!record || typeof record !== 'object') throw new Error('Pyth returned no matching price feed');
  const id = clean(record.id).replace(/^0x/i,'').toLowerCase(); if (id !== mapping.feedId) throw new Error('Pyth feed identifier did not match the configured asset mapping');
  const priceData = record.price && typeof record.price === 'object' ? record.price : null; if (!priceData) throw new Error('Pyth response is missing price data');
  const normalizedPrice = pythPriceToDecimal(priceData.price, priceData.expo);
  const confidenceRaw = clean(priceData.conf);
  if (!/^\d+$/.test(confidenceRaw)) throw new Error('Pyth confidence interval is invalid');
  const confidenceInterval = BigInt(confidenceRaw) === 0n ? '0' : pythPriceToDecimal(confidenceRaw, priceData.expo);
  const publishSeconds = Number(priceData.publish_time); if (!Number.isInteger(publishSeconds) || publishSeconds <= 0) throw new Error('Pyth publish time is invalid');
  const observedAt = new Date(publishSeconds*1000); if (!Number.isFinite(observedAt.getTime()) || observedAt.getTime() > now.getTime()+60000) throw new Error('Pyth publish time is impossible');
  const core = { provider:'Pyth Network', providerId:'pyth_hermes', providerVersion:'v2-latest-price-feeds', canonicalAssetId:pair.canonicalAssetId, baseAsset:pair.baseAsset, quoteAsset:pair.quoteAsset, pair:pair.pair, feedIdentifier:id, chainFamily:pair.chainFamily, chainId:pair.chainId, rawPrice:clean(priceData.price), normalizedPrice, feedExponent:Number(priceData.expo), confidenceInterval, roundId:'', updateTimestamp:observedAt.toISOString(), retrievalTimestamp:now.toISOString(), evidenceAgeMs:Math.max(0,now.getTime()-observedAt.getTime()), providerReference:`pyth:${id}`, cached, fallback:false, providerDisagreement:false, normalizationStatus:'normalized', mappingKey:mapping.mappingKey };
  return {...core,evidenceHash:hashEvidence(core), observation:{ id:`pyth-${id.slice(0,16)}`,pair:pair.pair,baseAsset:pair.baseAsset,quoteAsset:pair.quoteAsset,price:Number(normalizedPrice),normalizedPrice,confidence:100,confidenceInterval,source:'Pyth Network',providerId:'pyth_hermes',providerVersion:'v2-latest-price-feeds',feedIdentifier:id,observedAt:observedAt.toISOString(),retrievalTimestamp:now.toISOString(),evidenceHash:hashEvidence(core),cached }};
}

async function fetchPyth(pair, mapping, {env,fetchImpl,now}) {
  const nowMs=now.getTime(); ensureCircuit('pyth_hermes',nowMs); rateLimit('pyth_hermes',env,nowMs);
  const cacheKey=`pyth_hermes|${pair.canonicalAssetId}|${pair.pair}|${mapping.feedId}`; const ttl=safeInteger(env.ORACLE_PROVIDER_CACHE_TTL_MS,DEFAULT_CACHE_TTL_MS,{min:1000,max:3600000}); const hit=cache.get(cacheKey); if (hit && nowMs-hit.at<ttl) return {...hit.value,cached:true,observation:{...hit.value.observation,cached:true}};
  const url=new URL('/api/latest_price_feeds',PYTH_HERMES_ORIGIN); url.searchParams.append('ids[]',mapping.feedId); const timeoutMs=safeInteger(env.ORACLE_PROVIDER_TIMEOUT_MS,DEFAULT_TIMEOUT_MS,{min:250,max:15000}); const maxBytes=safeInteger(env.ORACLE_PROVIDER_MAX_RESPONSE_BYTES,DEFAULT_MAX_RESPONSE_BYTES,{min:1024,max:2000000}); const retries=safeInteger(env.ORACLE_PROVIDER_MAX_RETRIES,1,{min:0,max:2}); let lastError;
  for(let attempt=0;attempt<=retries;attempt+=1){ const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),timeoutMs); try { const response=await fetchImpl(url,{headers:{Accept:'application/json'},signal:controller.signal,redirect:'error'}); if(!response.ok) throw new Error(`Pyth Hermes returned HTTP ${response.status}`); const normalized=normalizePyth(parseJson(await readBodyLimited(response,maxBytes)),pair,mapping,{now}); noteSuccess('pyth_hermes'); cache.set(cacheKey,{at:nowMs,value:normalized}); return normalized; } catch(error){ lastError=error; if(attempt<retries) await new Promise(resolve=>setTimeout(resolve,Math.min(250*(2**attempt),1000))); } finally { clearTimeout(timer); } }
  noteFailure('pyth_hermes',env,nowMs); throw lastError;
}

export async function collectOracleProviderEvidence({request={},env=process.env,fetchImpl=globalThis.fetch,now=new Date()}={}) {
  const pair=normalizePairRequest(request); const providerStatuses=[]; const evidence=[]; const observations=[]; const configured=configuredProviderIds(env);
  if(!pair.pair) return {pair,configuredProviderIds:configured,providerStatuses:[{providerId:'oracle',status:'unsupported',reason:'A base asset and quote asset are required for provider-backed oracle evidence.'}],evidence,observations};
  for(const providerId of configured){ if(providerId!=='pyth_hermes'){providerStatuses.push({providerId,status:'unsupported',reason:'Unknown oracle provider identifier.'});continue;} let mapping; try{mapping=resolveFeed(pair,env);}catch(error){providerStatuses.push({providerId,status:'invalidated',reason:redact(error)});continue;} if(!mapping){providerStatuses.push({providerId,status:'unsupported',reason:`No server-controlled Pyth feed mapping is configured for ${pair.pair}.`});continue;} if(typeof fetchImpl!=='function'){providerStatuses.push({providerId,status:'unavailable',reason:'Fetch support is unavailable.'});continue;} try{const item=await fetchPyth(pair,mapping,{env,fetchImpl,now});evidence.push(item);observations.push(item.observation);providerStatuses.push({providerId,status:'available',feedIdentifier:item.feedIdentifier,cached:item.cached});}catch(error){const code=error?.name==='AbortError'?'timed_out':error?.code==='RATE_LIMITED'?'rate_limited':error?.code==='CIRCUIT_OPEN'?'degraded':'unavailable';providerStatuses.push({providerId,status:code,reason:redact(error)});} }
  return {pair,configuredProviderIds:configured,providerStatuses,evidence,observations};
}
export function resetOracleProviderRuntime(){cache.clear();runtime.clear();}
