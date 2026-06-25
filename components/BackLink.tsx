import Link from 'next/link';

// "Up one level" link shown at the top of detail pages (article -> home,
// tag/category detail -> their index). The arrow nudges left on hover, matching
// the site's other directional affordances.
export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="back-link">
      <span className="back-link-arrow" aria-hidden="true">←</span>
      {label}
    </Link>
  );
}
