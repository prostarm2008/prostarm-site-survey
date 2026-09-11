# ProstarM Site Survey — deployment guide

GitHub Pages hosts the app. Power Automate receives each submitted survey and
writes it to SharePoint. The app keeps working with no signal and sends when the
phone reconnects.

Files in this folder:

| File | What it is |
|---|---|
| `flow-request-schema.json` | Paste into the flow's **Parse JSON** action |
| `flow-definition.json` | The whole flow, for reference or for pasting via Peek code |
| `sharepoint-columns.md` | Every list and column to create |
| `sample-payload.json` | One real submission, for testing the flow |

---

## 1. Put the app on GitHub Pages

1. Create a repository, e.g. `prostarm-site-survey`.
2. Upload the **contents of the `site-survey` folder** to the repository root —
   `index.html`, `css/`, `js/`, `data/`, `sw.js`, `manifest.webmanifest`,
   the two icons and `.nojekyll`.
   Keep `.nojekyll`; without it GitHub ignores some paths.
3. Settings → Pages → Source: *Deploy from a branch*, branch `main`, folder `/ (root)`.
4. The app appears at `https://<org>.github.io/prostarm-site-survey/`.

The repository is public unless you have GitHub Enterprise. Two things to weigh
before pushing:

- **`data/user-master.js` contains all 216 employee codes, names, branches and
  the shared password.** Anyone who finds the URL can read it. Do not publish it
  on a public repository. Either use a private repository with GitHub Enterprise
  Pages, or host on SharePoint / Azure Static Web Apps instead, or move
  authentication behind the flow (see §5).
- Anyone with the page URL can post to your flow. §5 covers narrowing that.

### Install on an engineer's phone

Open the URL in Chrome → menu → **Add to home screen**. It then runs full-screen
and works offline, because `sw.js` caches everything on first load.

**After every deployment, bump `CACHE_VERSION` at the top of `sw.js`** (e.g.
`v8` → `v9`). Phones keep serving the cached copy until that string changes.

---

## 2. Create the SharePoint lists

On your SharePoint site create two lists and one document library. Column names
and types are in `sharepoint-columns.md`. Use the **internal names** given
there — the flow refers to them.

| Name | Type | Holds |
|---|---|---|
| `SiteSurveys` | List | One item per submitted survey |
| `SiteSurveyLoadLines` | List | One item per equipment row |
| `SiteSurveyPhotos` | Document library | Photographs, one folder per survey |

---

## 3. Build the flow

New → **Instant cloud flow** → trigger **When an HTTP request is received**.

1. **Trigger** — method `POST`. Leave the schema box empty; the body arrives as
   `text/plain` (see §4), so the trigger should not try to parse it.
2. **Parse JSON** — rename the action to `Parse survey`.
   - Content: `json(string(triggerBody()))`
   - Schema: paste `flow-request-schema.json`
3. **Create item** → list `SiteSurveys`. Map the fields per `flow-definition.json`.
   `RawPayload` holds `string(body('Parse survey'))` — keep it. It is the whole
   survey verbatim, so nothing is lost if a column is added later.
4. **Apply to each** over `photos` → **Create file** in `SiteSurveyPhotos`:
   - Folder path: `/SiteSurveyPhotos/@{body('Parse survey')?['surveyId']}`
   - File name: `@{items('Apply_to_each_photo')?['section']}-@{items('Apply_to_each_photo')?['id']}.jpg`
   - File content: `base64ToBinary(last(split(items('Apply_to_each_photo')?['dataUrl'], ',')))`
5. **Apply to each** over `loadCalculation` → **Create item** in
   `SiteSurveyLoadLines`. Skipped automatically when the engineer marked load
   details unavailable, because the array is then empty.
6. **Response** — status 200, body:
   ```json
   { "ok": true, "surveyId": "...", "itemId": "..." }
   ```
   The app stores `itemId` against the survey so you can trace a row back.

Save the flow, then copy the **HTTP POST URL** from the trigger.

### Faster alternative

Steps 4 and 5 run one SharePoint call per photo and per equipment row — roughly
15 calls per survey. If that gets slow, drop step 5 and read the equipment rows
from `RawPayload` when you need them; `SiteSurveys` alone is enough for
reporting, and `TotalUpsLoadKW` is already on the item.

---

## 4. Point the app at the flow

Edit **`data/app-config.js`** — the only file you change after handover:

```js
const APP_CONFIG = {
  flowUrl: 'https://prod-00.westeurope.logic.azure.com:443/workflows/.../invoke?api-version=...',
  flowContentType: 'text/plain;charset=UTF-8'
};
```

Commit and push. Engineers get it after their phone refreshes the cache.

**Leave `flowContentType` as `text/plain`.** With `application/json` the browser
sends a CORS preflight `OPTIONS` request first, and the Power Automate request
trigger does not answer preflight calls — the post fails before it reaches your
flow. `text/plain` keeps it a "simple" request, no preflight. The flow reads the
body with `json(triggerBody())`, so the header costs nothing.

If `flowUrl` is left empty the app runs entirely on the device, which is a
useful way to trial it before the flow exists.

### What the app does around the flow

- Every submitted survey is written to the phone **first**, then posted.
- If the post fails, the survey is marked *Waiting to send* and stays queued.
- The queue is retried on sign-in, when the browser reports it is back online,
  and from the **Send N pending to SharePoint** button on the *My surveys* tab.
- Each survey shows *Sent to SharePoint* or *Waiting to send*, so an engineer
  can see the state of their own work.

---

## 5. Before going live

**Test the flow first.** In Power Automate use *Test → Manually*, then POST
`sample-payload.json` with Postman or:

```bash
curl -X POST "<HTTP POST URL>" -H "Content-Type: text/plain" --data-binary @sample-payload.json
```

**Things worth deciding:**

1. **The password is in the file.** All 216 users share `ProstarM@1234` and it
   sits in `data/user-master.js`, readable by anyone who opens the page. It
   records *who* filled a survey; it does not stop someone signing in as
   another engineer. Replacing `authenticate()` in `js/app.js` with a call to a
   second flow that checks credentials server-side is the fix.
2. **Anyone with the flow URL can post to it.** The URL contains a signature but
   is not a secret once it ships inside a web page. Options: add a shared header
   the flow checks and reject anything else; or put the app behind Entra ID on
   Azure Static Web Apps.
3. **Payload size.** A survey with three photographs is roughly 400 KB of JSON.
   Well inside the trigger's limit, but slow on a weak signal — the queue exists
   for exactly this.
4. **Duplicate submissions.** If a post times out but the flow actually
   succeeded, a retry writes the item twice. Add a *Get items* on
   `Title eq surveyId` before *Create item* and skip when found. The Survey ID
   is unique per site per day per sequence, so it is a safe key.

---

## 6. Where the survey data lands

Each survey produces:

- one item in `SiteSurveys` with every answer, both load totals, the issue list
  and the full JSON in `RawPayload`;
- one folder in `SiteSurveyPhotos` named after the Survey ID, holding the
  site-condition, space-and-safety and wire-and-MCCB photographs;
- one item per equipment row in `SiteSurveyLoadLines`.

From there, Power BI over `SiteSurveys` gives you site readiness by branch, zone
or state, and the issue counts tell the office which centres need the electrical
contractor before delivery.
