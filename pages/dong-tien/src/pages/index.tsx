import type { GetServerSideProps } from "next";

// Nginx sends only course paths here; the bare app root opens the Trading funnel.
export const getServerSideProps: GetServerSideProps = async () => ({
  redirect: { destination: "/trading", permanent: false },
});

export default function Root() {
  return null;
}
