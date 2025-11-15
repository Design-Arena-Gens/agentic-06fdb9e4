export const metadata = {
  title: 'AI Lip Sync Avatar',
  description: 'Animate avatars with speech and emotion control',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <div className="min-h-screen flex flex-col">
          <header className="border-b border-neutral-800 bg-neutral-950/80 backdrop-blur supports-[backdrop-filter]:bg-neutral-950/60 sticky top-0 z-40">
            <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded bg-gradient-to-br from-fuchsia-500 to-cyan-400" />
                <h1 className="text-lg font-semibold tracking-tight">AI Lip Sync Avatar</h1>
              </div>
              <nav className="text-sm text-neutral-400">
                <a className="hover:text-neutral-200" href="https://github.com/Design-Arena-Gens/agentic-06fdb9e4" target="_blank" rel="noreferrer">GitHub</a>
              </nav>
            </div>
          </header>
          <main className="flex-1">{children}</main>
          <footer className="border-t border-neutral-800 text-sm text-neutral-400">
            <div className="mx-auto max-w-7xl px-4 py-4">
              Built for Vercel. Set env keys to enable AI features.
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
