import type { Metadata } from "next";
import Link from "next/link";
import "./styles.css";

export const metadata: Metadata = {
  title: "What's in the Fridge?",
  description: "Find recipes you can make with the ingredients you already have.",
};

export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" dir="ltr">
      <body>
        <a className="skip-link" href="#main">Skip to content</a>
        <header className="site-header">
          <div className="shell">
            <Link className="brand" href="/"><span className="brand-mark" aria-hidden="true" /> What's in the Fridge?</Link>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
