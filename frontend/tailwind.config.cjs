module.exports = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: "#ffffff",
        muted: "#6b7280",
        navy: "#0f172a"
      },
      boxShadow: {
        card: "0 1px 3px rgba(15, 23, 42, 0.08), 0 1px 2px rgba(15, 23, 42, 0.04)"
      }
    },
  },
  plugins: [],
};
