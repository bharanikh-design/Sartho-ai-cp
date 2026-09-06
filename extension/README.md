# Sartho browser extension

Open a job advert, click Sartho, and the role lands in your pipeline scored
against the evidence you approved.

Not in the Chrome Web Store yet, so it installs unpacked. That is a minute of
work and it is the same extension a store listing would ship.

## Browsers, and what each would take

| Browser | Today | To publish properly |
| --- | --- | --- |
| Chrome, Edge, Brave, Arc, Opera | Works unpacked, below. One extension for all of them. | Chrome Web Store: one-off developer registration, review in days. Edge installs from it directly; a first-class Edge listing is a separate free submission to Microsoft Partner Center. |
| Firefox | Not yet. Same format, but it wires the background script differently, so the manifest needs a variant. | addons.mozilla.org — free, quick review. A small change and a second build. |
| Safari | Not yet, and not a small step. | Safari extensions ship inside a native app: `xcrun safari-web-extension-converter`, an Xcode project, an Apple Developer membership, notarisation and App Store review. A project in its own right. |

The sensible order is Chrome Web Store first — it covers most people including
Edge — then Firefox if anyone asks, and Safari only on real demand.

## Install

1. `npm run extension:zip` in the repo root, then unzip `sartho-extension.zip`
   somewhere permanent — the browser reloads it from that folder on every start,
   so a Downloads folder you periodically empty is a poor choice.
2. Open `chrome://extensions` (or `edge://extensions`, `brave://extensions`).
3. Turn on **Developer mode**, top right.
4. **Load unpacked**, and pick the folder containing `manifest.json`.
5. Pin it: puzzle-piece icon → pin beside Sartho. The whole point is one click.

## How it fits together

```
job board tab                  extension                     sartho tab
─────────────                  ─────────                     ──────────
click the icon
  → scrape.js reads the page
       (JSON-LD, then selectors, then page text)
  → popup shows what it read
click "Send to Sartho"
                          background.js
                            → queues the job in chrome.storage.local
                            → focuses or opens a Sartho tab
                                                        sartho-connector.js
                                                          ← SARTHO_READY
                                                          → SARTHO_IMPORT_JOB
                                                        JobImportBridge
                                                          → POST /api/jobs
                                                          ← SARTHO_IMPORTED
                            → clears the queue
```

The queue is the important part. Nothing is deleted until Sartho confirms the
save, so a signed-out session, a reload, or a closed tab delays the role rather
than losing it — the previous version fired a message at a tab 500ms after load
and had no idea whether anything caught it.

## Files

| File | Runs in | Does |
| --- | --- | --- |
| `manifest.json` | — | Permissions. `activeTab` only: no standing access to any job board. |
| `icons/` | — | 16/32/48/128px, generated from `sartho.png`. Required by every store. |
| `popup.html` / `popup.js` | The popup | Scrapes on open, shows what was read, sends. |
| `scrape.js` | The job board tab, on demand | Reads the advert. Injected by the popup, never installed. |
| `background.js` | Service worker | Queues the capture, finds or opens Sartho. |
| `sartho-connector.js` | Sartho tabs | Hands the queued job to the app and clears it on acknowledgement. |

## Changing the scraper

`scrape.js` tries three strategies in order, and later ones fill gaps the
earlier one left rather than replacing it:

1. **`schema.org/JobPosting` in JSON-LD.** Most boards publish it because Google
   requires it to list a job. Prefer fixing this path — it is the one that does
   not break when a company renames a CSS class.
2. **Per-board selectors** for LinkedIn, Indeed and Seek.
3. **The visible page text**, which is usually wrong about the title and right
   about the description.

The last statement of the file is its result: `chrome.scripting.executeScript`
hands that value back to the popup, so the trailing IIFE must stay an
expression statement.

## An unpacked extension never updates itself

This has already cost an afternoon: a bug was reported against a build that no
longer existed, and the code it named was already correct. The popup shows its
version for that reason — check it before chasing a fix that has shipped. After
pulling, reload the extension at `chrome://extensions`.

## Not here, on purpose

**Autofilling an application.** An earlier version had the button. It asked the
web app for a profile over a message nothing answered, timed out, and fell back
to a name, email and phone number hardcoded during the prototype — so it either
failed or typed a stranger's identity into somebody's job application. Sartho
holds no contact details to type, so the honest state is no button.

**A match score in the popup.** Scoring needs the person's approved evidence,
which lives behind their Sartho session. The routes to it from the popup all
depend on a Sartho tab already being open, and a score that appears only
sometimes is worse than one that is always in the same place.
