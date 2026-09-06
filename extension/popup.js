/*
 * What the popup is for: show what was read off this page, and hand it to
 * Sartho in one click.
 *
 * It deliberately does not show a match score. Scoring needs the person's
 * approved evidence, which lives behind their Sartho session, and the honest
 * ways to reach it from here all depend on a Sartho tab already being open.
 * A score that appears only sometimes is worse than one that appears in a
 * consistent place — so the number lives in Sartho, and this window's job is to
 * prove it read the right advert before anything is saved.
 *
 * The scrape runs the moment the popup opens. Clicking the icon is the intent;
 * asking the person to then press "Analyse this page" was a button that only
 * ever had one answer.
 */

const body = document.getElementById("body");

/*
 * The installed version, on screen.
 *
 * An unpacked extension does not update itself, so somebody can be looking at
 * a build from before a fix and have no way to tell — which is exactly what
 * happened: a bug reported against a version that no longer existed, and an
 * afternoon spent looking for it in code that was already correct.
 */
try {
  const version = chrome.runtime.getManifest().version;
  const stamp = document.createElement("p");
  stamp.className = "sub";
  stamp.style.cssText = "margin:-10px 0 14px;font-size:11px;color:#6a6a6a";
  stamp.textContent = `v${version}`;
  document.querySelector(".sub")?.after(stamp);
} catch {
  /* Version is a convenience; never let it stop the popup rendering. */
}

/* Text, never markup: a job title is somebody else's HTML. */
function render(nodes) {
  body.replaceChildren(...nodes);
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function message(className, text) {
  render([element("p", `warn ${className}`, text)]);
}

const MIN_DESCRIPTION = 120;

(async () => {
  let tab;
  try {
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  } catch {
    message("error", "Sartho could not read this window.");
    return;
  }

  /*
   * Chrome refuses injection into its own pages, the Web Store, and PDFs. Said
   * plainly rather than surfacing the raw extension error, which reads like a
   * fault in Sartho.
   */
  if (!tab?.id || !/^https?:/i.test(tab.url || "")) {
    message("", "Open a job advert in a normal browser tab, then click Sartho again.");
    return;
  }

  let job;
  try {
    const [result] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["scrape.js"] });
    job = result?.result;
  } catch (caught) {
    message("error", `Sartho could not read this page. ${caught?.message ?? ""}`.trim());
    return;
  }

  if (!job) {
    message("error", "Sartho could not read this page.");
    return;
  }

  /*
   * Too little text is not a job advert. Saying how much was found, and where
   * it was read from, turns "it didn't work" into something a person can act
   * on — usually by scrolling the description into view first.
   */
  if (!job.description || job.description.length < MIN_DESCRIPTION) {
    render([
      element("p", "warn", "There is no job description on this page yet."),
      element("p", "note", job.description
        ? `Sartho found only ${job.description.length} characters. If the advert is behind a “See more” link, open it and click Sartho again.`
        : "Open the advert itself — not the results list — and click Sartho again."),
    ]);
    return;
  }

  /*
   * A page that is not an advert must say so before anything is sent.
   *
   * A LinkedIn feed post reported "Job successfully parsed (9790 chars)" and
   * offered to send somebody's personal story to the pipeline. It had parsed
   * perfectly; it was simply not a job. Nine thousand characters of prose is
   * not evidence of an advert, so the confidence the scraper reports is shown
   * rather than swallowed — and on a page that looks like neither an advert nor
   * a job address, sending is refused outright.
   */
  if (job.confidence === "low") {
    render([
      element("p", "warn", "This does not look like a job advert."),
      element("p", "note", "Sartho could only read the page's text, and the address is not a job posting — a feed, a search results list or a profile will read as nonsense in your pipeline. Open the advert itself and click Sartho again."),
    ]);
    return;
  }

  const card = element("div", "job");
  card.append(element("strong", null, job.title || "Untitled role"));
  card.append(element("span", "where", [job.company, job.location].filter(Boolean).join(" · ") || "Employer not named on the page"));

  const facts = element("div", "facts");
  facts.append(element("span", "fact", `${job.description.length.toLocaleString()} characters`));
  if (job.postedDate) facts.append(element("span", "fact", job.postedDate));
  if (job.applicants) facts.append(element("span", "fact", job.applicants));
  if (job.hiringManager) facts.append(element("span", "fact", `Hiring: ${job.hiringManager}`));
  card.append(facts);

  const send = element("button", null, "Send to Sartho →");
  const readBy = element("p", "read-by", `Read from ${job.readBy}. You can correct any of it in Sartho.`);

  /*
   * Medium confidence: the address looks like a job, but the text came off the
   * page rather than out of structured data. Worth sending, worth checking.
   */
  const caution = job.confidence === "medium"
    ? element("p", "warn", "Sartho read this off the page rather than from job data, so check the title and employer above before sending.")
    : null;
  const note = element("p", "note", "");

  render(caution ? [caution, card, send, readBy, note] : [card, send, readBy, note]);

  send.addEventListener("click", () => {
    send.disabled = true;
    send.textContent = "Sending…";
    note.textContent = "";

    chrome.runtime.sendMessage({ type: "SEND_TO_SARTHO", payload: job }, (response) => {
      /*
       * The window is not closed on success any more.
       *
       * It used to close the instant the message was handed off, which meant
       * every failure past that point — no Sartho tab, a lost message, a signed
       * out session — looked exactly like success. The popup now waits to be
       * told what happened, and says so.
       */
      const failure = chrome.runtime.lastError?.message || response?.error;
      if (failure) {
        send.disabled = false;
        send.textContent = "Send to Sartho →";
        note.textContent = failure;
        note.className = "warn error";
        return;
      }

      send.textContent = "✓ Sent";
      note.className = "warn ok";
      note.textContent = response?.opened
        ? "Sartho is opening in a new tab — the role lands in your pipeline there."
        : "Waiting for Sartho — the role appears in your pipeline as soon as that tab is open and signed in.";
      setTimeout(() => window.close(), 2200);
    });
  });
})();
