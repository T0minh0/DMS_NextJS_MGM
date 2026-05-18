import { NextRequest } from 'next/server';
import { getCompletedWeeklyLeaderboardPeriod } from '@/lib/leaderboard';
import { runLeaderboardSnapshotJob } from '../leaderboard-snapshot/_shared';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  return runLeaderboardSnapshotJob({
    request,
    jobName: 'leaderboard-snapshot-weekly',
    getDefaultPeriod: getCompletedWeeklyLeaderboardPeriod,
  });
}
