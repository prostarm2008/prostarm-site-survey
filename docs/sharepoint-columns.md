# SharePoint columns

Create these with exactly these **internal names** — the flow refers to them.
When you add a column, SharePoint derives the internal name from the display
name you first type, so type the internal name, save, then rename the display
name if you want something friendlier.

---

## List: `SiteSurveys`

One item per submitted survey.

| Internal name | Type | Notes |
|---|---|---|
| `Title` | Single line | Survey ID, e.g. `SS-20260911-PRO2220581-001`. Use as the unique key. |
| `Revision` | Number | 1 on first submission, 2 on the first edit, and so on |
| `LastEditedAt` | Date and time | Empty until the survey is edited |
| `SurveyDate` | Date only | |
| `StartedAt` | Date and time | When the engineer picked the site |
| `SubmittedAt` | Date and time | |
| `EngineerName` | Single line | |
| `EngineerCode` | Single line | Employee code from the login |
| `Designation` | Single line | |
| `EngineerBranch` | Single line | |
| `EngineerZone` | Single line | |
| `Role` | Choice | engineer, branch, regional, admin |
| `SiteCode` | Single line | |
| `SiteName` | Single line | |
| `District` | Single line | |
| `StateName` | Single line | `State` is reserved in some templates — use `StateName` |
| `SiteBranch` | Single line | |
| `SiteZone` | Single line | |
| `RegionalOffice` | Single line | |
| `UpsCapacity` | Single line | e.g. `20KVA - 4 Hours` |
| `SiteCondition` | Single line | |
| `Address` | Multiple lines, plain | |
| `ContactDetails` | Multiple lines, plain | |
| `GpsLatitude` | Number, 6 decimals | |
| `GpsLongitude` | Number, 6 decimals | |
| `BranchFloor` | Single line | |
| `MainDoor` | Single line | `H x W unit` |
| `UpsRoom` | Single line | `L x B x H unit` |
| `UpsRoomDoor` | Single line | `H x W unit` |
| `LiftAvailable` | Single line | Yes / No / Not Required as Location at Ground Floor |
| `StairAvailable` | Single line | |
| `StairFeasible` | Single line | |
| `CraneUnloading` | Single line | |
| `CraneLoading` | Single line | |
| `Ventilation` | Single line | Good / Average / Poor |
| `AcAvailability` | Single line | |
| `WaterLeakage` | Single line | |
| `FireExtinguisher` | Single line | |
| `PowerApplicable` | Yes/No | False when the site condition skips the power step |
| `EbVoltageR` | Single line | |
| `EbVoltageY` | Single line | |
| `EbVoltageB` | Single line | |
| `EarthingAvailable` | Single line | |
| `EarthingVoltage` | Single line | `Not Applicable` when earthing is absent |
| `InputCable` | Single line | `availability / size` |
| `OutputCable` | Single line | |
| `EarthingCable` | Single line | |
| `InputMccb` | Single line | `availability / rating A / pole` |
| `OutputMccb` | Single line | |
| `MatchedRequirement` | Single line | Blank means manual engineering review |
| `LoadDetailsAvailable` | Yes/No | |
| `TotalLoadKW` | Number, 3 decimals | |
| `TotalUpsLoadKW` | Number, 3 decimals | |
| `CriticalUpsLoadKW` | Number, 3 decimals | |
| `IssueCount` | Number | |
| `Issues` | Multiple lines, plain | Pipe-separated |
| `EngineerRemarks` | Multiple lines, plain | |
| `CustomerRemarks` | Multiple lines, plain | |
| `CompletionPct` | Number | |
| `PhotoCount` | Number | |
| `RawPayload` | Multiple lines, plain | The whole submission as JSON |

`RawPayload` is worth keeping even though it duplicates the columns. Add a
question to the survey later and the old records still contain everything; you
can backfill a new column from it without asking anyone to re-survey.

---

## List: `SiteSurveyLoadLines`

One item per piece of equipment counted. Skip this list if you would rather read
the rows out of `RawPayload`.

| Internal name | Type | Notes |
|---|---|---|
| `Title` | Single line | Equipment name |
| `SurveyID` | Single line | Matches `SiteSurveys/Title` |
| `SiteCode` | Single line | |
| `ItemIndex` | Number | Position in the standard equipment list |
| `Qty` | Number | |
| `Watts` | Number | |
| `QtyOnUps` | Number | |
| `LoadW` | Number | |
| `LoadOnUpsW` | Number | |
| `Critical` | Single line | Yes / No, from the standard list |

Index `SurveyID` — you will filter on it constantly.

---

## Document library: `SiteSurveyPhotos`

No extra columns needed. The flow creates one folder per Survey ID and writes
files named `<section>-<photoId>.jpg`, where section is `sitecondition`,
`safety` or `wire`.

Photographs are resized to 1400 px and saved as JPEG at 72% quality on the
phone before sending, so each is roughly 100–150 KB.


---

## List 3 — `SiteSurveyUsers`

The sign-in directory. One row per person; the app never holds these.

| Internal name | Type | Notes |
|---|---|---|
| `Title` | Single line of text | Employee code, upper case — this is what the engineer types |
| `FullName` | Single line of text | Shown on the report and in the header |
| `Password` | Single line of text | See the warning below |
| `Role` | Choice | `admin`, `regional`, `branch`, `engineer` |
| `Designation` | Single line of text | Printed on the report |
| `Branch` | Single line of text | Must match the branch codes in the site list, e.g. `KN_Bangalore` |
| `Zone` | Single line of text | e.g. `South - 1` |
| `ManagerCode` | Single line of text | Optional |
| `ManagerName` | Single line of text | Optional |
| `Active` | Yes/No | Default Yes. Set No to block a sign-in without deleting the row |

Import `users-for-sharepoint.csv` straight into this list — the header row
already uses these internal names. Set `Title` to be indexed if the list will
grow past a few thousand rows.

**Break permission inheritance on this list.** Everyone who can open the site
can otherwise read every password in it. The flow reads the list under the
connection owner's account, so the engineers themselves need no access at all.
