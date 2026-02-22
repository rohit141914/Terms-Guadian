export function createCard() {
  const card = document.createElement("div");
  card.className = "tg-card";
  return card;
}

export function clearContent(shadow) {
  const existing = shadow.querySelector(".tg-card");
  if (existing) existing.remove();
}

export function dismiss() {
  const host = document.getElementById("terms-guardian-host");
  if (host) host.remove();
}

export function escapeHTML(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
