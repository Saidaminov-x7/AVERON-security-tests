# AVERON low-load performance smoke

`catalog-read-smoke.js` is a low-rate, read-only k6 smoke for catalog pages,
search, filtering, and optionally one product detail. It starts at one virtual
user, peaks at two, then ramps down. It reports request rate, errors, and
latency percentiles (including p95 and p99).

The default target is `http://127.0.0.1:8080`. Non-loopback targets are refused
unless both `AVERON_LOAD_TEST_ENVIRONMENT=non-production` and
`AVERON_LOAD_TEST_APPROVED=true` are supplied. Exact `production`/`prod`
environment values and `averon.uz` hostnames are refused even with the opt-in
flags. Never run this against production. The user must verify the staging
host, data, and authorization before setting the explicit opt-in variables.

Example local-only command:

```sh
k6 run performance/catalog-read-smoke.js
```

Optionally set `AVERON_BASE_URL` to a loopback API and
`AVERON_LOAD_TEST_PRODUCT_ID` to a non-sensitive published fixture ID. This
script does not authenticate, mutate data, create orders, or exercise admin
routes. Authenticated checkout/admin scenarios require a separately authorized
isolated test database and dedicated fixtures; they are intentionally not
simulated here.

No load run is implied by adding this harness. Record the k6 version, target
deployment SHA, environment, p95/p99, request rate, and failure rate when a
permitted run is performed.
