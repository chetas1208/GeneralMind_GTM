import type { RunDto } from "@/components/gtm/run-progress";
import type { RunRow } from "@/lib/db/queries/runs";

/** Serialise a DB run row into the plain shape the client progress component polls. */
export function toRunDto(run: RunRow): RunDto {
  return JSON.parse(JSON.stringify(run)) as RunDto;
}
