/*
 * Read the job advert off whatever page the person is looking at.
 *
 * Injected into the active tab on demand, so it needs no standing permission
 * on any job board: clicking the extension's icon is what grants access, and
 * only to that tab, only for that moment. An extension that can read LinkedIn
 * whenever it likes is a worse trade than one the person triggers.
 *
 * Three strategies, tried in order, because the first one that works is the
 * one least likely to break:
 *
 *   1. schema.org JobPosting in a JSON-LD block. Indeed, Seek, Greenhouse,
 *      Lever, Workday and a great many company careers pages publish it —
 *      Google requires it to list a job — and it names the title, employer,
 *      location and date rather than making us guess from CSS classes.
 *   2. Selectors for the boards that don't, or don't always.
 *   3. The visible text of the page.
 *
 * The old version had only 2 and 3, with LinkedIn class names hardcoded, and a
 * class name is a thing a company changes on a Tuesday without telling anyone.
 *
 * The last statement of this file is its result: chrome.scripting.executeScript
 * hands that value back to the popup.
 */

(() => {
  const MAX_DESCRIPTION = 24000;

  /*
   * The non-breaking space is spelled \u00a0 rather than typed. Job boards are
   * full of them, and a literal one sitting inside a regex is invisible in a
   * diff and silently deleted by the next person to tidy this line.
   */
  const clean = (value) =>
    typeof value === "string"
      ? value.replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim()
      : "";

  /*
   * The furniture of the page, as opposed to the advert on it.
   *
   * A capture came back reading "121 school alumni work here", "Be an early
   * applicant" and "Posted 1 day ago" three times over — in the field Sartho
   * labels "the exact source used for every analysis and résumé decision".
   * Every requirement assessment, every résumé bullet and every match score is
   * grounded in this text, so page chrome here is not untidy, it is Sartho
   * confidently analysing a navigation bar.
   *
   * Two rules have to hold at once, and the second matters more:
   *
   *   - a line that is plainly chrome goes;
   *   - a line that might be a requirement stays, always.
   *
   * So a line is only ever dropped when it BOTH matches one of these patterns
   * AND is short. Each pattern is anchored end to end, so it matches a whole
   * line rather than appearing inside one — "Posted 1 day ago" goes, while a
   * sentence that happens to contain those words does not. A real requirement
   * has no way to match: "5+ years of ServiceNow delivery" is short but looks
   * nothing like any of these.
   */
  const CHROME_LINE_MAX = 90;

  const PAGE_CHROME = [
    /* Recency and applicant counts — LinkedIn, Indeed, Seek all carry these. */
    /^(re)?posted\s+.{0,24}\s*ago\b.{0,12}$/i,
    /^posted\s+(today|yesterday)\b.{0,12}$/i,
    /^(be an early applicant|be among the first\s+\d[\d,]*\s+applicants?)\.?$/i,
    /^(over\s+)?\d[\d,]*\+?\s+(people\s+)?(clicked\s+)?appl(y|ied|icants?)\b.{0,24}$/i,
    /^\d[\d,]*\s+(school\s+|company\s+)?(alumni|connections?|employees?)\s+work(s)?\s+here\.?$/i,
    /^actively\s+(recruiting|reviewing applicants)\.?$/i,
    /^promoted\b.{0,24}$/i,
    /^(easy\s+apply|apply\s+now|apply\s+on\s+.{1,30}|save|saved|share|report\s+this\s+job)\.?$/i,
    /^(show|see|read|view)\s+(more|less|all)\b.{0,20}$/i,
    /^(sign\s+in|join\s+now|skip\s+to\s+.{1,30}|continue\s+with\s+.{1,20})\.?$/i,
    /^(your\s+profile\s+matches|am\s+i\s+a\s+good\s+fit|how\s+your\s+profile\s+matches)\b.{0,40}$/i,
    /^(matches\s+your\s+(job\s+)?preferences?)\b.{0,50}$/i,
    /^\d+\s+of\s+\d+$/,
    /* A bare working-pattern chip, which the advert states properly elsewhere. */
    /^(full[\s-]?time|part[\s-]?time|contract|temporary|internship|permanent|remote|hybrid|on[\s-]?site)\.?$/i,
  ];

  const isPageChrome = (line) => {
    const value = line.trim().replace(/^[•\-–—*·]\s*/, "");
    if (!value || value.length > CHROME_LINE_MAX) return false;
    return PAGE_CHROME.some((pattern) => pattern.test(value));
  };

  /*
   * Chrome removed, and a line repeated back to back collapsed to one.
   *
   * The repetition is its own tell: "Posted 1 day ago" appeared three times in
   * that capture, because the same widget is rendered at several sizes and the
   * text reader cannot see which one the person is looking at. Only identical
   * neighbouring lines are collapsed, and only short ones — a long paragraph
   * repeating is the advert's own doing and none of our business.
   */
  const stripPageChrome = (text) => {
    if (typeof text !== "string" || !text) return "";
    const kept = [];
    for (const line of text.split("\n")) {
      if (isPageChrome(line)) continue;
      const trimmed = line.trim();
      const previous = kept.length ? kept[kept.length - 1].trim() : null;
      if (trimmed && trimmed === previous && trimmed.length <= CHROME_LINE_MAX) continue;
      kept.push(line);
    }
    return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  };

  /* JSON-LD descriptions are HTML. Parsed as markup, never pasted as tags. */
  const textFromHtml = (html) => {
    if (typeof html !== "string" || !html) return "";
    if (!/[<&]/.test(html)) return clean(html);
    const holder = document.createElement("div");
    holder.innerHTML = html;
    /* A list item reads as a requirement only if it keeps its own line. */
    holder.querySelectorAll("li").forEach((item) => item.insertAdjacentText("beforebegin", "\n• "));
    holder.querySelectorAll("br, p, div, h1, h2, h3, h4").forEach((node) => node.insertAdjacentText("afterend", "\n"));
    return clean(holder.textContent || "");
  };

  /* schema.org allows a bare string, an object, or an array, at nearly every field. */
  const firstOf = (value) => (Array.isArray(value) ? value[0] : value);

  const nameOf = (value) => {
    const item = firstOf(value);
    if (!item) return "";
    if (typeof item === "string") return clean(item);
    return clean(item.name || "");
  };

  const placeOf = (value) => {
    const item = firstOf(value);
    if (!item) return "";
    if (typeof item === "string") return clean(item);
    const address = firstOf(item.address) || {};
    if (typeof address === "string") return clean(address);
    const parts = [address.addressLocality, address.addressRegion, address.addressCountry]
      .map((part) => (typeof part === "string" ? part : part?.name))
      .filter((part) => typeof part === "string" && part.trim());
    return clean([...new Set(parts)].join(", ")) || clean(item.name || "");
  };

  /* Every JSON-LD node on the page, including those nested in @graph. */
  const jsonLdNodes = () => {
    const nodes = [];
    for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
      let parsed;
      try {
        parsed = JSON.parse(script.textContent || "");
      } catch {
        continue; // a malformed block is not a reason to stop reading the page
      }
      const queue = Array.isArray(parsed) ? [...parsed] : [parsed];
      while (queue.length) {
        const node = queue.shift();
        if (!node || typeof node !== "object") continue;
        if (Array.isArray(node["@graph"])) queue.push(...node["@graph"]);
        nodes.push(node);
      }
    }
    return nodes;
  };

  const fromJsonLd = () => {
    for (const node of jsonLdNodes()) {
      const type = node["@type"];
      const types = Array.isArray(type) ? type : [type];
      if (!types.some((entry) => typeof entry === "string" && entry.toLowerCase() === "jobposting")) continue;

      const description = textFromHtml(node.description);
      if (!description) continue; // a JobPosting with no body is not usable

      return {
        title: clean(node.title) || clean(node.name),
        company: nameOf(node.hiringOrganization),
        location: node.jobLocationType && !node.jobLocation ? "Remote" : placeOf(node.jobLocation),
        description,
        postedDate: clean(node.datePosted),
        readBy: "structured data",
      };
    }
    return null;
  };

  /* The boards worth naming, and only the parts JSON-LD tends to miss. */
  const fromSelectors = () => {
    const host = location.hostname;
    const text = (selectors) => {
      for (const selector of selectors) {
        let node = null;
        try {
          node = document.querySelector(selector);
        } catch {
          continue; // a selector this browser cannot parse is skipped, not fatal
        }
        const value = clean(node?.innerText || "");
        if (value) return value;
      }
      return "";
    };

    if (host.includes("linkedin.com")) {
      return {
        title: text([".job-details-jobs-unified-top-card__job-title", ".topcard__title", "h1"]),
        company: text([".job-details-jobs-unified-top-card__company-name", ".topcard__org-name-link", 'a[href*="/company/"]']),
        location: text([".job-details-jobs-unified-top-card__tertiary-description-container span:first-child", ".topcard__flavor--bullet"]),
        description: text(["#job-details", ".jobs-description__content", ".jobs-description", ".description__text"]),
        postedDate: "",
        readBy: "the LinkedIn page",
      };
    }
    if (host.includes("indeed.com")) {
      return {
        title: text(['[data-testid="jobsearch-JobInfoHeader-title"]', "h1"]),
        company: text(['[data-testid="inlineHeader-companyName"]', '[data-company-name="true"]']),
        location: text(['[data-testid="inlineHeader-companyLocation"]', '[data-testid="job-location"]']),
        description: text(["#jobDescriptionText", ".jobsearch-JobComponent-description"]),
        postedDate: text(['[data-testid="jobsearch-JobInfoHeader-date"]']),
        readBy: "the Indeed page",
      };
    }
    if (host.includes("seek.com")) {
      return {
        title: text(['[data-automation="job-detail-title"]', "h1"]),
        company: text(['[data-automation="advertiser-name"]']),
        location: text(['[data-automation="job-detail-location"]']),
        description: text(['[data-automation="jobAdDetails"]']),
        postedDate: "",
        readBy: "the Seek page",
      };
    }
    return null;
  };

  /*
   * Last resort: the readable text of the page. Wrong more often than the other
   * two, which is why the popup shows what it read and lets the person correct
   * it in Sartho before anything is saved.
   */
  const fromPage = () => {
    const main = document.querySelector("main") || document.querySelector("article") || document.body;
    return {
      title: clean(document.querySelector("h1")?.innerText || document.title),
      company: "",
      location: "",
      description: clean(main.innerText || ""),
      postedDate: "",
      readBy: "the page text",
    };
  };

  /*
   * Later strategies fill gaps the earlier one left, rather than replacing it.
   * JSON-LD frequently omits the location while the page shows it plainly.
   */
  const merge = (base, extra) => {
    if (!extra) return base;
    const merged = { ...base };
    for (const key of ["title", "company", "location", "postedDate"]) {
      if (!merged[key] && extra[key]) merged[key] = extra[key];
    }
    if (!merged.description && extra.description) {
      merged.description = extra.description;
      /*
       * Where the body came from, not where the title came from. Without this
       * a LinkedIn feed post reported "read from the LinkedIn page" — the
       * selectors matched an h1 and nothing else, and the actual text was
       * scraped off the page as a last resort. Saying which is the difference
       * between a confident read and a guess.
       */
      merged.readBy = extra.readBy;
    }
    return merged;
  };

  /*
   * Is this a job advert at all?
   *
   * A LinkedIn feed post is nine thousand characters of somebody's personal
   * story, and the last-resort strategy will happily hand it over as a job. It
   * parsed cleanly, reported "successfully parsed", and was nonsense. Anything
   * read off the page rather than out of structured data or a known board's
   * markup is only trusted when the address looks like an advert.
   */
  const JOB_URL = /\/jobs?\/|\/viewjob|\/job-|\/vacanc|\/career|\/position|\/opening|greenhouse\.io|lever\.co|myworkdayjobs|smartrecruiters|workable|jobs?\./i;
  const addressLooksLikeAJob = JOB_URL.test(location.href);

  let job = null;
  try {
    job = fromJsonLd();
  } catch {
    job = null;
  }

  let selectors = null;
  try {
    selectors = fromSelectors();
  } catch {
    selectors = null;
  }

  if (!job || !job.description) job = merge(selectors || fromPage(), job);
  else job = merge(job, selectors);

  if (!job.description) job = merge(job, fromPage());

  /*
   * Structured data and a board's own job markup are the advert by definition.
   * The page-text fallback is a guess, and the address is the only other
   * evidence available about whether the guess is a reasonable one.
   */
  const confidence = job.readBy !== "the page text"
    ? "high"
    : addressLooksLikeAJob ? "medium" : "low";

  /*
   * LinkedIn's applicant count and hiring contact, when the page shows them.
   * Kept apart from the advert itself because they are context about the
   * competition, not a requirement of the role, and Sartho labels them so.
   */
  let applicants = "";
  let hiringManager = "";
  let jobPoster = "";
  let applyUrl = "";
  try {
    if (location.hostname.includes("linkedin.com")) {
      /*
       * Scoped to the header, and matched on textContent.
       *
       * The first version read innerText off every span and li on the page.
       * innerText forces the browser to lay the element out to work out what is
       * visible, so on a LinkedIn job page — thousands of nodes — that is
       * thousands of forced reflows, and the popup sat there for seconds
       * gathering a line of trivia. textContent is free, and the one node that
       * matches is the only one worth laying out.
       */
      const header = document.querySelector(".job-details-jobs-unified-top-card__primary-description-container")
        || document.querySelector(".jobs-unified-top-card")
        || document.querySelector(".topcard__flavor-row")
        || document.querySelector("main");
      const applicantNode = header
        ? Array.from(header.querySelectorAll("span, li"))
          .find((node) => /\b\d[\d,]*\s+applicant|be among the first/i.test(node.textContent || ""))
        : null;
      if (applicantNode) applicants = clean(applicantNode.innerText || applicantNode.textContent).slice(0, 120);

      const hirer = document.querySelector(".hirer-card__hirer-information a, .jobs-poster__name, .job-details-jobs-unified-top-card__hirer-name");
      if (hirer) hiringManager = clean(hirer.innerText).split("\n")[0].slice(0, 120);
      const poster = document.querySelector(".jobs-poster__name, .hirer-card__hirer-information a");
      if (poster) jobPoster = clean(poster.innerText || poster.textContent).split("\n")[0].slice(0, 120);
      const apply = document.querySelector('a.jobs-apply-button[href], a[href*="/apply/"], a[href*="apply"][data-control-name]');
      if (apply?.href && /^https:\/\//i.test(apply.href)) applyUrl = apply.href.slice(0, 2000);
    }
  } catch {
    /* Context is a nicety. Losing it must never cost us the advert. */
  }

  /*
   * Applied once, here, rather than inside each strategy.
   *
   * All three funnel through this return, and the chrome arrives by more than
   * one route — the page-text fallback sweeps it up wholesale, and a board's
   * own description container can have widgets nested inside it. Filtering at
   * the exit means no strategy can be added later that quietly skips it.
   */
  const description = stripPageChrome(job.description || "");

  return {
    title: (job.title || "").slice(0, 240),
    company: (job.company || "").slice(0, 240),
    location: (job.location || "").slice(0, 240),
    description: description.slice(0, MAX_DESCRIPTION),
    postedDate: (job.postedDate || "").slice(0, 120),
    applicants,
    hiringManager,
    jobPoster,
    applyUrl,
    capturedAt: new Date().toISOString(),
    readBy: job.readBy || "the page text",
    confidence,
    url: location.href,
  };
})();
