# ProstarM Site Survey — deployment guide

GitHub Pages hosts the app. Power Automate receives each submitted survey and
writes it to SharePoint. The app keeps working with no signal and sends when the
phone reconnects.

Files in this folder:

| File | What it is |
|---|---|
| `flow-request-schema.json` | Paste into the flow's **Parse JSON** action |
| `flow-1-submit.json` | Flow 1 — receives a survey and writes it to SharePoint |
| `flow-2-list.json` | Flow 2 — reads surveys back, scoped by role |
| `flow-3-auth.json` | Flow 3 — signs people in against the SharePoint user list |
| `users-for-sharepoint.csv` | All 216 users, ready to import into `SiteSurveyUsers` |
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

`flow-1-submit.json` has this shape already.

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

1. **Compose** → `Build filter`. The app calls the flow with
   `?role=&userId=&branch=&zone=`, and this turns that into an OData filter:

   | Role | Filter |
   |---|---|
   | HO Admin | *(empty — every zone)* |
   | Regional Manager | `EngineerZone eq '<zone>'` |
   | Branch Official | `EngineerBranch eq '<branch>'` |
   | Field Engineer | `EngineerCode eq '<userId>'` |

   The expression is in `flow-2-list.json`; paste it rather than retyping it.
2. **Get items** → list `SiteSurveys`, `$filter` = `@outputs('Build_filter')`,
   order by `Created desc`, top 500.
3. **Select** → map each row to `{ "RawPayload": item()?['RawPayload'] }`.
   `RawPayload` holds the whole survey, so the app can rebuild the full report
   from it — including the comparison table and the issue list.
4. **Response** — status 200, body `@body('Select_payloads')`, and add the header
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


---

## 3c. Third flow: sign-in against SharePoint

Without this flow the app signs people in from `data/user-master.js`, which
means every employee code and password sits in the repository. This flow moves
the directory into SharePoint so the app ships with none of it.

Build the `SiteSurveyUsers` list first (columns in `sharepoint-columns.md`) and
import `users-for-sharepoint.csv` — its header row already uses the internal
names, and all 216 people are in it.

New → **Instant cloud flow** → **When an HTTP request is received**, method `POST`.

1. **Parse JSON** → `Parse login`, content `@json(string(triggerBody()))`,
   schema `{ "userId": "string", "password": "string" }`.
2. **Get items** → `Find user` on `SiteSurveyUsers`,
   `$filter` = `Title eq '@{toUpper(trim(body('Parse_login')?['userId']))}'`, top 1.
3. **Condition** → `Check the user`, true when all three hold: a row came back,
   `Active` is yes, and `Password` equals the posted password.
   - **If yes** → *Response* 200 with `{ ok: true, user: { … } }` built from the row.
   - **If no** → *Response* 401 with `{ ok: false, message: … }`.
4. A second *Response* on the failure path, so the app is never left waiting.

`flow-3-auth.json` is the whole thing. Paste its URL into `authUrl` in
`data/app-config.js`, then **replace `data/user-master.js` with the empty
version** (`user-master-empty.js` in the zip, renamed). That is the point of the
exercise — no credentials in the repo at all.

### What happens with no signal

Field engineers sign in where there is no connection, so:

- The first sign-in on a phone must reach the directory.
- After that the phone keeps a **salted SHA-256 of the password**, never the
  password, and the same person can sign in again offline on that phone.
- Someone who has never signed in on that phone is told plainly:
  *"Cannot reach the user directory, and this phone has no signed-in record
  yet. Connect once and try again."*
- "Keep me signed in" still holds the session, so most engineers never see a
  sign-in screen after the first day.

### Before you trust it

Passwords in a SharePoint list are readable by anyone who can open that list, so
**break permission inheritance on `SiteSurveyUsers`**. The flow reads it under
the connection owner's account; the engineers need no access to it themselves.

The flow URL is in the page source, so anyone who finds it can try codes and
passwords against it at speed. Two things worth doing: give each person their
own password instead of the shared `ProstarM@1234`, and if this is going to
carry real weight, move sign-in to Entra ID rather than a list of passwords.
This design is a straight lift of what you have today into somewhere you can
manage it — it is not a hardening exercise.

---

## 6b. Roles

The role comes from the `Role` column of the user master, never from the page.
The sign-in card asks which role you are only so a wrong choice can be caught
and named; the answer is checked against the master before anyone gets in.

| Sign-in | Role in user master | Sees |
|---|---|---|
| HO Admin | `admin` | Every survey, every zone |
| Regional Manager | `regional` | Surveys from engineers in their zone |
| Branch Official | `branch` | Surveys from engineers in their branch |
| Field Engineer | `engineer` | Only the surveys they submitted |

