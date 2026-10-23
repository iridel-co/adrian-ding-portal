# Public API

The public website reads CMS content from `/api/public/*`.
Every endpoint is read-only and needs no sign-in.
Only published content comes back.

The website sends the corporate training inquiry form to `POST /api/corporate-inquiries`.
That is the only write endpoint.

## Contents

- [Endpoints](#endpoints)
- [Conventions](#conventions)
- [Corporate inquiries](#corporate-inquiries)
- [Corporate training page](#corporate-training-page)
- [Code layout](#code-layout)

## Endpoints

The OpenAPI 3.1 document at `GET /api/public/openapi.json` is the reference for every endpoint.
It lists the params, the request body, the response shape and the error codes of each endpoint.
Use it to generate a typed client, or load it in a tool such as Postman or Swagger UI.

```bash
curl "https://<cms-host>/api/public/openapi.json"
```

| Endpoint | Returns |
|---|---|
| `GET /api/public/profile` | The site profile: hero copy, bio, contacts, stats, timeline, credentials and the corporate primer |
| `GET /api/public/workshops` | Published workshops |
| `GET /api/public/workshops/:slug` | One published workshop with its upcoming sessions |
| `GET /api/public/programs` | Published corporate training programs |
| `GET /api/public/programs/:slug` | One published corporate training program |
| `GET /api/public/clients` | Published clients for the logo wall |
| `GET /api/public/industries` | Client industries for the logo wall filter |
| `GET /api/public/testimonials` | Published testimonials |
| `GET /api/public/faqs` | Published FAQs |
| `GET /api/public/openapi.json` | The OpenAPI document |
| `POST /api/corporate-inquiries` | Accepts a corporate training inquiry |

## Conventions

### Visibility

- A row comes back only when its status is `published`.
- Draft and archived rows never appear in lists.
- A draft or archived item requested by slug returns 404.
- An archived image comes back as `null`.
- An archived industry or tag is left out.
- Payment accounts, the activity log and users are never exposed.

### Methods

- `GET` returns data.
- `OPTIONS` answers the CORS preflight with 204.
- `POST`, `PUT`, `PATCH` and `DELETE` return 405 `method_not_allowed`.

### Query params

- Boolean params accept only `true` or `false`. Any other value returns 400.
- Unknown params are ignored.

### Errors

Every error has the same shape:

```json
{
  "error": {
    "code": "invalid_request",
    "message": "group: Invalid option: expected one of \"workshop\"|\"about\""
  }
}
```

| Status | Code | When |
|---|---|---|
| 400 | `invalid_request` | A query param or route param fails validation |
| 404 | `not_found` | The item doesn't exist or isn't published |
| 405 | `method_not_allowed` | The method isn't `GET` or `OPTIONS` |
| 500 | `internal_error` | The server fails. The server log has the details. The response doesn't. |

### Caching

| Response | `Cache-Control` |
|---|---|
| 200 | `public, max-age=60, s-maxage=300, stale-while-revalidate=86400` |
| 200, workshop list and detail | `public, max-age=0, s-maxage=15, must-revalidate` |
| 404 | `public, max-age=0, s-maxage=60` |
| 304 | Same as 200 |
| 400, 405, 500 | `no-store` |

A CMS edit can take up to 5 minutes to show on the site.
Nothing purges the cache on publish.
Workshop list and detail responses require browser revalidation and can be cached by shared caches for 15 seconds, without serving stale responses.

### Conditional requests

Every 200 response has a strong `ETag` header.
The ETag is a hash of the response body, so it changes only when the content changes.

- Send the ETag back in `If-None-Match` to check for changes.
- When the content is the same, the API returns `304 Not Modified` with no body.
- A 304 keeps the `ETag`, `Cache-Control` and CORS headers.
- `If-None-Match: *` always returns 304.
- Weak tags such as `W/"..."` match too. A CDN can add `W/` when it compresses the body.

```bash
curl -i "https://<cms-host>/api/public/programs"
# ETag: "mY7ndaGOXa48B9xlBo0Mu_nN1xEpOoG48ct_YlC2OCk"

curl -i -H 'If-None-Match: "mY7ndaGOXa48B9xlBo0Mu_nN1xEpOoG48ct_YlC2OCk"' "https://<cms-host>/api/public/programs"
# HTTP/1.1 304 Not Modified
```

### CORS

`PUBLIC_SITE_ORIGIN` sets which browser origins can call the API.
It takes a comma-separated list, with no trailing slash, such as `https://adrianding.com,https://www.adrianding.com`.

- When it is empty, every response has `Access-Control-Allow-Origin: *`.
- When it is set, a listed origin is echoed back in `Access-Control-Allow-Origin`.
- When it is set, any other origin gets no `Access-Control-Allow-Origin` header, so the browser blocks the response.

CORS responses allow the `Content-Type` and `If-None-Match` request headers.
They expose the `ETag` response header to browser code.

Server-to-server calls ignore CORS.

### Workshop sessions

- `capacity` is the run's total seat limit. `seatsLeft` is capacity minus non-cancelled registrations, with a minimum of zero.
- Paid and Unpaid registrations both reserve one seat. Unpaid reservations do not expire automatically.
- The workshop list returns `nextSession.seatsLeft`; workshop detail returns `sessions[].seatsLeft`.
- Availability is a snapshot. Registration submission checks capacity again before accepting a reservation.
- A session appears only while it is `open` or `closed` and has not ended.
- Draft and cancelled sessions never appear.
- `isRegistrationOpen` is `true` only when the status is `open` and the cutoff has not passed.
- When `registrationCutoffAt` is `null`, the session start is the cutoff.

## Corporate inquiries

`POST /api/corporate-inquiries` is not under `/api/public/` because it writes data.
It has its own CORS, error and cache rules.
The OpenAPI document lists its body fields and error codes.

- Send a new UUID v4 in the `Idempotency-Key` header for each submission.
- Get a Cloudflare Turnstile token from the widget and send it as `turnstileToken`.
- Always send the hidden honeypot field `website` as `""`.
- A success returns `202` with `{ "accepted": true }`.
- An error body has a code only, such as `{ "error": "invalid_submission" }`.
- Every response has `Cache-Control: no-store`.

### Retries

- Every attempt needs a fresh Turnstile token.
- A retry with the same `Idempotency-Key` and the same answers returns 202 and makes no duplicate.
- A retry with the same key and different answers returns 409 `idempotency_key_mismatch`.

### CORS

- Only origins in `SITE_ORIGINS` get `Access-Control-Allow-Origin`.
- `OPTIONS` returns 204 with `Access-Control-Allow-Methods: POST, OPTIONS`.
- The allowed request headers are `Content-Type` and `Idempotency-Key`.

## Corporate training page

The `/corporate-training` page on the public site uses these endpoints:

| Page block | Endpoint |
|---|---|
| Program cards | `GET /api/public/programs` |
| Inquiry form opened from `?program=<slug>` | `GET /api/public/programs/:slug`, to show the program title |
| Program choices in the form | `GET /api/public/programs`, for `program` and `alsoInterested` |
| Form submit | `POST /api/corporate-inquiries` |
| Client logo wall | `GET /api/public/clients` |
| Industry filter on the logo wall | `GET /api/public/industries`, then `GET /api/public/clients?industry=<id>` |
| "By the numbers" stats | `GET /api/public/profile?statsPage=corporate`, field `stats` |
| Primer video | `GET /api/public/profile`, field `corporatePrimer` |
| Testimonials | `GET /api/public/testimonials?featured=true` |

An unknown or unpublished `?program=` slug returns 404.
The form can then open with no program selected.

## Code layout

| Part | Location |
|---|---|
| Route files | `src/routes/api/public/` |
| Queries | `src/features/{workshops,profile,showcase,faq}/public.ts` |
| Visibility rules | `src/features/shared/visibility.ts` |
| Response, error, cache, ETag and CORS helpers | `src/features/shared/public-api.ts` |
| Request and response schemas | `src/features/shared/public-schemas.ts` |
| OpenAPI document | `src/features/shared/openapi.ts` |
| Inquiry endpoint | `src/features/crm/intake.ts` |

To add an endpoint:

1. Add a read-only query to the feature's `public.ts`. Filter it with the predicates in `visibility.ts`.
2. Add its input schema to `publicInputs` and its response schema to `public-schemas.ts`.
3. Add a route file in `src/routes/api/public/`. Use `publicHandlers(publicInputs.<name>, load)`.
4. Add the operation to `PUBLIC_READ_OPERATIONS` in `openapi.ts`, and add a type check to `openapi.test.ts`.
5. Add the endpoint to the [Endpoints](#endpoints) table.
