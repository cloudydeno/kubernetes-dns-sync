import { Changes, Endpoint } from "../common/contract.ts";

export class Planner {
  PlanChanges(sourceRecords: Endpoint[], existingRecords: Endpoint[]): Changes {
    const changes = new Changes(sourceRecords, existingRecords);

    return changes;
  }
}
