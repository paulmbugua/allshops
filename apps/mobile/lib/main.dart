import 'dart:async';
import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'app.dart';
import 'core/app_logger.dart';

void main() {
  runZonedGuarded(
    () {
      WidgetsFlutterBinding.ensureInitialized();
      WidgetsBinding.instance.addObserver(AppLifecycleLogger());
      FlutterError.onError = (details) {
        AppLogger.error(
          'flutter',
          'framework_error',
          details.exception,
          stackTrace: details.stack,
          fields: {'library': details.library},
        );
        FlutterError.presentError(details);
      };
      PlatformDispatcher.instance.onError = (error, stackTrace) {
        AppLogger.error(
          'dart',
          'uncaught_platform_error',
          error,
          stackTrace: stackTrace,
        );
        return false;
      };
      AppLogger.info('app', 'starting', fields: {'mode': 'debug'});
      runApp(const ProviderScope(child: AllShopsApp()));
    },
    (error, stackTrace) => AppLogger.error(
      'dart',
      'uncaught_zone_error',
      error,
      stackTrace: stackTrace,
    ),
  );
}
