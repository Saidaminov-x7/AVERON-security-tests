# AVERON Cloudflare rollout runbook (prepared, not activated)

Status: **NOT_CONFIGURED / NOT_VERIFIED**. No Cloudflare account was accessed,
no DNS record or production setting was changed. This is a dashboard checklist;
the provider's actual origin targets and plan must be confirmed before applying.

## 1. Add domains only after origin setup

Create the production custom domain at the actual hosting provider first, then
add these DNS records in the Cloudflare zone and enable the orange-cloud proxy:

| Hostname | Target |
|---|---|
| `averon.uz` | The configured storefront origin/custom-domain target |
| `www.averon.uz` | Canonical storefront host (redirect to `https://averon.uz`) |
| `admin.averon.uz` | The configured Admin deployment custom-domain target |
| `api.averon.uz` | The configured Railway API custom-domain target |

Do not invent A-record IPs or copy temporary preview URLs as origins. Confirm
custom-domain ownership and TLS at Vercel/Railway first. Keep a documented
rollback target. A DNS-only origin remains directly reachable even when the
public hostname is proxied.

## 2. TLS and origin protection

1. In **SSL/TLS → Overview**, choose **Full (strict)** only after every origin
   presents a valid certificate for its configured custom hostname. Do not use
   Flexible mode.
2. Enable HTTPS redirects after verifying origin HTTPS and callbacks. Keep API
   cookies secure and host-scoped to the intended application; do not broaden
   cookie domains to `.averon.uz` without a reviewed cross-subdomain auth design.
3. Prefer a private/tunnel origin where the host supports it. Otherwise, apply
   provider ingress controls that allow only the current Cloudflare published
   IP ranges, and keep those ranges updated. Railway may not expose the needed
   ingress control; verify capability and effective origin reachability rather
   than assuming the rule exists.
4. In isolated staging, compare direct-origin and Cloudflare requests. Direct
   origin should be unreachable or equivalently protected. Send forged
   `X-Forwarded-For`, `Forwarded`, and `X-Real-IP` through staging and confirm
   Fastify records the sanitized client address. Do not change
   `TRUST_PROXY_ADDRESSES` to guessed CIDRs or hop counts.

## 3. WAF and route-specific abuse controls

1. Enable Cloudflare Managed Rules for the production zone and review matched
   events separately for the storefront, admin, and API hostnames. Start in
   staging or with the least disruptive available action; tune false positives
   before production enforcement.
2. Keep backend authentication/RBAC authoritative. Do not treat a hidden URL,
   WAF rule, frontend guard, or IP allowlist as authorization.
3. Create narrow rate-limit rules by exact host, HTTP method, and actual route
   discovered from the backend route inventory. Current application ceilings
   include password login `20/15m`, phone-code requests `3–5/15m`, code
   verification `8/15m`, and checkout `5/min`; confirm each route's exact
   `keyGenerator` before matching edge limits. Cloudflare edge counters use the
   configured characteristic (often source IP) and are not globally shared
   across all data centers, so they will not necessarily match app account/IP
   keys. Validate plan support, NAT impact, and application-vs-edge behavior in
   staging before enforcement.
4. Count failed login/verification responses where the plan permits response-
   based counting. Do not challenge/block all API traffic or all 4xx responses.
   Avoid automatic long bans from a single 401/404. Use a short mitigation only
   after observed abuse and provide an appeal/unblock path.
5. Keep `/api/v1/admin/*` protected by server roles; apply a separate, measured
   rate policy rather than public access restrictions that would lock out
   legitimate staff behind shared networks.

## 4. Cache policy

Create a high-priority Cache Rule that sets **Bypass cache** for
`api.averon.uz/*`. Also bypass authenticated/dynamic storefront and Admin flows:
login, registration, profile, favorites, cart, checkout, orders, and any response
that depends on user cookies or authorization. Never cache `Set-Cookie`, tokens,
orders, user profiles, or personalized HTML in a shared cache.

Only make versioned static asset paths eligible for CDN caching after the bypass
rules are in place and ordered correctly. Do not select “Cache Everything” for a
whole storefront/admin/API hostname. Validate with Cloudflare Trace and browser
network headers: private responses must not be `HIT`, and `Set-Cookie` must be
preserved.

## 5. Staging acceptance before production

- Verify all four hosts, HTTPS redirects, certificate chain, CORS, cookies, and
  request IDs.
- Verify API cache bypass for both anonymous and authenticated requests; check
  that two test accounts cannot receive each other's response.
- Verify rate-limit keys, thresholds, `429` and `Retry-After`, shared-NAT
  behavior, recovery after the window, and no CAPTCHA on normal API calls.
- Verify WAF events do not break product search, upload, login, checkout, or
  Admin routes.
- Verify origin is not publicly reachable and that forwarded-header spoofing
  cannot change backend client identity.
- Record ruleset IDs, plan limitations, test timestamps, origin/deployment SHAs,
  and rollback steps. Only then request explicit approval for DNS/production
  changes.

Official Cloudflare references: [protect your origin](https://developers.cloudflare.com/fundamentals/security/protect-your-origin-server/),
[rate limiting best practices](https://developers.cloudflare.com/waf/rate-limiting-rules/best-practices/),
[Full (strict) TLS](https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/full-strict/),
[Cache Rules](https://developers.cloudflare.com/cache/how-to/cache-rules/settings/),
and [dynamic-content cache guidance](https://developers.cloudflare.com/cache/troubleshooting/dynamic-content-and-login-issues/).
