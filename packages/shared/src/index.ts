/**
 * @campusquest/shared — the API contract every part of CampusQuest agrees on.
 *
 * Ownership: P1 maintains this package; changes go through a PR all four
 * review. No endpoint ships without its schema landing here first, so the
 * frontend can build against fixtures while the backend is still being
 * written.
 */
export * from "./schemas/common";
export * from "./schemas/skill";
export * from "./schemas/profile";
export * from "./schemas/quest";
export * from "./schemas/timemachine";
export * from "./schemas/opportunity";
export * from "./schemas/people";
export * from "./schemas/research";
export * from "./schemas/genie";
export * from "./schemas/chat";
