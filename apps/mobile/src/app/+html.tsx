import React from 'react';
import { ScrollViewStyleReset } from 'expo-router/html';

// Web-only — wraps the root HTML document during static rendering / web
// builds. Has no effect on iOS/Android. The function body runs in Node.js
// during build, so it has no access to DOM or browser APIs.
//
// Mirrors the light/dark backgrounds from `src/styles/themes.ts` so the page
// shell doesn't flash white on a dark-mode device before React mounts.
export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta content="IE=edge" httpEquiv="X-UA-Compatible" />
        {/*
         * Disables user scaling so the web build behaves more like the native
         * app. If you ever ship a content-heavy web view where pinch-zoom is
         * desirable, switch to:
         *   <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
         */}
        <meta
          content="width=device-width,initial-scale=1,minimum-scale=1,maximum-scale=1.00001,viewport-fit=cover"
          name="viewport"
        />
        {/*
         * Disables body scrolling on web so ScrollView behaves like on
         * native. Remove this line if you want the page itself to scroll.
         */}
        <ScrollViewStyleReset />
        {/* Prevents a white flash before React mounts on dark-mode devices. */}
        <style dangerouslySetInnerHTML={{ __html: responsiveBackground }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

const responsiveBackground = `
body {
  background-color: #ffffff;
}
@media (prefers-color-scheme: dark) {
  body {
    background-color: #000000;
  }
}`;
