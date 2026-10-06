// Public configuration only. Access tokens and webhook secrets stay on the server.
function browserTrackingConfig() {
  const pixelId = process.env.META_DATASET_ID || process.env.FB_PIXEL_ID || '';
  return {
    enabled: process.env.META_BROWSER_PIXEL_ENABLED !== 'false' && !!pixelId,
    pixel_id: pixelId,
    gtm_id: process.env.GOOGLE_TAG_ENABLED === 'false' ? '' : (process.env.GTM_CONTAINER_ID ?? 'GTM-KBK3JQ3'),
    ga_measurement_id: process.env.GOOGLE_TAG_ENABLED === 'false' ? '' : (process.env.GA_MEASUREMENT_ID || ''),
  };
}
module.exports = { browserTrackingConfig };
