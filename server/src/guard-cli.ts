// Message-guard operations (strikes.ts), run inside the container:
//   docker exec aineko node dist/guard-cli.js events      recent lockouts and self-harm alerts
//   docker exec aineko node dist/guard-cli.js lift <tag>  lift a lockout called a false positive
// The tag is the 8-character label alerts show. The running server rereads the file, so a lift
// takes effect on the next message.
import { GUARD_STATE_FILE, liftByTag } from "./strikes.js";
import { readFileSync } from "node:fs";

const [command, arg] = process.argv.slice(2);

if (command === "lift" && arg && /^[0-9a-f]{8}$/.test(arg)) {
  const lifted = liftByTag(arg);
  console.log(lifted > 0 ? `lifted ${arg}` : `no key with tag ${arg}`);
  process.exit(lifted > 0 ? 0 : 1);
} else if (command === "events") {
  let events: unknown[] = [];
  try {
    events = (JSON.parse(readFileSync(GUARD_STATE_FILE, "utf8")) as { events?: unknown[] }).events ?? [];
  } catch {
    // No file yet: nothing has been flagged.
  }
  for (const event of events) console.log(JSON.stringify(event));
} else {
  console.error("usage: guard-cli.js events | lift <tag>");
  process.exit(2);
}
