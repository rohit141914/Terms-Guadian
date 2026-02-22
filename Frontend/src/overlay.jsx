import overlayStyles from "./overlay.css?inline";
import {
  POLICY_KEYWORDS,
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

// --- Step 1: Find T&C / Privacy Policy links on the page ---
function scanForPolicies() {
  const links = document.querySelectorAll("a[href]");
  const policyLinks = [];

  for (const link of links) {
    const text = link.textContent.toLowerCase().trim();
    const href = link.href;

    // Skip empty, javascript:, or anchor-only links
    if (!href || href.startsWith("javascript:") || href === "#") continue;

    const match = POLICY_KEYWORDS.some(
      (kw) => text.includes(kw) || href.toLowerCase().includes(kw.replace(/\s+/g, ""))
    );

    if (match && !policyLinks.some((p) => p.url === href)) {
      policyLinks.push({ url: href, label: link.textContent.trim() });
    }
  }

  if (policyLinks.length === 0) return; // No policy links found, don't show overlay

  analyzePolicies(policyLinks);
}

// --- Step 2: Fetch policy pages and extract text ---
async function analyzePolicies(policyLinks) {
  const host = createOverlayHost();
  showLoading(host);

  try {
    const policyTexts = await Promise.all(
      policyLinks.slice(0, MAX_POLICIES_TO_FETCH).map(async (link) => {
        try {
          const res = await fetch(link.url);
          const html = await res.text();
          const parser = new DOMParser();
          const doc = parser.parseFromString(html, "text/html");

          // Remove scripts, styles, navs, footers to get clean text
          doc
            .querySelectorAll(STRIPPED_ELEMENTS)
            .forEach((el) => el.remove());

          const text = doc.body?.innerText?.trim() || "";
          return { label: link.label, url: link.url, text: text.slice(0, MAX_POLICY_TEXT_LENGTH) };
        } catch {
          return null;
        }
      })
    );

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
      chrome.runtime.sendMessage({ type: MSG.SUMMARIZE, content: combined }, (res) => {
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
              <span class="tg-clause-badge" style="color:${cr.text};">${(c.risk || "info").toUpperCase()}</span>
              <p class="tg-clause-text">${escapeHTML(c.text)}</p>
              ${c.reason ? `<p class="tg-clause-reason">${escapeHTML(c.reason)}</p>` : ""}
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


