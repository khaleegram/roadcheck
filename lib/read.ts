import { generateText, Output } from "ai";
import { z } from "zod";
import { rehearse, type Claim, type Read } from "./graph";

const schema = z.object({
  claims: z.array(
    z.object({
      speaker: z.string(),
      road: z.string(),
      role: z.enum(["saw", "heard", "passed"]),
      story: z.string(),
      minutesAgo: z.number().nullable(),
      radio: z.boolean(),
    }),
  ),
});

const modelId = process.env.CLEARPATH_MODEL ?? "openai/gpt-5.4-mini";

export async function readMessages(messages: string[]): Promise<Read> {
  if (process.env.CLEARPATH_REHEARSAL === "1") {
    return rehearse(messages);
  }

  try {
    const { output } = await generateText({
      model: modelId,
      output: Output.object({ schema, name: "MessageChains" }),
      abortSignal: AbortSignal.timeout(20_000),
      system: `Split what reached a shopkeeper into separate claims. You do not decide if the road is safe.

Each block is one message she already has. The vigilante radio has not reached her. Talk about the radio is not a person on the road.

role:
- saw: this person was there and saw something on the road
- heard: they are passing on what someone else said, including a forward or a voice note
- passed: this person was physically on the road themselves and is reporting what they found

story: a short id. Forwards of the same voice note share one id. A neighbour who saw it gets a different id. A person who walked the road themselves gets their own id.
minutesAgo: number of minutes before now, or null if the message has no time.
radio: true only when the message is about the vigilante radio.
Do not invent a radio pass, a time, or a witness.`,
      prompt: messages.map((message, index) => `Message ${index + 1}:\n${message}`).join("\n\n"),
    });

    if (!output?.claims.length) return rehearse(messages);

    const claims: Claim[] = output.claims.map((claim, index) => ({
      speaker: claim.speaker,
      road: claim.road || "the road home",
      role: claim.role,
      story: claim.story,
      minutesAgo: claim.minutesAgo,
      radio: claim.radio,
      text: messages[index] ?? messages[0] ?? "",
    }));

    return { claims, source: "model" };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown error";
    console.error(`Model read failed, using rehearsal: ${detail}`);
    return rehearse(messages);
  }
}
