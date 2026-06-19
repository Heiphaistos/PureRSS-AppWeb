import { ref } from "vue";

export interface Theme {
  id: string; name: string; emoji: string;
  vars: Record<string, string>;
}

export const THEMES: Theme[] = [
  { id: "github-dark", name: "GitHub Dark", emoji: "🌑", vars: {
    "--bg": "#0d1117", "--bg2": "#161b22", "--bg3": "#21262d", "--border": "#30363d",
    "--text": "#e6edf3", "--text-muted": "#8b949e", "--accent": "#58a6ff", "--accent-hover": "#79b8ff",
    "--red": "#f85149", "--green": "#56d364", "--yellow": "#f0b429", "--orange": "#f0883e",
    "--teal": "#39d353", "--indigo": "#6e76f0", "--purple": "#9146ff", "--pink": "#db61a2", "--discord": "#5865f2",
  }},
  { id: "light", name: "Light", emoji: "☀️", vars: {
    "--bg": "#ffffff", "--bg2": "#f6f8fa", "--bg3": "#eaeef2", "--border": "#d0d7de",
    "--text": "#1f2328", "--text-muted": "#656d76", "--accent": "#0969da", "--accent-hover": "#1a7de3",
    "--red": "#cf222e", "--green": "#1a7f37", "--yellow": "#9a6700", "--orange": "#bc4c00",
    "--teal": "#1a7f37", "--indigo": "#5a3e9b", "--purple": "#8250df", "--pink": "#bf3989", "--discord": "#5865f2",
  }},
  { id: "dracula", name: "Dracula", emoji: "🧛", vars: {
    "--bg": "#282a36", "--bg2": "#1e1f29", "--bg3": "#44475a", "--border": "#44475a",
    "--text": "#f8f8f2", "--text-muted": "#6272a4", "--accent": "#bd93f9", "--accent-hover": "#caa9f9",
    "--red": "#ff5555", "--green": "#50fa7b", "--yellow": "#f1fa8c", "--orange": "#ffb86c",
    "--teal": "#8be9fd", "--indigo": "#6272a4", "--purple": "#bd93f9", "--pink": "#ff79c6", "--discord": "#5865f2",
  }},
  { id: "catppuccin", name: "Catppuccin Mocha", emoji: "🐱", vars: {
    "--bg": "#1e1e2e", "--bg2": "#181825", "--bg3": "#313244", "--border": "#45475a",
    "--text": "#cdd6f4", "--text-muted": "#a6adc8", "--accent": "#89b4fa", "--accent-hover": "#b4d0fb",
    "--red": "#f38ba8", "--green": "#a6e3a1", "--yellow": "#f9e2af", "--orange": "#fab387",
    "--teal": "#94e2d5", "--indigo": "#b4befe", "--purple": "#cba6f7", "--pink": "#f5c2e7", "--discord": "#5865f2",
  }},
  { id: "nord", name: "Nord", emoji: "❄️", vars: {
    "--bg": "#2e3440", "--bg2": "#242831", "--bg3": "#3b4252", "--border": "#434c5e",
    "--text": "#eceff4", "--text-muted": "#d8dee9", "--accent": "#88c0d0", "--accent-hover": "#9ecfdf",
    "--red": "#bf616a", "--green": "#a3be8c", "--yellow": "#ebcb8b", "--orange": "#d08770",
    "--teal": "#8fbcbb", "--indigo": "#81a1c1", "--purple": "#b48ead", "--pink": "#b48ead", "--discord": "#5865f2",
  }},
  { id: "gruvbox", name: "Gruvbox Dark", emoji: "🪵", vars: {
    "--bg": "#282828", "--bg2": "#1d2021", "--bg3": "#3c3836", "--border": "#504945",
    "--text": "#ebdbb2", "--text-muted": "#a89984", "--accent": "#83a598", "--accent-hover": "#98baad",
    "--red": "#fb4934", "--green": "#b8bb26", "--yellow": "#fabd2f", "--orange": "#fe8019",
    "--teal": "#8ec07c", "--indigo": "#458588", "--purple": "#b16286", "--pink": "#d3869b", "--discord": "#5865f2",
  }},
  { id: "tokyo-night", name: "Tokyo Night", emoji: "🌆", vars: {
    "--bg": "#1a1b26", "--bg2": "#16161e", "--bg3": "#24283b", "--border": "#292e42",
    "--text": "#c0caf5", "--text-muted": "#565f89", "--accent": "#7aa2f7", "--accent-hover": "#92b3f8",
    "--red": "#f7768e", "--green": "#9ece6a", "--yellow": "#e0af68", "--orange": "#ff9e64",
    "--teal": "#73daca", "--indigo": "#7dcfff", "--purple": "#bb9af7", "--pink": "#f7768e", "--discord": "#5865f2",
  }},
  { id: "solarized", name: "Solarized Dark", emoji: "🌅", vars: {
    "--bg": "#002b36", "--bg2": "#073642", "--bg3": "#094051", "--border": "#0a5060",
    "--text": "#fdf6e3", "--text-muted": "#657b83", "--accent": "#268bd2", "--accent-hover": "#3a9de0",
    "--red": "#dc322f", "--green": "#859900", "--yellow": "#b58900", "--orange": "#cb4b16",
    "--teal": "#2aa198", "--indigo": "#6c71c4", "--purple": "#6c71c4", "--pink": "#d33682", "--discord": "#5865f2",
  }},
];

const STORAGE_KEY = "purerss-theme";
const currentThemeId = ref<string>(localStorage.getItem(STORAGE_KEY) ?? "github-dark");

function applyTheme(themeId: string) {
  const theme = THEMES.find(t => t.id === themeId) ?? THEMES[0];
  const root = document.documentElement;
  for (const [key, val] of Object.entries(theme.vars)) {
    root.style.setProperty(key, val);
  }
  document.documentElement.setAttribute("data-theme", themeId);
  localStorage.setItem(STORAGE_KEY, themeId);
  currentThemeId.value = themeId;
}

export function useTheme() {
  function setTheme(id: string) { applyTheme(id); }
  function initTheme() { applyTheme(currentThemeId.value); }
  return { themes: THEMES, currentThemeId, setTheme, initTheme };
}
