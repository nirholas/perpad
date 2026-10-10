import { readFileSync } from "node:fs";
import { z } from "zod";
import { RiskLimitsSchema } from "./risk.js";

export const ConfigSchema = z.object({
  name: z.string().min(1),
  strategy: z.string().min(10),
  limits: RiskLimitsSchema,
  model: z.string().optional(),
  intervalSec: z.number().int().min(30).default(300),
  journalPath: z.string().default("journal/agent.jsonl"),
  paper: z.object({ startingUsd: z.number().positive() }).default({ startingUsd: 1000 }),
  testnet: z.boolean().default(false),
});
export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(path: string): Config {
  return ConfigSchema.parse(JSON.parse(readFileSync(path, "utf8")));
}
