import { NextResponse } from 'next/server';

export function getDebugRouteDisabledResponse(options: { allowProductionOverride?: boolean } = {}) {
  const allowProductionOverride = options.allowProductionOverride ?? true;
  const enabledInProduction =
    allowProductionOverride && process.env.DMS_DEBUG_ENDPOINTS_ENABLED === 'true';

  if (process.env.NODE_ENV === 'production' && !enabledInProduction) {
    return NextResponse.json(
      { message: 'Debug endpoint disabled' },
      { status: 404 },
    );
  }

  return null;
}
