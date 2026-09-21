export const routes = [
  {
    id: "market",
    name: "Market Road",
    detail: "Through the junction, toward the houses",
  },
  {
    id: "river",
    name: "River Path",
    detail: "The long way, along the water",
  },
  {
    id: "hill",
    name: "Hill Cut",
    detail: "Steep shortcut behind the mill",
  },
] as const;

export type RouteId = (typeof routes)[number]["id"];

export type ReportStatus = "confirmed" | "unverified" | "rumour" | "cleared";

export type Report = {
  id: string;
  time: string;
  minutes: number;
  route: RouteId | "town";
  status: ReportStatus;
  sources: number;
  source: string;
  summary: string;
};

export const clock = "6:40 PM";

export const board: Report[] = [
  {
    id: "fire-checked",
    time: "5:50 PM",
    minutes: 17 * 60 + 50,
    route: "town",
    status: "cleared",
    sources: 2,
    source: "Market chair, after walking over",
    summary:
      "A “the town is on fire” forward was a cooking fire in a compound. It is out.",
  },
  {
    id: "junction",
    time: "6:12 PM",
    minutes: 18 * 60 + 12,
    route: "market",
    status: "unverified",
    sources: 1,
    source: "A neighbour, from her doorway",
    summary:
      "Two people with long objects at the north junction, moving toward the market.",
  },
  {
    id: "already-here",
    time: "6:21 PM",
    minutes: 18 * 60 + 21,
    route: "market",
    status: "rumour",
    sources: 1,
    source: "WhatsApp forward",
    summary:
      "Says they are already inside the market and everyone should run. Shops on the street were still open.",
  },
  {
    id: "river-walk",
    time: "6:28 PM",
    minutes: 18 * 60 + 28,
    route: "river",
    status: "cleared",
    sources: 1,
    source: "Vigilante radio",
    summary: "A patrol walked River Path. No one was on it.",
  },
  {
    id: "hill-stop",
    time: "6:36 PM",
    minutes: 18 * 60 + 36,
    route: "hill",
    status: "confirmed",
    sources: 2,
    source: "Night chair — a radio call and a shopkeeper",
    summary: "Two men stopped a bike at the top of Hill Cut.",
  },
];

export const statusLabel: Record<ReportStatus, string> = {
  confirmed: "Confirmed",
  unverified: "Unchecked",
  rumour: "Rumour",
  cleared: "Cleared",
};

export const samples = [
  {
    id: "cousin",
    route: "market" as const,
    label: "Cousin on WhatsApp",
    message:
      "My cousin sent a voice note. He says armed men are at the Market Road junction and coming toward the shops. People in the group are saying lock up and run.",
  },
  {
    id: "fire",
    route: "river" as const,
    label: "The town is on fire",
    message:
      "The WhatsApp group says the whole town is on fire and the army is coming. People are screaming in the chat. I was going to take River Path.",
  },
  {
    id: "quiet",
    route: "hill" as const,
    label: "Hill looks quiet",
    message:
      "My neighbour says Hill Cut looks quiet from her window. No noise. Maybe I should take the shortcut home.",
  },
];

export function routeName(route: RouteId) {
  return routes.find((item) => item.id === route)?.name ?? route;
}

export function boardForPrompt() {
  return board
    .map(
      (report) =>
        `- ${report.time} | ${report.route} | ${report.status} | ${report.sources} source(s) | ${report.source}: ${report.summary}`,
    )
    .join("\n");
}
