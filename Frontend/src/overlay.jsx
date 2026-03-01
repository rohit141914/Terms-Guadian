import overlayStyles from "./overlay.css?inline";
import {
  POLICY_BROAD_WORDS,
  RISK_COLORS,
  STRIPPED_ELEMENTS,
  MAX_POLICY_TEXT_LENGTH,
  MAX_POLICIES_TO_FETCH,
  MSG,
} from "./constants";
import { createCard, clearContent, dismiss, escapeHTML } from "./utils";

const domain = window.location.hostname;

// Skip browser internal pages
if (
  !domain ||
  domain === "newtab" ||
  window.location.protocol === "chrome:" ||
  window.location.protocol === "chrome-extension:"
) {
  // do nothing
} else {
  chrome.storage.local.get([domain], (result) => {
    if (result[domain]) return;
    scanForPolicies();
  });
}

// --- Step 1: Collect and pre-filter links, then send to LLM for precise identification ---
function scanForPolicies() {
  const seen = new Set();
  const candidateLinks = [];
  for (const a of document.querySelectorAll("a[href]")) {
    const href = a.href;
    if (!href || href.startsWith("javascript:") || href.startsWith("#")) continue;
    if (seen.has(href)) continue;
    seen.add(href);
    const label = a.textContent.replace(/\s+/g, " ").trim();
    const combined = (label + " " + href).toLowerCase();
    if (POLICY_BROAD_WORDS.some((w) => combined.includes(w))) {
      candidateLinks.push({ url: href, label: label || href });
    }
  }
  if (candidateLinks.length === 0) return;
  identifyAndAnalyze(candidateLinks);
}

// --- Step 1b: Ask LLM to filter out only policy links ---
async function identifyAndAnalyze(allLinks) {
  let host = null;
  try {
    const policyLinks = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { type: MSG.IDENTIFY_LINKS, links: allLinks, domain },
        (res) => res?.success ? resolve(res.data) : reject(new Error(res?.error || "Failed to identify links"))
      );
    });
    if (!policyLinks || policyLinks.length === 0) return; // no policy links — stay silent
    host = createOverlayHost();
    showLoading(host);
    await analyzePolicies(policyLinks, host);
  } catch (err) {
    console.error("Terms Guardian: Error identifying policy links:", err);
    if (host) showError(host);
  }
}

// --- Step 2: Fetch policy pages and extract text (via background to bypass CORS) ---
async function analyzePolicies(policyLinks, existingHost = null) {
  const host = existingHost ?? createOverlayHost();
  if (!existingHost) showLoading(host);

  try {
    const linksToFetch = policyLinks.slice(0, MAX_POLICIES_TO_FETCH);
    const fetchedPages = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { type: MSG.FETCH_POLICY_PAGES, links: linksToFetch },
        (res) => res?.success ? resolve(res.data) : reject(new Error(res?.error || "Failed to fetch policy pages"))
      );
    });

    // Parse HTML here — DOMParser is available in content scripts but not in service workers
    const policyTexts = (fetchedPages || []).map((page) => {
      if (!page) return null;
      const parser = new DOMParser();
      const doc = parser.parseFromString(page.html, "text/html");
      doc.querySelectorAll(STRIPPED_ELEMENTS).forEach((el) => el.remove());
      const text = (doc.body?.textContent || "").replace(/\s+/g, " ").trim();
      return { label: page.label, url: page.url, text: text.slice(0, MAX_POLICY_TEXT_LENGTH) };
    });

    const validPolicies = policyTexts.filter(Boolean);
    if (validPolicies.length === 0) {
      showError(host);
      return;
    }

    // Combine extracted policy text and send to backend
    const combined = validPolicies
      .map((p) => `[${p.label}]\n${p.text}`)
      .join("\n\n---\n\n");

    const response = await new Promise((resolve, reject) => {
      const links = validPolicies.map((p) => ({ label: p.label, url: p.url }));
      chrome.runtime.sendMessage({ type: MSG.SUMMARIZE, content: combined, domain, links }, (res) => {
        if (res?.success) resolve(res.data);
        else reject(new Error(res?.error || "Backend request failed"));
      });
    });

    showResult(host, response);
  } catch (err) {
    console.error("Terms Guardian: Error analyzing policies:", err);
    showError(host);
  }
}

// --- Shadow DOM host ---
function createOverlayHost() {
  const host = document.createElement("div");
  host.id = "terms-guardian-host";
  host.style.cssText =
    "all:initial; position:fixed; z-index:2147483647; bottom:20px; right:20px;";
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: "closed" });

  const style = document.createElement("style");
  style.textContent = overlayStyles;
  shadow.appendChild(style);

  return shadow;
}

