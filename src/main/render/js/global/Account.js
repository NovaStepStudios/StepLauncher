export function applyUsernameToDOM(name) {
  if (!name) return;

  const usernameElements = document.querySelectorAll("#Username");
  usernameElements.forEach((el) => {
    el.textContent = name;
  });
}

if (typeof window !== "undefined") {
  window.addEventListener("DOMContentLoaded", () => {
    if (window.userAPI?.getUsername) {
      const username = window.userAPI.getUsername();
      applyUsernameToDOM(username);
    }
  });
}
