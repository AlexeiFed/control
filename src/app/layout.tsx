import type { Metadata } from "next";
import { Suspense } from "react";
import type { ReactNode } from "react";
import { NavigationProgress } from "../components/ui/navigation-progress";
import { ScrollToTopButton } from "../components/ui/scroll-to-top";
import { GlobalAlertsShell } from "../components/operations/global-alerts-shell";
import { Toaster } from "../components/ui/toaster";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vityaz ERP",
  description: "Closed security company ERP",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body>
        <Suspense fallback={null}>
          <NavigationProgress />
        </Suspense>
        {children}
        <Toaster />
        <ScrollToTopButton />
        <Suspense fallback={null}>
          <GlobalAlertsShell />
        </Suspense>
      </body>
    </html>
  );
}
