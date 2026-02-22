// Policy detection keywords
export const POLICY_KEYWORDS = [
  "terms of service",
  "terms and conditions",
  "terms of use",
  "privacy policy",
  "privacy notice",
  "cookie policy",
  "legal notice",
  "data policy",
];

// Risk level color mapping
export const RISK_COLORS = {
  high: { bg: "#fef2f2", border: "#fca5a5", text: "#991b1b", label: "High Risk" },
  medium: { bg: "#fffbeb", border: "#fcd34d", text: "#92400e", label: "Medium Risk" },
  low: { bg: "#f0fdf4", border: "#86efac", text: "#166534", label: "Low Risk" },
  unknown: { bg: "#f8fafc", border: "#cbd5e1", text: "#475569", label: "Analyzed" },
};

// Elements to strip when extracting policy page text
export const STRIPPED_ELEMENTS = "script, style, nav, footer, header, iframe, noscript";

// Limits
export const MAX_POLICY_TEXT_LENGTH = 5000;
export const MAX_POLICIES_TO_FETCH = 3;

// Message types (shared between background, popup, and content script)
export const MSG = {
  GET_DISMISSED_DOMAINS: "GET_DISMISSED_DOMAINS",
  RESET_DOMAIN: "RESET_DOMAIN",
  RESET_ALL_DOMAINS: "RESET_ALL_DOMAINS",
  SUMMARIZE: "SUMMARIZE",
};
