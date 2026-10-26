import { DocumentProps, Head, Html, Main, NextScript } from "next/document";
import { courseFromPath } from "@/lib/courses";
import { URL_EMAIL_SCRIPT } from "@/lib/urlIdentity";

export default function Document(props: DocumentProps) {
  const { locale, page } = props.__NEXT_DATA__;
  // Tracking scripts and the funnel ID follow the course of the rendered page.
  const api = `/${courseFromPath(page)}/api`;

  return (
    <Html lang={locale || "vi"} dir="ltr">
      <Head>
        <meta charSet="utf-8" />
        <script dangerouslySetInnerHTML={{ __html: URL_EMAIL_SCRIPT }} />
        <link rel="icon" href="/dong-tien/favicon.svg" type="image/svg+xml" sizes="any" />
        <link rel="alternate icon" href="/dong-tien/favicon.svg" />
        <link rel="shortcut icon" href="/dong-tien/favicon.svg" />

        <link rel="stylesheet" href="/dong-tien/fonts/local-fonts.css" />
      </Head>
      <body className="antialiased">
        {/* Mã nhúng of the funnel (Admin > Funnels > Mã nhúng), added to head and body by the script. */}
        <script src={`${api}/project/custom-code`} />
        <Main />
        <script src={`${api}/project/meta-pixel`} data-spa="true" data-config={`${api}/project/config`} />
        <script src={`${api}/project/funnel-tracker`} data-spa="true" data-funnel={courseFromPath(page)} data-api={`${api}/track`} data-config={`${api}/project/config`} />
        <NextScript />
      </body>
    </Html>
  );
}
