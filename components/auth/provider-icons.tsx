/*
 * The provider marks, kept as their real brand colours.
 *
 * Google's four-colour mark and the black GitHub/Apple glyphs are recognised by
 * shape and colour; a monochrome Google 'G' reads as a placeholder, not as
 * "sign in with Google". These are the only spots of brand colour the front
 * door borrows, and they are deliberately left true rather than tinted to match
 * the page.
 */

export function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.92h5.38a4.6 4.6 0 0 1-2 3.02v2.54h3.24c1.9-1.75 2.98-4.33 2.98-7.41Z" />
      <path fill="#34A853" d="M12 22c2.7 0 4.97-.9 6.62-2.36l-3.24-2.54c-.9.6-2.05.96-3.38.96-2.6 0-4.8-1.76-5.59-4.12H3.06v2.62A10 10 0 0 0 12 22Z" />
      <path fill="#FBBC05" d="M6.41 13.94A6.02 6.02 0 0 1 6.1 12c0-.67.12-1.33.31-1.94V7.44H3.06A10 10 0 0 0 2 12c0 1.61.38 3.14 1.06 4.56l3.35-2.62Z" />
      <path fill="#EA4335" d="M12 5.94c1.47 0 2.79.5 3.83 1.5l2.87-2.88A9.62 9.62 0 0 0 12 2a10 10 0 0 0-8.94 5.44l3.35 2.62C7.2 7.7 9.4 5.94 12 5.94Z" />
    </svg>
  );
}

export function GitHubIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M12 .7a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2.23c-3.22.7-3.9-1.37-3.9-1.37-.52-1.34-1.28-1.7-1.28-1.7-1.05-.72.08-.71.08-.71 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.57-.29-5.27-1.29-5.27-5.73 0-1.27.45-2.3 1.19-3.11-.12-.29-.52-1.47.11-3.07 0 0 .97-.31 3.16 1.19a10.9 10.9 0 0 1 5.76 0c2.2-1.5 3.16-1.19 3.16-1.19.63 1.6.23 2.78.11 3.07.74.81 1.19 1.84 1.19 3.11 0 4.45-2.71 5.43-5.29 5.72.42.36.79 1.07.79 2.16v3.2c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .7Z" />
    </svg>
  );
}

export function AppleIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M17.05 12.54c-.03-3.02 2.47-4.49 2.58-4.56a5.54 5.54 0 0 0-4.36-2.36c-1.83-.19-3.61 1.1-4.54 1.1-.95 0-2.38-1.08-3.93-1.05a5.78 5.78 0 0 0-4.86 2.96c-2.11 3.65-.54 9.02 1.49 11.97 1.02 1.45 2.2 3.07 3.75 3.01 1.52-.06 2.09-.97 3.93-.97 1.82 0 2.36.97 3.95.93 1.63-.02 2.66-1.46 3.64-2.93a12.1 12.1 0 0 0 1.67-3.4 5.2 5.2 0 0 1-3.32-4.7ZM14.08 3.68A5.27 5.27 0 0 0 15.29 0a5.36 5.36 0 0 0-3.46 1.75 5.02 5.02 0 0 0-1.24 3.54 4.43 4.43 0 0 0 3.49-1.61Z" />
    </svg>
  );
}

export const PROVIDER_META = {
  google: { label: "Google", Icon: GoogleIcon },
  github: { label: "GitHub", Icon: GitHubIcon },
  apple: { label: "Apple", Icon: AppleIcon },
} as const;
