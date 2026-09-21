import { generateText, Output } from "ai";
import { z } from "zod";
import { boardForPrompt } from "./board";
import { rehearse, type Extraction, type Kind } from "./decide";

const schema = z.object({
  claim: z
    .string()
    .describe(
      "One plain sentence saying what the message claims. Do not add places, people, or events that are not in the text.",
    ),
  kind: z.enum(["sighting", "all_clear", "panic", "hearsay", "unclear"]),
  routes: z
    .array(z.enum(["market", "river", "hill", "town"]))
    .describe(
      "Roads the event is about. market = Market Road or the junction. river = River Path. hill = Hill Cut. town = the whole town. Leave out a road the speaker only hopes to travel.",
    ),
  specific: z
    .boolean()
    .describe(
      "True only when the message names a place and something seen or checked there.",
    ),
});

const modelId = process.env.CLEARPATH_MODEL ?? "openai/gpt-5.4-mini";

export async function readMessage(message: string): Promise<Extraction> {
  if (process.env.CLEARPATH_REHEARSAL === "1") {
    return rehearse(message);
  }

  try {
    const { output } = await generateText({
      model: modelId,
      output: Output.object({ schema, name: "RoadClaim" }),
      abortSignal: AbortSignal.timeout(20_000),
      system: `You extract a claim from a short message for a shopkeeper deciding whether to walk home.
You do not give advice. You do not invent sightings.
The signal board is context so you can see place names. Do not copy a board report into the claim unless the message itself says it.

Board:
${boardForPrompt()}

kind:
- sighting: the speaker, or someone named, saw or heard a specific thing at a place
- hearsay: a forward, cousin, voice note, or "I heard" about a place the speaker did not see
- all_clear: a road was walked, found empty, or described as quiet
- panic: a broad alarm (whole town, fire everywhere, army coming, everyone run) with no specific sighting on one road
- unclear: you cannot tell

If panic words and a specific sighting are both present, use sighting or hearsay, not panic.
Only list a road if the message claims something happened there or that it was checked.`,
      prompt: message,
    });

    if (!output) return rehearse(message);

    return {
      claim: output.claim,
      kind: output.kind as Kind,
      routes: output.routes,
      specific: output.specific,
      source: "model",
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown error";
    console.error(`Clearpath model read failed, using rehearsal: ${detail}`);
    return {
      ...rehearse(message),
      modelNote: detail.replace(/\s+/g, " ").slice(0, 240),
    };
  }
}
