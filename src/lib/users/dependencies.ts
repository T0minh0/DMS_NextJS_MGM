export type WorkerOperationalUsage = {
  salesUsage: number;
  measurementUsage: number;
  contributionsUsage: number;
};

export function hasWorkerOperationalDependencies(usage: WorkerOperationalUsage) {
  return usage.salesUsage > 0 || usage.measurementUsage > 0 || usage.contributionsUsage > 0;
}

export function shouldBlockWorkerCooperativeTransfer(
  currentCooperativeId: bigint,
  targetCooperativeId: bigint,
  usage: WorkerOperationalUsage,
) {
  return currentCooperativeId !== targetCooperativeId && hasWorkerOperationalDependencies(usage);
}
