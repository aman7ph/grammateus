const themeToggle = document.getElementById("theme-toggle");
const themeIcon = document.getElementById("theme-icon");

const storedTheme = localStorage.getItem("grammateus-theme");

if (storedTheme) {
  document.documentElement.dataset.theme = storedTheme;
}

function getCurrentTheme() {
  return (
    document.documentElement.dataset.theme ||
    (window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light")
  );
}

function updateThemeIcon() {
  const isDark = getCurrentTheme() === "dark";

  themeIcon.textContent = isDark ? "☀" : "☾";
  themeToggle.setAttribute(
    "aria-label",
    isDark ? "Switch to light mode" : "Switch to dark mode",
  );
}

themeToggle.addEventListener("click", () => {
  const nextTheme = getCurrentTheme() === "dark" ? "light" : "dark";

  document.documentElement.dataset.theme = nextTheme;
  localStorage.setItem("grammateus-theme", nextTheme);

  updateThemeIcon();
});

updateThemeIcon();
