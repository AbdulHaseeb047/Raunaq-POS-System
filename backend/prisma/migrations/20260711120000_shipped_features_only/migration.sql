-- Deactivate unimplemented / placeholder features and remove assignments
UPDATE feature_registry SET is_active = false WHERE key IN (
  'delivery.basic',
  'delivery.rider_app',
  'delivery.gps_tracking',
  'delivery.aggregator_sync',
  'fbr.integration',
  'reports.analytics_dashboard'
);

DELETE FROM tenant_features WHERE feature_key IN (
  'delivery.basic',
  'delivery.rider_app',
  'delivery.gps_tracking',
  'delivery.aggregator_sync',
  'fbr.integration',
  'reports.analytics_dashboard'
);

DELETE FROM staff_features WHERE feature_key IN (
  'delivery.basic',
  'delivery.rider_app',
  'delivery.gps_tracking',
  'delivery.aggregator_sync',
  'fbr.integration',
  'reports.analytics_dashboard'
);

DELETE FROM tier_presets WHERE feature_key IN (
  'delivery.basic',
  'delivery.rider_app',
  'delivery.gps_tracking',
  'delivery.aggregator_sync',
  'fbr.integration',
  'reports.analytics_dashboard'
);
