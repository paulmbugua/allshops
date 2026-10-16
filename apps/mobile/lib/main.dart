import 'dart:async';
import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'app.dart';
import 'core/app_logger.dart';

void main() {
  runZonedGuarded(
    () async {
      WidgetsFlutterBinding.ensureInitialized();
      // Android 15+ enforces edge-to-edge for apps targeting API 35+, while
      // older Android releases require an explicit opt-in. Enabling it here
      // gives every supported Android version the same window behavior; each
      // screen keeps interactive content clear through Flutter SafeArea and
      // Scaffold insets.
      await SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
      SystemChrome.setSystemUIOverlayStyle(
        const SystemUiOverlayStyle(
          statusBarColor: Colors.transparent,
          systemNavigationBarColor: Colors.transparent,
          systemNavigationBarContrastEnforced: false,
        ),
      );
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
      AppLogger.startup('flutter_initialized');
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
