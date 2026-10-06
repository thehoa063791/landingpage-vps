import { DocumentProps, Head, Html, Main, NextScript } from "next/document";

export default function Document(props: DocumentProps) {
  const { locale } = props.__NEXT_DATA__;

  return (
    <Html lang={locale || "vi"} dir="ltr">
      <Head>
        <meta charSet="utf-8" />
        <link rel="icon" href="/dong-tien/favicon.svg" type="image/svg+xml" sizes="any" />
        <link rel="alternate icon" href="/dong-tien/favicon.svg" />
        <link rel="shortcut icon" href="/dong-tien/favicon.svg" />

        <link rel="stylesheet" href="/dong-tien/fonts/local-fonts.css" />
      </Head>
      <body className="antialiased">
        <Main />
        <script src="/dong-tien/api/project/meta-pixel" data-spa="true" data-config="/dong-tien/api/project/config" />
        <script src="/dong-tien/api/project/funnel-tracker" data-spa="true" data-funnel="dong-tien" data-api="/dong-tien/api/track" data-config="/dong-tien/api/project/config" />
        <NextScript />
      </body>
    </Html>
  );
}
