# Public API

The public website reads CMS content from `/api/public/*`.
Every endpoint is read-only and needs no sign-in.
Only published content comes back.

The website sends the corporate training inquiry form to `POST /api/corporate-inquiries`.
That is the only write endpoint.

A machine-readable OpenAPI 3.1 document is at [`/api/public/openapi.json`](#get-apipublicopenapijson).
Use it to generate a typed client or to load the API in a tool such as Postman or Swagger UI.

## Contents

- [Conventions](#conventions)
- [Shared types](#shared-types)
- [GET /api/public/profile](#get-apipublicprofile)
- [GET /api/public/workshops](#get-apipublicworkshops)
- [GET /api/public/workshops/:slug](#get-apipublicworkshopsslug)
- [GET /api/public/clients](#get-apipublicclients)
- [GET /api/public/industries](#get-apipublicindustries)
- [GET /api/public/programs](#get-apipublicprograms)
- [GET /api/public/programs/:slug](#get-apipublicprogramsslug)
- [GET /api/public/testimonials](#get-apipublictestimonials)
- [GET /api/public/faqs](#get-apipublicfaqs)
- [GET /api/public/openapi.json](#get-apipublicopenapijson)
- [POST /api/corporate-inquiries](#post-apicorporate-inquiries)
- [Corporate training page](#corporate-training-page)
- [Code layout](#code-layout)

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
| 404 | `public, max-age=0, s-maxage=60` |
| 304 | Same as 200 |
| 400, 405, 500 | `no-store` |

A CMS edit can take up to 5 minutes to show on the site.
Nothing purges the cache on publish.

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

## Shared types

```ts
type Media = {
  url: string;           // absolute URL on the R2 public domain
  alt: string;
  width: number | null;
  height: number | null;
};

type Price = {
  centavos: number;      // 650000 = ₱6,500.00
  currency: "PHP";
  note: string;          // e.g. "Early bird", "" when there is no note
};

type Session = {
  id: string;
  date: string;          // "YYYY-MM-DD", first day
  endDate: string;       // "YYYY-MM-DD", last day (same as date for one-day sessions)
  startTime: string;     // "HH:MM", same on every day
  endTime: string;       // "HH:MM"
  timezone: "Asia/Manila";
  venueName: string;
  city: string;
  venueMapUrl: string | null;
  registrationCutoffAt: string | null; // ISO 8601 instant
  price: Price;
  capacity: number;
  status: "open" | "closed";
  isRegistrationOpen: boolean;
};
```

### Session rules

- A session appears only while it is `open` or `closed` and has not ended.
- Draft and cancelled sessions never appear.
- `isRegistrationOpen` is `true` only when the status is `open` and the cutoff has not passed.
- When `registrationCutoffAt` is `null`, the session start is the cutoff.

## GET /api/public/profile

Returns the site profile: hero copy, bio, contacts, stats, timeline and credentials.
The profile is a single record.
It has no publish status, so it always comes back.
Before anyone saves the profile, every text field is `""`, every list is `[]` and `portrait` is `null`.

| Param | Type | Description |
|---|---|---|
| `statsPage` | `home` \| `about` \| `corporate` \| `inquiry` | Keep only the stats assigned to this page |

```ts
type Profile = {
  headline: string;
  tagline: string;
  roles: string[];
  shortBio: string;
  longBio: string[];     // one string per paragraph
  portrait: Media | null;
  emails: string[];
  phone: string;
  footerTopics: string[];
  socialLinks: {
    network: "linkedin" | "facebook" | "instagram" | "tiktok" | "youtube";
    url: string;
  }[];
  stats: {
    value: string;
    label: string;
    description: string;
    pages: ("home" | "about" | "corporate" | "inquiry")[];
  }[];
  timeline: {
    period: string;
    title: string;
    description: string;
    image: Media | null;
  }[];
  credentials: {
    organization: string;
    description: string;
    logo: Media | null;
  }[];
  corporatePrimer: {
    videoUrl: string | null;
    blurb: string;
  };
};
```

```bash
curl "https://<cms-host>/api/public/profile?statsPage=about"
```

```json
{
  "headline": "Better people build better companies.",
  "tagline": "Two things I love: coffee, and developing people.",
  "roles": ["Leadership coach", "Corporate trainer", "Keynote speaker"],
  "shortBio": "CEO of Maximum Impact PH.",
  "longBio": ["First paragraph.", "Second paragraph."],
  "portrait": {
    "url": "https://<r2-public-domain>/media/portrait.jpg",
    "alt": "Coach Adrian Ding",
    "width": 1200,
    "height": 1500
  },
  "emails": ["coachadrianding@maximumimpact.online"],
  "phone": "0920 900 7709",
  "footerTopics": ["Leadership", "Keynotes"],
  "socialLinks": [{ "network": "linkedin", "url": "https://www.linkedin.com/in/..." }],
  "stats": [
    { "value": "20+", "label": "Years in the training circuit", "description": "", "pages": ["home", "about"] }
  ],
  "timeline": [
    { "period": "2004", "title": "Certified Trainer", "description": "Peak Potentials", "image": null }
  ],
  "credentials": [
    {
      "organization": "INSEAD",
      "description": "Executive Education, 2021",
      "logo": { "url": "https://<r2-public-domain>/media/insead.png", "alt": "INSEAD", "width": 400, "height": 160 }
    }
  ],
  "corporatePrimer": { "videoUrl": null, "blurb": "" }
}
```

## GET /api/public/workshops

Returns every published workshop, for the listing page and the home page cards.

| Param | Type | Description |
|---|---|---|
| `tag` | string | Keep workshops with this tag name. The match ignores case. |
| `upcoming` | `true` \| `false` | When `true`, keep only workshops with an upcoming open session |

Workshops with an upcoming session come first, sorted by the date of that session.
The rest follow, sorted by title.

```ts
type WorkshopListItem = {
  slug: string;
  title: string;
  summary: string;
  heroImage: Media | null;
  tags: string[];              // tag names, in CMS order
  defaultPrice: Price | null;
  nextSession: Session | null; // earliest upcoming session with status "open"
};

type Response = WorkshopListItem[];
```

```bash
curl "https://<cms-host>/api/public/workshops?upcoming=true"
```

```json
[
  {
    "slug": "exceptional-salesmanship",
    "title": "Exceptional Salesmanship",
    "summary": "A one-day masterclass for top producers.",
    "heroImage": {
      "url": "https://<r2-public-domain>/media/salesmanship.jpg",
      "alt": "Workshop room",
      "width": 1600,
      "height": 900
    },
    "tags": ["Sales", "Customer Experience"],
    "defaultPrice": { "centavos": 650000, "currency": "PHP", "note": "" },
    "nextSession": {
      "id": "51973dff-8766-4d37-b8c7-a9f272a9f215",
      "date": "2026-11-15",
      "endDate": "2026-11-15",
      "startTime": "09:00",
      "endTime": "17:00",
      "timezone": "Asia/Manila",
      "venueName": "SEDA Ayala Center Cebu",
      "city": "Cebu City",
      "venueMapUrl": null,
      "registrationCutoffAt": null,
      "price": { "centavos": 650000, "currency": "PHP", "note": "Early bird" },
      "capacity": 40,
      "status": "open",
      "isRegistrationOpen": true
    }
  }
]
```

## GET /api/public/workshops/:slug

Returns one published workshop with all its upcoming sessions, for the workshop detail page.

| Param | Type | Description |
|---|---|---|
| `slug` (path) | string | Workshop slug, such as `exceptional-salesmanship` |

Returns 404 `not_found` when the slug doesn't exist or the workshop isn't published.

```ts
type WorkshopDetail = {
  slug: string;
  courseCode: string | null;
  title: string;
  summary: string;
  problem: string;
  intro: string;
  audience: string;
  format: string;
  heroImage: Media | null;
  primerVideoUrl: string | null;
  primerBlurb: string;
  defaultVenue: { name: string; city: string; mapUrl: string | null };
  defaultPrice: Price | null;
  defaultCapacity: number | null;
  outcomes: string[];
  curriculum: string[];
  inclusions: string[];
  whatToExpect: string[];
  tags: string[];
  sessions: Session[];   // upcoming open and closed sessions, sorted by start
};
```

```bash
curl "https://<cms-host>/api/public/workshops/exceptional-salesmanship"
```

```json
{
  "slug": "exceptional-salesmanship",
  "courseCode": "EXSALES",
  "title": "Exceptional Salesmanship",
  "summary": "A one-day masterclass for top producers.",
  "problem": "",
  "intro": "Attract high-value clients instead of chasing every lead.",
  "audience": "Sales professionals in insurance, real estate, medical, retail and service.",
  "format": "High-energy, minimal lecture, peer case studies.",
  "heroImage": {
    "url": "https://<r2-public-domain>/media/salesmanship.jpg",
    "alt": "Workshop room",
    "width": 1600,
    "height": 900
  },
  "primerVideoUrl": "https://www.youtube.com/watch?v=...",
  "primerBlurb": "A short message from Coach Adrian.",
  "defaultVenue": { "name": "SEDA Ayala Center Cebu", "city": "Cebu City", "mapUrl": null },
  "defaultPrice": { "centavos": 650000, "currency": "PHP", "note": "" },
  "defaultCapacity": 40,
  "outcomes": ["Attract high-value clients", "Handle objections without discounting"],
  "curriculum": ["Elite mindset and daily disciplines", "Consultative selling, objection handling and closing"],
  "inclusions": ["Training manual", "Certificate of completion"],
  "whatToExpect": ["Peer case studies"],
  "tags": ["Sales", "Customer Experience"],
  "sessions": [
    {
      "id": "e165da87-af51-4dff-86cf-a51fc221e949",
      "date": "2026-11-01",
      "endDate": "2026-11-01",
      "startTime": "09:00",
      "endTime": "17:00",
      "timezone": "Asia/Manila",
      "venueName": "SEDA Ayala Center Cebu",
      "city": "Cebu City",
      "venueMapUrl": null,
      "registrationCutoffAt": null,
      "price": { "centavos": 650000, "currency": "PHP", "note": "" },
      "capacity": 40,
      "status": "closed",
      "isRegistrationOpen": false
    }
  ]
}
```

Error example:

```json
{ "error": { "code": "not_found", "message": "Workshop not found." } }
```

## GET /api/public/clients

Returns published clients for the logo wall.
The list is sorted by CMS position.

| Param | Type | Description |
|---|---|---|
| `industry` | UUID | Keep clients in this industry. Get the ids from `/api/public/industries`. |
| `featured` | `true` \| `false` | When `true`, keep only featured clients |

```ts
type Client = {
  id: string;
  name: string;
  logo: Media | null;
  industry: { id: string; name: string } | null; // null when unset or archived
  isFeatured: boolean;
};

type Response = Client[];
```

```bash
curl "https://<cms-host>/api/public/clients?featured=true"
```

```json
[
  {
    "id": "0b6f4f0e-2d0a-4a43-9a52-0d4c3f1b6a11",
    "name": "HSBC",
    "logo": { "url": "https://<r2-public-domain>/media/hsbc.png", "alt": "HSBC", "width": 400, "height": 160 },
    "industry": { "id": "ec2bb103-cb89-473e-ba97-62d8f1dfb9d9", "name": "Finance" },
    "isFeatured": true
  }
]
```

## GET /api/public/industries

Returns active client industries in CMS order, for the logo-wall filter tabs.
This endpoint takes no params.

```ts
type Response = { id: string; name: string }[];
```

```json
[
  { "id": "ec2bb103-cb89-473e-ba97-62d8f1dfb9d9", "name": "Finance" },
  { "id": "e6222f13-4b6c-4dbb-b48b-f92c8d33b6f3", "name": "Hotels & Resorts" },
  { "id": "7a3ba44a-384a-4fab-92a2-bc8af517084c", "name": "Multi-nationals" }
]
```

## GET /api/public/programs

Returns published in-house corporate programs in CMS order.
This endpoint takes no params.

```ts
type Program = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  image: Media | null;
  usefulFor: string[];
};

type Response = Program[];
```

```json
[
  {
    "id": "5c1e8a2b-7f3d-4e9a-b1c2-3d4e5f6a7b8c",
    "slug": "leadership",
    "title": "Leadership Training & Development",
    "summary": "Build managers who coach, delegate and lead with confidence.",
    "image": { "url": "https://<r2-public-domain>/media/leadership.jpg", "alt": "", "width": 1200, "height": 800 },
    "usefulFor": ["New managers", "Team leads"]
  }
]
```

## GET /api/public/programs/:slug

Returns one published in-house program.
The response has the same `Program` shape as one item of the list.
The site's `/corporate-training?program=<slug>` links use this slug.

| Param | Type | Description |
|---|---|---|
| `slug` | string, 1 to 200 characters | The program slug, in the path |

```bash
curl "https://<cms-host>/api/public/programs/leadership"
```

```json
{
  "id": "5c1e8a2b-7f3d-4e9a-b1c2-3d4e5f6a7b8c",
  "slug": "leadership",
  "title": "Leadership Training & Development",
  "summary": "Build managers who coach, delegate and lead with confidence.",
  "image": { "url": "https://<r2-public-domain>/media/leadership.jpg", "alt": "", "width": 1200, "height": 800 },
  "usefulFor": ["New managers", "Team leads"]
}
```

A missing, draft or archived program returns 404 `not_found`.

## GET /api/public/testimonials

Returns published testimonials in CMS order.

| Param | Type | Description |
|---|---|---|
| `featured` | `true` \| `false` | When `true`, keep only featured testimonials |
| `workshop` | string | Keep testimonials linked to this published workshop slug |

```ts
type Testimonial = {
  id: string;
  quote: string;
  personName: string;
  photo: Media | null;
  role: string;
  company: string;
  workshop: { slug: string; title: string } | null; // null when unlinked or the workshop isn't published
  isFeatured: boolean;
};

type Response = Testimonial[];
```

```bash
curl "https://<cms-host>/api/public/testimonials?workshop=exceptional-salesmanship"
```

```json
[
  {
    "id": "9f8e7d6c-5b4a-4c3d-8e2f-1a0b9c8d7e6f",
    "quote": "Coach Adrian's program changed how our team sells.",
    "personName": "Aseem Roy",
    "photo": null,
    "role": "Country Head",
    "company": "Wipro",
    "workshop": { "slug": "exceptional-salesmanship", "title": "Exceptional Salesmanship" },
    "isFeatured": true
  }
]
```

## GET /api/public/faqs

Returns published FAQs, sorted by group, then by CMS position.

| Param | Type | Description |
|---|---|---|
| `group` | `workshop` \| `about` | Keep FAQs in this group |

```ts
type Faq = {
  id: string;
  group: "workshop" | "about";
  question: string;
  answer: string;
};

type Response = Faq[];
```

```bash
curl "https://<cms-host>/api/public/faqs?group=workshop"
```

```json
[
  {
    "id": "3a2b1c0d-9e8f-4a7b-8c6d-5e4f3a2b1c0d",
    "group": "workshop",
    "question": "How do I pay, and when?",
    "answer": "Payment details are emailed after you reserve a seat."
  }
]
```

## GET /api/public/openapi.json

Returns the OpenAPI 3.1 document for every endpoint in this file.
This endpoint takes no params.
It has the same caching and ETag behavior as the other public endpoints.

```bash
curl "https://<cms-host>/api/public/openapi.json"
```

The document comes from the same Zod schemas that validate each request.
A test fails when a route file under `src/routes/api/public/` has no entry in the document.
Another test fails when a response schema and its loader return different types.

## POST /api/corporate-inquiries

Accepts an inquiry from the corporate training form.
It is not under `/api/public/` because it writes data.
It has its own CORS and error rules.

### Request

| Header | Required | Value |
|---|---|---|
| `Origin` | Yes | One of the origins in `SITE_ORIGINS` |
| `Content-Type` | Yes | `application/json` |
| `Idempotency-Key` | Yes | A new UUID v4 for each submission. Reuse it only to retry the same submission. |

The body is JSON, 64 KB at most.
Text fields are trimmed before the limits apply.

| Field | Type | Required | Rules |
|---|---|---|---|
| `fullName` | string | Yes | 2 to 200 characters |
| `email` | string | Yes | A valid email, 254 characters at most. Saved in lowercase. |
| `phone` | string | Yes | 40 characters at most. Digits, spaces, `+ ( ) . -` only. 7 to 15 digits. |
| `consent` | `true` | Yes | Must be `true`. Any other value returns `invalid_submission`. |
| `company` | string | Yes | 2 to 200 characters |
| `role` | string | Yes | 2 to 200 characters |
| `program` | string | Yes | 1 to 200 characters. Send the program title. |
| `attendees` | string | Yes | 1 to 100 characters, such as `"20-30"` |
| `targetDateFrom` | string | See below | `YYYY-MM-DD` or `""` |
| `targetDateTo` | string | No | `YYYY-MM-DD` or `""`. Needs `targetDateFrom`. Cannot be before it. |
| `targetDateText` | string | See below | 200 characters at most, such as `"Sometime in Q1"` |
| `venue` | string | Yes | 2 to 300 characters |
| `context` | string | No | 5000 characters at most |
| `alsoInterested` | string[] | No | 20 items at most. Each item is 1 to 200 characters. |
| `website` | string | No | A hidden honeypot field. Always send `""`. |
| `turnstileToken` | string | Yes | A Cloudflare Turnstile token, 1 to 2048 characters |

Send either `targetDateFrom` or `targetDateText`, not both.
Unknown fields return 400 `invalid_submission`.

```bash
curl -X POST "https://<cms-host>/api/corporate-inquiries" \
  -H "Origin: https://adrianding.com" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: 6f1c2b8e-3d4a-4b5c-9e7f-0a1b2c3d4e5f" \
  -d '{
    "fullName": "Maria Santos",
    "email": "maria@example.com",
    "phone": "+63 917 123 4567",
    "consent": true,
    "company": "Example Corp",
    "role": "HR Manager",
    "program": "Leadership Training & Development",
    "attendees": "20-30",
    "targetDateFrom": "2026-11-20",
    "targetDateTo": "2026-11-21",
    "venue": "Makati office",
    "context": "New team leads after a reorg.",
    "alsoInterested": ["Emotional Intelligence at Work"],
    "website": "",
    "turnstileToken": "<token from the Turnstile widget>"
  }'
```

### Response

A success returns `202 Accepted`:

```json
{ "accepted": true }
```

The inquiry is saved before the response.
Email to the client and the team follows when `CORPORATE_EMAIL_ENABLED` is on.

### Retries

- Every attempt needs a fresh Turnstile token.
- A retry with the same `Idempotency-Key` and the same answers returns 202 and makes no duplicate.
- A retry with the same key and different answers returns 409 `idempotency_key_mismatch`.

### Errors

An error body has a code only:

```json
{ "error": "invalid_submission" }
```

| Status | Code | When |
|---|---|---|
| 400 | `invalid_json` | The body is empty or is not valid UTF-8 JSON |
| 400 | `invalid_submission` | A field fails validation |
| 400 | `invalid_idempotency_key` | The `Idempotency-Key` header is missing or is not a UUID v4 |
| 400 | `submission_rejected` | The honeypot field `website` has a value |
| 400 | `verification_failed` | Turnstile rejects the token |
| 400 | `headers_not_allowed` | A preflight asks for a header other than `Content-Type` or `Idempotency-Key` |
| 403 | `origin_not_allowed` | The `Origin` header is missing or not in `SITE_ORIGINS` |
| 405 | `method_not_allowed` | The method is not `POST`, or a preflight asks for another method |
| 408 | `request_timeout` | The body takes more than 5 seconds to arrive |
| 409 | `idempotency_key_mismatch` | The key was used before with different answers |
| 413 | `body_too_large` | The body is larger than 64 KB |
| 415 | `unsupported_content_type` | `Content-Type` is not `application/json` |
| 503 | `verification_unavailable` | Turnstile cannot be reached |
| 503 | `intake_unavailable` | The server fails. Retry with the same key. |

Every response has `Cache-Control: no-store`.

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
5. Add the endpoint to this file.
