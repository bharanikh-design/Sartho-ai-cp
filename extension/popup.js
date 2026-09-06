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
  const note = element("p", "note", "");

  render([card, send, readBy, note]);

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
