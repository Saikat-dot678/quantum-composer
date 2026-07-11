import type { Config } from "tailwindcss";
export default { content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"], theme: { extend: { colors: { quantum: { 400: "#8b7cff", 500: "#6c5ce7", 600: "#5546d7" } }, boxShadow: { panel: "0 1px 2px rgba(16,24,40,.04), 0 8px 30px rgba(16,24,40,.06)" } } }, plugins: [] } satisfies Config;
