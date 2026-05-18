import { apiErrorResponse } from '@/lib/api/errors';

export function getDebugRouteDisabledResponse(options: { allowProductionOverride?: boolean } = {}) {
  const allowProductionOverride = options.allowProductionOverride ?? true;
  const enabledInProduction =
    allowProductionOverride && process.env.DMS_DEBUG_ENDPOINTS_ENABLED === 'true';

  if (process.env.NODE_ENV === 'production' && !enabledInProduction) {
    return apiErrorResponse({
      message: 'Debug endpoint disabled',
      code: 'DEBUG_ENDPOINT_DISABLED',
      status: 404,
    });
  }

  return null;
}
