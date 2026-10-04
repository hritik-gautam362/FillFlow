import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'AI Discovery Chat Widget',
  description: 'Interactive AI project discovery chat widget',
  robots: 'noindex, nofollow',
};

export default function WidgetLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="w-full h-screen bg-transparent select-none overflow-hidden antialiased">
      {children}
    </div>
  );
}
