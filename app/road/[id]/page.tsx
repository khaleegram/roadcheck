import type { Metadata } from "next";
import { RoadCheckApp } from "@/components/roadcheck-app";

function nameFrom(id: string, name?: string | string[]) {
  const given = Array.isArray(name) ? name[0] : name;
  if (given?.trim()) return given.trim();
  return id
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export async function generateMetadata(
  props: PageProps<"/road/[id]">,
): Promise<Metadata> {
  const { id } = await props.params;
  const { name } = await props.searchParams;
  const place = nameFrom(id, name);
  return {
    title: `${place} — RoadCheck`,
    description: `What people are reporting about ${place} right now.`,
  };
}

export default async function RoadPage(props: PageProps<"/road/[id]">) {
  const { id } = await props.params;
  const { name } = await props.searchParams;
  return <RoadCheckApp initialRoadId={id} initialRoadName={nameFrom(id, name)} />;
}
