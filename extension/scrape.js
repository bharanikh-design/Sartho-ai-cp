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
    if (!merged.description && extra.description) merged.description = extra.description;
    return merged;
  };

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
   * LinkedIn's applicant count and hiring contact, when the page shows them.
   * Kept apart from the advert itself because they are context about the
   * competition, not a requirement of the role, and Sartho labels them so.
   */
  let applicants = "";
  let hiringManager = "";
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
    }
  } catch {
    /* Context is a nicety. Losing it must never cost us the advert. */
  }

  return {
    title: (job.title || "").slice(0, 240),
    company: (job.company || "").slice(0, 240),
    location: (job.location || "").slice(0, 240),
    description: (job.description || "").slice(0, MAX_DESCRIPTION),
    postedDate: (job.postedDate || "").slice(0, 120),
    applicants,
    hiringManager,
    readBy: job.readBy || "the page text",
    url: location.href,
  };
})();
