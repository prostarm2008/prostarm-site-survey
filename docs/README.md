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

Two flows are described below: one to receive a survey (§3), one to read them
all back for supervisors (§3b).

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

### Handling edits

An engineer can correct a survey after submitting it (*My surveys → Edit survey*).
The corrected copy keeps the **same Survey ID** and arrives with `revision` 2, 3
and so on, plus `lastEditedAt`. So the flow must update rather than insert:

1. **Get items** on `SiteSurveys`, filter `Title eq '@{body('Parse survey')?['surveyId']}'`, top 1.
   Name it `Find existing survey`.
2. **Condition** — `length(body('Find_existing_survey')?['value'])` is greater than `0`.
   - **If yes** → *Update item*, Id = `first(body('Find_existing_survey')?['value'])?['ID']`,
     same field mapping as *Create item*.
   - **If no** → *Create item*.
3. Before writing the equipment rows, **Get items** on `SiteSurveyLoadLines` filtered
   `SurveyId eq '<surveyId>'` and delete them, so a revision replaces the old rows
   instead of adding a second set.

`flow-definition.json` already has this shape — `Find_existing_survey`,
`Create_or_update_survey` and `Delete_old_load_lines`.

This also removes the duplicate risk from a retried post: a survey that already
reached SharePoint is updated in place, not written twice.

### Photographs on a revision

*Create file* overwrites a file of the same name, so re-posting a revision
refreshes the folder rather than duplicating it. A photograph the engineer
**deleted** during the edit stays in the library — add a *Delete file* loop over
the folder first if that matters to you.

---

## 3b. Second flow: letting supervisors read everything back

Field engineers only ever need what is on their own phone. Admin, branch and
regional sign-ins get an extra button, **Load all surveys from SharePoint**, and
that needs a second flow.

New → **Instant cloud flow** → **When an HTTP request is received**, method `GET`.

1. **Get items** → list `SiteSurveys`. Order by `Created desc`, top 500.
   Optional filter using the query string the app sends
   (`?role=admin&branch=MH_Mumbai&zone=West`):
   `@{if(equals(triggerOutputs()['queries']['role'],'branch'), concat('EngineerBranch eq ''', triggerOutputs()['queries']['branch'], ''''), '')}`
2. **Select** → map each row to `{ "RawPayload": item()?['RawPayload'] }`.
   `RawPayload` holds the whole survey, so the app can rebuild the full report
   from it — including the comparison table and the issue list.
3. **Response** — status 200, body `@body('Select')`, and add the header
   `Access-Control-Allow-Origin: *`. Without that header the browser will not
   let the page read the reply.

Paste that flow's URL into `listUrl` in `data/app-config.js`. Leave it empty and
the tab simply shows what is on the device.

**A GET with no custom headers is a "simple" request**, so there is no preflight
to worry about — the same reason the POST uses `text/plain`.

Photographs are not returned by this flow (`RawPayload` carries their captions
and timestamps, not the images). A supervisor opening someone else's survey sees
the full report with a note where the photographs would be. If you want the
images too, add a *Get file content* loop over `SiteSurveyPhotos/<surveyId>` and
return them as data URLs — it is much slower, so only do it on demand.

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
4. **Duplicate submissions are already handled** by the *Find existing survey*
   step in §3. Keep it: it is what makes both retries and edits safe.
5. **Who may edit.** Any engineer can currently re-open and correct their own
   submitted survey, and every revision is kept in SharePoint through `Revision`
   and `LastEditedAt`. If you need edits to stop after sign-off, add a
   `Locked` yes/no column, return it in the list flow, and have the app hide the
   *Edit survey* button when it is set.

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
