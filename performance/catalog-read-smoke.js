import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

const baseUrl = (__ENV.AVERON_BASE_URL || 'http://127.0.0.1:8080').replace(/\/$/, '');
const parsedBaseUrl = new URL(baseUrl);
const isLoopback = ['127.0.0.1', 'localhost', '::1'].includes(parsedBaseUrl.hostname);
const explicitlyAuthorizedNonProduction = __ENV.AVERON_LOAD_TEST_ENVIRONMENT === 'non-production'
  && __ENV.AVERON_LOAD_TEST_APPROVED === 'true';
const hostname = parsedBaseUrl.hostname.toLowerCase();
const productionDomain = hostname === 'averon.uz' || hostname.endsWith('.averon.uz');
const environmentName = (__ENV.AVERON_LOAD_TEST_ENVIRONMENT || '').toLowerCase();

if (productionDomain || ['production', 'prod'].includes(environmentName)) {
  throw new Error('Load test refused: AVERON production domains and environments are never allowed.');
}
if (!isLoopback && !explicitlyAuthorizedNonProduction) {
  throw new Error('Load test refused: non-loopback targets require explicit non-production authorization.');
}

const requestFailures = new Rate('request_failures');
const catalogLatency = new Trend('catalog_latency', true);
const catalogRequests = new Counter('catalog_requests');

export const options = {
  scenarios: {
    catalog_read_smoke: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: [
        { duration: '10s', target: 2 },
        { duration: '20s', target: 2 },
        { duration: '5s', target: 0 },
      ],
      gracefulRampDown: '5s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<750', 'p(99)<1500'],
    request_failures: ['rate<0.01'],
    catalog_latency: ['p(95)<750', 'p(99)<1500'],
  },
  userAgent: 'AVERON-safe-load-smoke/1.0',
  noConnectionReuse: false,
  discardResponseBodies: false,
};

function request(path, label) {
  const response = http.get(`${baseUrl}${path}`, {
    headers: { Accept: 'application/json' },
    tags: { workload: label },
    timeout: '10s',
  });
  const succeeded = check(response, {
    [`${label}: HTTP 200`]: (value) => value.status === 200,
    [`${label}: JSON response`]: (value) => value.headers['Content-Type']?.includes('application/json'),
  });
  requestFailures.add(!succeeded, { workload: label });
  catalogLatency.add(response.timings.duration, { workload: label });
  catalogRequests.add(1, { workload: label });
  return response;
}

export default function () {
  request('/api/v1/products?page=1&limit=12', 'catalog');
  request('/api/v1/products?q=shirt&page=1&limit=12', 'search');
  request('/api/v1/products?country=CN&size=M&page=1&limit=12', 'filter');

  const productId = __ENV.AVERON_LOAD_TEST_PRODUCT_ID;
  if (productId) {
    const safeIdentifier = /^[A-Za-z0-9_-]{1,128}$/.test(productId);
    check(productId, { 'configured product ID is safe': () => safeIdentifier });
    if (safeIdentifier) request(`/api/v1/products/${encodeURIComponent(productId)}`, 'product_detail');
  }

  sleep(1);
}
