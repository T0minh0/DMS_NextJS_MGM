export function canReadFullCollectiveSaleReport(input: {
  isAdmin: boolean;
  viewerCooperativeId: bigint;
  creatorCooperativeId: bigint;
  contributions: { cooperativeId: bigint; status: string }[];
}) {
  if (input.isAdmin) return true;
  if (input.creatorCooperativeId === input.viewerCooperativeId) return true;

  return input.contributions.some(
    (c) => c.cooperativeId === input.viewerCooperativeId && c.status === 'ACCEPTED',
  );
}
