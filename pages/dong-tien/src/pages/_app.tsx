import "@/styles/globals.css";
import "@/features/dong-tien/styles/dong-tien.css";
import type { AppProps } from "next/app";
import ProjectTracking from "@/components/common/ProjectTracking";
import { Toaster } from "@/components/ui/sonner";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <ProjectTracking />
      <Toaster position="top-right" richColors />
      <Component {...pageProps} />
    </>
  );
}
