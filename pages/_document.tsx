import { Html, Head, Main, NextScript } from 'next/document';

// Apply the saved theme before first paint to avoid a flash of the wrong
// background. Mirrors the Kiwi design's localStorage('kiwi-blog-theme') key.
const themeScript = `
(function(){
  try {
    var t = localStorage.getItem('kiwi-blog-theme');
    if (t === 'dark') document.documentElement.dataset.theme = 'dark';
    // Hide reveal elements before first paint (no FOUC) only when motion is
    // allowed; the FX layer's IntersectionObserver reveals them on scroll.
    var rm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!rm) document.documentElement.classList.add('fx-ready');
  } catch (e) {}
})();
`;

export default function Document() {
  return (
    <Html>
      <Head>
        {/* Default favicon (an accent dot, matching the "Codgi." wordmark) so
            the browser's /favicon.ico request doesn't 404. site.favicon, when
            set, is added in Layout's <Head> and takes precedence. */}
        <link
          rel="icon"
          href="data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%2032%2032'%3E%3Ccircle%20cx='16'%20cy='16'%20r='9'%20fill='%2316a06a'/%3E%3C/svg%3E"
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,700;0,900;1,400;1,500&family=Space+Grotesk:wght@300;400;500;600;700&family=IBM+Plex+Mono:wght@300;400;500&display=swap"
          rel="stylesheet"
        />
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css"
        />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
