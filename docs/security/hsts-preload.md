# HSTS Preload Readiness

## What is HSTS preload?

HTTP Strict Transport Security (HSTS) with preloading tells browsers to always use HTTPS for a domain — even before the first request — by including the domain in a browser-maintained list shipped with Chrome, Firefox, Safari, and Edge.

Without preload, a user's *first* visit to a domain is vulnerable to a TLS strip attack. With preload, the browser refuses to make any plain-HTTP connection to the domain, regardless of redirect behaviour.

## Current configuration

HSTS is configured in the NestJS API via the `helmet` middleware in `apps/api/src/main.ts`:

```ts
app.use(
  helmet({
    hsts: {
      maxAge: 31536000,        // 1 year — minimum required for preload
      includeSubDomains: true, // required for preload
      preload: true,           // sets the preload directive in the header
    },
  }),
);
```

The resulting response header is:

```
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
```

All three values (`max-age ≥ 31536000`, `includeSubDomains`, `preload`) satisfy the requirements for submission to the HSTS preload list.

## Submitting to the preload list

1. Verify the live domain serves the correct HSTS header.
2. Confirm all subdomains are HTTPS-only (including `www.`).
3. Submit `offeraccept.com` at [hstspreload.org](https://hstspreload.org).
4. Preloading propagates to stable Chrome/Firefox within 10–12 weeks after submission.

**Important:** Preloading is a one-way commitment. Removing a domain from the preload list takes months to propagate. Do not submit until all subdomains are confirmed HTTPS-only and the product is stable.

## Readiness checklist

- [x] `max-age=31536000` set in Helmet config
- [x] `includeSubDomains` set in Helmet config
- [x] `preload` directive set in Helmet config
- [ ] Live domain verified at hstspreload.org eligibility check
- [ ] All subdomains confirmed HTTPS-only
- [ ] Domain submitted to hstspreload.org
- [ ] Preload status confirmed in Chrome preload list
