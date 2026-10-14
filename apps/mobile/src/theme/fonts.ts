// ─── Adding a new font ────────────────────────────────────────────────────────
// Fonts are bundled natively via the `expo-font` config plugin in `app.config.ts`
// (no JS-side `useFonts` hook). Steps:
//
//   1. Drop the font file into `src/assets/fonts/`.
//   2. Add its path to the `expo-font` plugin's `fonts: [...]` array in
//      `app.config.ts`.
//   3. Add an entry below using the correct platform-resolved name (see below).
//   4. Rebuild the dev client (`yarn ios` / `yarn android`) — a JS reload alone
//      will NOT pick up the new font; it has to be embedded into the native app.
//
// ─── How RN resolves `fontFamily` per platform ────────────────────────────────
// iOS     → matches the font's PostScript name (from the file's `name` table,
//           ID 6), NOT the filename. Inspect it before adding:
//
//             python3 -c "from fontTools.ttLib import TTFont; \
//               print(TTFont('src/assets/fonts/MyFont-Regular.ttf')['name'].getDebugName(6))"
//
//           Example surprise: `OpenSans-Regular.ttf` has PostScript name
//           `OpenSans` (no `-Regular` suffix), which is why `regular` below is
//           `'OpenSans'` and not `'OpenSans-Regular'`.
//
// Android → matches the file's basename without extension, case-sensitive
//           (e.g. `OpenSans-Regular.ttf` → `'OpenSans-Regular'`).
//
// When the PostScript name and basename diverge (as with OpenSans Regular),
// either use Platform.select for that entry, or re-export the font with a
// PostScript name that matches the basename. Five of the six OpenSans variants
// here happen to agree, so only `regular` is affected.

export const fonts = {
  openSan: {
    regular: 'OpenSans',
    regularItalic: 'OpenSans-Italic',
    semiBold: 'OpenSans-Semibold',
    semiBoldItalic: 'OpenSans-SemiboldItalic',
    bold: 'OpenSans-Bold',
    boldItalic: 'OpenSans-BoldItalic',
  },
};
