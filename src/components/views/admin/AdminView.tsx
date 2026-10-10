import { lazy, Suspense } from "react";
import type { ComponentType, LazyExoticComponent } from "react";
import { EmptyState, Loading } from "@/components/data/parts";
import type { AdminSection } from "@/store/sessionsStore";
import type { ViewProps } from "../types";
import type { SectionProps } from "./shared";

/** Each section is its own chunk, loaded when first shown. */
const SECTIONS: Record<AdminSection, LazyExoticComponent<ComponentType<SectionProps>>> = {
  users: lazy(() => import("./sections/UsersSection")),
  vhosts: lazy(() => import("./sections/VhostsSection")),
  policies: lazy(() => import("./sections/PoliciesSection")),
  limits: lazy(() => import("./sections/LimitsSection")),
  flags: lazy(() => import("./sections/FlagsSection")),
  federation: lazy(() => import("./sections/FederationSection")),
  shovels: lazy(() => import("./sections/ShovelsSection")),
  definitions: lazy(() => import("./sections/DefinitionsSection")),
};

export default function AdminView({ tab, shown }: ViewProps) {
  const cid = tab.connection?.id;
  if (!cid) return <EmptyState title="Admin needs a connection">Open it from a connection's Admin folder.</EmptyState>;
  const Section = SECTIONS[tab.section ?? "users"];
  return (
    <Suspense fallback={<Loading />}>
      <Section cid={cid} tab={tab} shown={shown} />
    </Suspense>
  );
}
