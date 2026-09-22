import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.commandminelabs.aineko",
  appName: "Aineko",
  webDir: "out",
  backgroundColor: "#12121a",
  ios: {
    contentInset: "never",
    backgroundColor: "#12121a",
    preferredContentMode: "mobile",
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 1500,
      launchFadeOutDuration: 200,
      backgroundColor: "#12121a",
      showSpinner: false,
    },
    Keyboard: {
      // Resizes the actual WKWebView frame around the keyboard, natively and in sync
      // with its animation -- this is the real fix for the "top bar floats away" glitch
      // from testing in mobile Safari. That glitch was Safari panning its own visual
      // viewport (a mobile-browser-chrome quirk, not something WKWebView does), which is
      // exactly why it should stop reproducing once this is running as the actual app.
      resize: "native",
    },
  },
};

export default config;
