import { z } from "zod";
import { Id, Percent } from "./common";
import { AcademicYear } from "./profile";
import { Skill } from "./skill";

export const ConnectionStatus = z.enum([
  "none",
  "outgoing",
  "incoming",
  "connected",
]);
export type ConnectionStatus = z.infer<typeof ConnectionStatus>;

/**
 * The point of the matchmaker is complementary skills, not identical ones —
 * two people who both know PyTorch are a worse team than one who knows PyTorch
 * and one who knows embedded systems.
 */
export const PeerMatch = z.object({
  id: Id,
  name: z.string(),
  initials: z.string().length(2),
  branch: z.string(),
  year: AcademicYear,
  goalRole: z.string(),
  matchPct: Percent,
  /** Interests you already have in common. */
  sharedInterests: z.array(z.string()),
  /** Skills they hold that you do not — the reason to team up. */
  complementarySkills: z.array(Skill),
  /** Skills you hold that they lack, i.e. what you bring. */
  youBring: z.array(Skill),
  lookingFor: z.string(),
  why: z.string(),
  connection: ConnectionStatus.default("none"),
});
export type PeerMatch = z.infer<typeof PeerMatch>;

export const PeopleQuery = z.object({
  interest: z.string().optional(),
  skillId: Id.optional(),
  lookingForTeam: z.boolean().optional(),
  search: z.string().optional(),
});
export type PeopleQuery = z.infer<typeof PeopleQuery>;

export const ConnectionRequestInput = z.object({
  peerId: Id,
  message: z.string().max(400).optional(),
});
export type ConnectionRequestInput = z.infer<typeof ConnectionRequestInput>;

export const ConnectionRequest = z.object({
  id: Id,
  requesterId: Id,
  recipientId: Id,
  message: z.string().nullable().default(null),
  status: z.enum(["pending", "accepted", "rejected", "cancelled"]),
  createdAt: z.string().min(1),
  respondedAt: z.string().nullable().default(null),
});
export type ConnectionRequest = z.infer<typeof ConnectionRequest>;
