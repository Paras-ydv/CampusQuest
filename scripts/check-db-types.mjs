import { readFileSync } from "node:fs";

let generated = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { generated += chunk; });
process.stdin.on("end", () => {
  const current = readFileSync("packages/db-types/src/database.types.ts", "utf8");
  const normalize = (value) => value.replace(/\r\n/g, "\n").trimEnd();
  if (normalize(current) !== normalize(generated)) {
    console.error("Supabase database types are stale. Run `npm run db:types` and commit the result.");
    process.exit(1);
  }
  console.log("Supabase database types are current.");
});
