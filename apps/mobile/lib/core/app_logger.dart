import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';

/// Development-only structured logs that are safe to display in `flutter run`.
/// Request bodies, credentials, cookies and payment details must never be logged.
abstract final class AppLogger {
  static const enabled = bool.fromEnvironment(
    'ALLSHOPS_DEV_LOGS',
    defaultValue: kDebugMode,
  );
  static int _sequence = 0;

  static void debug(
    String scope,
    String event, {
    Map<String, Object?>? fields,
  }) => _write('DEBUG', scope, event, fields: fields);

  static void info(
    String scope,
    String event, {
    Map<String, Object?>? fields,
  }) => _write('INFO', scope, event, fields: fields);

  static void warning(
    String scope,
    String event, {
    Map<String, Object?>? fields,
  }) => _write('WARN', scope, event, fields: fields);

  static void error(
    String scope,
    String event,
    Object error, {
    StackTrace? stackTrace,
    Map<String, Object?>? fields,
  }) => _write(
    'ERROR',
    scope,
    event,
    fields: fields,
    error: error,
    stackTrace: stackTrace,
  );

  static void _write(
    String level,
    String scope,
    String event, {
    Map<String, Object?>? fields,
    Object? error,
    StackTrace? stackTrace,
  }) {
    if (!enabled) return;
    final record = <String, Object?>{
      'seq': ++_sequence,
      'time': DateTime.now().toUtc().toIso8601String(),
      'level': level,
      'scope': scope,
      'event': event,
      if (fields != null && fields.isNotEmpty) 'fields': _redactMap(fields),
      if (error != null) 'errorType': error.runtimeType.toString(),
      if (error != null) 'error': _safeError(error),
    };
    debugPrint('ALLSHOPS ${jsonEncode(record)}');
    if (stackTrace != null) debugPrintStack(stackTrace: stackTrace);
  }

  static Map<String, Object?> _redactMap(Map<String, Object?> fields) =>
      fields.map((key, value) => MapEntry(key, _redact(key, value)));

  static Object? _redact(String key, Object? value) {
    final normalized = key.toLowerCase();
    const sensitive = <String>[
      'authorization',
      'cookie',
      'password',
      'secret',
      'token',
      'cvv',
      'pin',
      'cardnumber',
      'reference',
    ];
    if (sensitive.any(normalized.contains)) return '[REDACTED]';
    if (value is Map) {
      return value.map(
        (nestedKey, nestedValue) => MapEntry(
          nestedKey.toString(),
          _redact(nestedKey.toString(), nestedValue),
        ),
      );
    }
    if (value is Iterable) {
      return value.map((item) => _redact(key, item)).toList(growable: false);
    }
    return value;
  }

  static String _safeError(Object error) {
    final text = error.toString().replaceAll(RegExp(r'[\r\n]+'), ' ');
    return text.length <= 300 ? text : '${text.substring(0, 300)}…';
  }
}

class AppNavigationObserver extends NavigatorObserver {
  String _routeName(Route<dynamic>? route) =>
      route?.settings.name ?? route?.runtimeType.toString() ?? 'unknown';

  @override
  void didPush(Route<dynamic> route, Route<dynamic>? previousRoute) {
    AppLogger.info(
      'navigation',
      'push',
      fields: {'route': _routeName(route), 'from': _routeName(previousRoute)},
    );
  }

  @override
  void didPop(Route<dynamic> route, Route<dynamic>? previousRoute) {
    AppLogger.info(
      'navigation',
      'pop',
      fields: {'route': _routeName(route), 'to': _routeName(previousRoute)},
    );
  }

  @override
  void didReplace({Route<dynamic>? newRoute, Route<dynamic>? oldRoute}) {
    AppLogger.info(
      'navigation',
      'replace',
      fields: {'route': _routeName(newRoute), 'from': _routeName(oldRoute)},
    );
  }
}

class AppLifecycleLogger extends WidgetsBindingObserver {
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    AppLogger.info('app', 'lifecycle_changed', fields: {'state': state.name});
  }
}
