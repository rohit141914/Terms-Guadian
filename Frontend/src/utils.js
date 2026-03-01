export function createCard() {
  const card = document.createElement("div");
  card.className = "rr-card";
  return card;
}

export function clearContent(shadow) {
  const existing = shadow.querySelector(".rr-card");
  if (existing) existing.remove();
}

export function dismiss() {
  const host = document.getElementById("read-rules-host");
  if (host) host.remove();
}

export function escapeHTML(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