// --- Loading State ---
function showLoading(shadow) {
  clearContent(shadow);
  const card = createCard();
  card.innerHTML = `
    <div class="tg-header">
      <span class="tg-logo">&#x1f6e1;</span>
      <span class="tg-title">Terms Guardian</span>
      <button class="tg-close" aria-label="Close">&times;</button>
    </div>
    <div class="tg-body tg-loading">
      <div class="tg-spinner"></div>
      <p>Scanning terms &amp; privacy policies...</p>
    </div>
  `;
  shadow.appendChild(card);
  card.querySelector(".tg-close").onclick = () => dismiss();
}

// --- Result State ---
function showResult(shadow, data) {
  clearContent(shadow);
  const card = createCard();

  const summary =
    typeof data === "string" ? data : data.summary || "No summary available.";
  const riskLevel = data.risk_level || "unknown";
  const clauses = data.clauses || [];

  const risk = RISK_COLORS[riskLevel] || RISK_COLORS.unknown;

  let clausesHTML = "";
  if (clauses.length > 0) {
    clausesHTML = `
      <div class="tg-clauses">
        <h4>Flagged Clauses</h4>
        ${clauses
          .map((c) => {
            const cr = RISK_COLORS[c.risk] || RISK_COLORS.unknown;
            return `
            <div class="tg-clause" style="border-left:3px solid ${cr.border}; background:${cr.bg};">
              <span class="tg-clause-badge" style="color:${cr.text};">${escapeHTML((c.risk || "info").toUpperCase())}</span>
              <p class="tg-clause-label">What the policy says</p>
              <p class="tg-clause-text">${escapeHTML(c.text)}</p>
              ${c.reason ? `<p class="tg-clause-label">Why this matters</p><p class="tg-clause-reason">${escapeHTML(c.reason)}</p>` : ""}
            </div>`;
          })
          .join("")}
      </div>
    `;
  }

  card.innerHTML = `
    <div class="tg-header">
      <span class="tg-logo">&#x1f6e1;</span>
      <span class="tg-title">Terms Guardian</span>
      <button class="tg-minimize" aria-label="Minimize">&#x2015;</button>
      <button class="tg-close" aria-label="Close">&times;</button>
    </div>
    <div class="tg-body">
      <div class="tg-risk-badge" style="background:${risk.bg}; border:1px solid ${risk.border}; color:${risk.text};">
        ${risk.label}
      </div>
      <div class="tg-summary">
        <h4>Summary</h4>
        <p>${escapeHTML(summary)}</p>
      </div>
      ${clausesHTML}
      <div class="tg-actions">
        <button class="tg-btn tg-btn-primary" id="tg-accept">I've read this &ndash; Don't show again</button>
        <button class="tg-btn tg-btn-ghost" id="tg-dismiss">Dismiss</button>
      </div>
    </div>
  `;

  shadow.appendChild(card);

  let minimized = false;
  const body = card.querySelector(".tg-body");
  card.querySelector(".tg-minimize").onclick = () => {
    minimized = !minimized;
    body.style.display = minimized ? "none" : "block";
    card.querySelector(".tg-minimize").innerHTML = minimized
      ? "&#x2750;"
      : "&#x2015;";
  };

  card.querySelector(".tg-close").onclick = () => dismiss();
  card.querySelector("#tg-dismiss").onclick = () => dismiss();
  card.querySelector("#tg-accept").onclick = () => {
    chrome.storage.local.set({ [domain]: true });
    dismiss();
  };
}

// --- Error State ---
function showError(shadow) {
  clearContent(shadow);
  const card = createCard();
  card.innerHTML = `
    <div class="tg-header">
      <span class="tg-logo">&#x1f6e1;</span>
      <span class="tg-title">Terms Guardian</span>
      <button class="tg-close" aria-label="Close">&times;</button>
    </div>
    <div class="tg-body tg-error">
      <p><strong>Could not analyze this page.</strong></p>
      <p>The backend service may be offline. Make sure it's running at <code>${import.meta.env.VITE_API_URL}</code>.</p>
      <button class="tg-btn tg-btn-ghost" id="tg-retry">Retry</button>
    </div>
  `;
  shadow.appendChild(card);
  card.querySelector(".tg-close").onclick = () => dismiss();
  card.querySelector("#tg-retry").onclick = () => {
    dismiss();
    scanForPolicies();
  };
}


