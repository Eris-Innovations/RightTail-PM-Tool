// Authenticated app shell — sidebar rail on the left, page content on
// the right. The (app) route-group layout wraps `children` in this
// component AFTER the auth gate has confirmed there's a signed-in user.

import SidebarNav from "@/components/layout/SidebarNav";

export default function AppLayout({ children }) {
  return (
    <div className="flex bg-background min-h-screen font-body">
      <SidebarNav />
      <div className="flex-1 flex flex-col min-w-0">{children}</div>
    </div>
  );
}