Every role gets a **Load … surveys from SharePoint** button once `listUrl` is
filled in — a Field Engineer sees *Load my surveys from SharePoint* and gets
their own work back, which is what they need after changing phone or clearing
the browser. The wording changes with the role; the filter does the rest.

The scope is applied in two places on purpose: flow 2 filters in SharePoint so
no one downloads what they should not see, and the app applies the same rule
again to whatever comes back. So a flow that is misconfigured and returns too
much still shows each person only their own scope.

Surveys pulled back from SharePoint are **open, print and export only** — no
Edit button. Flow 2 returns `RawPayload`, not the photographs, so the report
prints with a note where the images would be. A survey still on the phone that
took it keeps its photographs and can still be edited. Change a person's reach by editing their `Role`,
`Branch` or `Zone` in `data/user-master.js` — nothing else needs touching.

Zone and branch are matched on the **engineer who submitted the survey**, not on
the site's own branch. A Bangalore engineer surveying a Hyderabad site appears
under Bangalore, which is how the reporting line works.

---

## 6c. The HO Admin dashboard

HO Admin gets a third tab, **Dashboard**, that nobody else sees. It measures the
107 sites in `data/site-list.js` against the surveys received:

- **Sites in master, visits completed, visits pending, sites with issues,
  coverage** across the top.
- A row per state with its own counts and a completion bar. Press **+** to open
  it and see every site in that state: completed or pending, who surveyed it and
  when, and the exact issues raised, listed out.
- Search by site, code, district or branch; filter by zone; filter to completed
  or pending only. The counters follow the filters.
- **Export dashboard (CSV)** gives one row per site — state, zone, branch, code,
  name, district, capacity, visit status, survey ID, revision, date, engineer,
  issue count and the issues themselves.

States are ordered by issues first, then by pending count, so the ones needing
attention rise to the top. Within a state, sites that flagged something come
first, then the ones still to visit, then the clean ones.

The dashboard only knows about surveys the device is holding, so press **Load all
surveys from SharePoint** first — otherwise it shows a near-empty picture from
whatever that laptop happens to have. A site counts as visited when any survey
exists for its code; where a survey has been edited, the latest revision is used.

---

## 7. Nothing appears in "My surveys" or the admin view

Open **My surveys → Diagnostics** on the phone that did the survey. It answers
this in one screen, and each line points at a different cause.

| Diagnostics says | What it means | Fix |
|---|---|---|
| *Surveys stored on this device* is 0 | The survey never reached the phone's storage | Check *Last storage error*. If it mentions quota, clear old surveys or let photographs go |
| Stored is 1 but *Shown in this list* is 0 | The list is filtering them out | You are signed in as a different engineer than the one who did the survey |
| *App version* is older than the build you pushed | The phone is running a cached copy | Press **Clear cached app and reload** |
| *Last send error* has text | The flow rejected the post | The message is the flow's own reply — read it below |
| *Submit flow* says not configured | `flowUrl` is still empty in `data/app-config.js` | Paste the trigger URL and push |

A survey is written to the phone **before** it is posted, so a broken flow can
never make it vanish from *My surveys*. If the list is empty on the phone that
did the survey, the cause is on the device, not in Power Automate. If the list
shows the survey as *Waiting to send*, the cause is the flow.

### Flow errors you are likely to see

**`InvalidTemplate — Unable to process template language expressions`**
Something references an action it cannot see. The usual cause is a *Response*
action referring to *Create item* when *Create item* sits inside a Condition —
Logic Apps cannot reach into a branch. `flow-1-submit.json` avoids this by
reading the item back with `Read_back_survey_item` after the condition and
taking the ID from there.

**The flow succeeds but SharePoint is empty.**
Check *Create item* actually ran, not the *Update item* branch against a stale
match. `Find_existing_survey` filters `Title eq '<surveyId>'`; if `Title` is not
the Survey ID, every submission looks like an update of nothing.

**The admin view stays empty while the list has rows.**
Three things to check, in this order:

1. `listUrl` is filled in `data/app-config.js`. Without it the button does not
   even appear.
2. Flow 2's *Response* carries the header `Access-Control-Allow-Origin: *`.
   Without it the post reaches SharePoint, the reply comes back, and the browser
   silently refuses to let the page read it.
3. The *Select* step maps `RawPayload`. The app rebuilds the whole report from
   that column; if it is empty, the rows come back with nothing in them.

Test flow 2 by pasting its URL straight into a browser tab. You should see a
JSON array of `RawPayload` strings. If you see the array there but not in the
app, it is the CORS header.

### Checking the trigger by hand

```bash
curl -i -X POST "<flow 1 URL>" \
  -H "Content-Type: text/plain" \
  --data-binary @sample-payload.json
```

A working flow replies `200` with `{"ok":true,...}`. Anything else is the flow,
and the body tells you which action failed.
