import {FAMILY_NOTICE} from './family-policy.mjs';
// Adapter contract for a real VPC service, not a consent simulator. The URL and
// bearer key are server-only. No deployment may enable this using the test fake.
export function consentProvider(url, key, fetcher = fetch) {
  return async (operation, payload) => {
    if (!url || !key || new URL(url).protocol !== 'https:') throw Error('Parent verification is not configured yet. Solo play is available.');
    const response = await fetcher(url, {method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},
      body:JSON.stringify({operation,noticeVersion:FAMILY_NOTICE,...payload}),signal:AbortSignal.timeout(15000)});
    if (!response.ok) throw Error('Parent verification could not be completed.');
    return response.json();
  };
}
export function verifiedConsent(value, deviceHash, now = Date.now()) {
  if (!value || value.verified !== true || value.noticeVersion !== FAMILY_NOTICE || value.deviceHash !== deviceHash ||
    !/^[a-f0-9]{64}$/.test(deviceHash) || typeof value.receipt !== 'string' || !value.receipt || value.receipt.length>200 ||
    typeof value.guardian !== 'string' || !value.guardian || value.guardian.length>200 ||
    !Number.isFinite(Date.parse(value.expiresAt)) || Date.parse(value.expiresAt)<=now) throw Error('Parent approval is missing, expired or does not belong to this device.');
  return {receipt:value.receipt,guardian:value.guardian,deviceHash,notice:FAMILY_NOTICE,
    expiresAt:value.expiresAt,online:value.online === true,social:value.social === true,rematches:value.rematches === true};
}
