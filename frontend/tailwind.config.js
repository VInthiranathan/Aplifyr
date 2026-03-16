module.exports = {
  darkMode: 'class',
  content: ["./pages/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      auth: {
          panel: "hsl(var(--auth-panel))",
          "panel-foreground": "hsl(var(--auth-panel-foreground))",
          environment: "hsl(var(--auth-environment))",
          divider: "hsl(var(--auth-divider))",
          "input-border": "hsl(var(--auth-input-border))",
        },
    }
  },
  plugins: []
}
