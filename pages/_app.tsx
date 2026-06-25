import type { AppProps } from 'next/app';
import { Analytics } from '@vercel/analytics/next';
import dynamic from 'next/dynamic';
import 'katex/dist/katex.min.css';
import '../styles/globals.css';
import { PageTransition } from '../components/fx/PageTransition';

// Client-only: the FX layer touches window/WebGL and must not run during SSR.
const FxRoot = dynamic(() => import('../components/fx/FxRoot').then((m) => m.FxRoot), {
  ssr: false,
});

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <Component {...pageProps} />
      <PageTransition />
      <FxRoot />
      <Analytics />
    </>
  );
}
