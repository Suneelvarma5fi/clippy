export const dynamic = "force-dynamic";

import { ExportTrackerProvider } from "@/lib/export-tracker";
import ShellClient from "./shell-client";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <ExportTrackerProvider>
      <ShellClient>{children}</ShellClient>
    </ExportTrackerProvider>
  );
}
