import 'dart:async';

import 'package:cookie_jar/cookie_jar.dart';
import 'package:dio/dio.dart';
import 'package:dio_cookie_manager/dio_cookie_manager.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:path_provider/path_provider.dart';
import 'app_logger.dart';

class ApiFailure implements Exception {
  ApiFailure(this.message, {this.code = 'ERROR', this.status});
  final String message;
  final String code;
  final int? status;
  @override
  String toString() => message;
}

class ApiClient {
  ApiClient({FlutterSecureStorage? storage})
    : _storage = storage ?? const FlutterSecureStorage() {
    _dio = Dio(
      BaseOptions(
        baseUrl: const String.fromEnvironment(
          'ALLSHOPS_API_URL',
          // A build without an explicit environment override must remain
          // usable on real devices. The local development script supplies
          // 127.0.0.1 over adb reverse when a developer needs the local API.
          defaultValue: 'https://api.allshopspos.com/api/v1',
        ),
        connectTimeout: const Duration(seconds: 12),
        receiveTimeout: const Duration(seconds: 20),
        headers: {'Accept': 'application/json'},
      ),
    );
    _cookieManager = CookieManager(CookieJar());
    _dio.interceptors.add(_cookieManager);
    unawaited(_enablePersistentCookies());
    AppLogger.startup('api_client_ready');
    AppLogger.info(
      'api',
      'configured',
      fields: {'baseUrl': _dio.options.baseUrl},
    );
    _dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          final requestId = ++_requestSequence;
          options.extra['_logRequestId'] = requestId;
          options.extra['_logStartedAt'] =
              DateTime.now().microsecondsSinceEpoch;
          final token = await _readSecure('access_token');
          if (token != null) options.headers['Authorization'] = 'Bearer $token';
          AppLogger.info(
            'api',
            'request',
            fields: {
              'id': requestId,
              'method': options.method,
              'path': options.path,
              'queryKeys': options.queryParameters.keys.toList(),
              'authenticated': token != null,
            },
          );
          handler.next(options);
        },
        onResponse: (response, handler) {
          AppLogger.info(
            'api',
            'response',
            fields: {
              'id': response.requestOptions.extra['_logRequestId'],
              'method': response.requestOptions.method,
              'path': response.requestOptions.path,
              'status': response.statusCode,
              'elapsedMs': _elapsedMs(response.requestOptions),
            },
          );
          handler.next(response);
        },
        onError: (error, handler) async {
          if (error.response?.statusCode == 401 &&
              error.requestOptions.path != '/auth/refresh' &&
              error.requestOptions.extra['retried'] != true) {
            AppLogger.warning(
              'auth',
              'access_token_expired',
              fields: {'path': error.requestOptions.path},
            );
            try {
              final refreshed = await _dio.post<Map<String, dynamic>>(
                '/auth/refresh',
              );
              final token = refreshed.data?['accessToken'] as String?;
              if (token != null) {
                await _writeSecure('access_token', token);
                AppLogger.info('auth', 'token_refresh_succeeded');
                final request = error.requestOptions;
                request.extra['retried'] = true;
                request.headers['Authorization'] = 'Bearer $token';
                return handler.resolve(await _dio.fetch<dynamic>(request));
              }
            } catch (refreshError) {
              AppLogger.warning(
                'auth',
                'token_refresh_failed',
                fields: {'errorType': refreshError.runtimeType.toString()},
              );
              await _deleteSecure('access_token');
            }
          }
          final data = error.response?.data;
          final body = data is Map<String, dynamic>
              ? data
              : const <String, dynamic>{};
          final transportMessage = switch (error.type) {
            DioExceptionType.connectionTimeout ||
            DioExceptionType.sendTimeout ||
            DioExceptionType.receiveTimeout =>
              'The service took too long to respond. Check your connection and try again.',
            DioExceptionType.connectionError =>
              'Unable to reach AllShops. Check your internet connection and try again.',
            DioExceptionType.badCertificate =>
              'The secure connection to AllShops could not be verified.',
            _ => null,
          };
          AppLogger.error(
            'api',
            'request_failed',
            error,
            stackTrace: error.stackTrace,
            fields: {
              'id': error.requestOptions.extra['_logRequestId'],
              'method': error.requestOptions.method,
              'path': error.requestOptions.path,
              'status': error.response?.statusCode,
              'type': error.type.name,
              'code': body['code']?.toString() ?? 'ERROR',
              'elapsedMs': _elapsedMs(error.requestOptions),
            },
          );
          handler.reject(
            DioException(
              requestOptions: error.requestOptions,
              response: error.response,
              error: ApiFailure(
                body['message']?.toString() ??
                    transportMessage ??
                    'The request could not be completed. Please try again.',
                code:
                    body['code']?.toString() ??
                    (transportMessage == null ? 'ERROR' : 'NETWORK_ERROR'),
                status: error.response?.statusCode,
              ),
              type: error.type,
            ),
          );
        },
      ),
    );
  }
  late final Dio _dio;
  late CookieManager _cookieManager;
  final FlutterSecureStorage _storage;
  final Map<String, String> _volatileStorage = <String, String>{};
  int _requestSequence = 0;

  static const _cookieSetupDeadline = Duration(seconds: 2);
  static const _secureStorageDeadline = Duration(seconds: 2);

  static int? _elapsedMs(RequestOptions options) {
    final startedAt = options.extra['_logStartedAt'];
    if (startedAt is! int) return null;
    return (DateTime.now().microsecondsSinceEpoch - startedAt) ~/ 1000;
  }

  Future<void> _enablePersistentCookies() async {
    AppLogger.startup('cookie_storage_initializing');
    try {
      final directory = await getApplicationSupportDirectory().timeout(
        _cookieSetupDeadline,
      );
      final persistentManager = CookieManager(
        PersistCookieJar(storage: FileStorage('${directory.path}/cookies')),
      );
      final currentIndex = _dio.interceptors.indexOf(_cookieManager);
      if (currentIndex >= 0) {
        _dio.interceptors[currentIndex] = persistentManager;
        _cookieManager = persistentManager;
      }
      AppLogger.startup('cookie_storage_persistent');
    } on Object catch (error) {
      // The in-memory jar installed in the constructor remains active. Cookie
      // persistence must never prevent the register from opening.
      AppLogger.startup(
        'cookie_storage_memory_fallback',
        fields: {'reason': error.runtimeType.toString()},
      );
    }
  }

  Future<String?> _readSecure(String key) async {
    try {
      final value = await _storage
          .read(key: key)
          .timeout(_secureStorageDeadline);
      if (value != null) _volatileStorage[key] = value;
      return value ?? _volatileStorage[key];
    } on Object catch (error) {
      AppLogger.startup(
        'secure_storage_read_fallback',
        fields: {'reason': error.runtimeType.toString()},
      );
      return _volatileStorage[key];
    }
  }

  Future<void> _writeSecure(String key, String value) async {
    _volatileStorage[key] = value;
    try {
      await _storage
          .write(key: key, value: value)
          .timeout(_secureStorageDeadline);
    } on Object catch (error) {
      AppLogger.startup(
        'secure_storage_write_deferred',
        fields: {'reason': error.runtimeType.toString()},
      );
    }
  }

  Future<void> _deleteSecure(String key) async {
    _volatileStorage.remove(key);
    try {
      await _storage.delete(key: key).timeout(_secureStorageDeadline);
    } on Object catch (error) {
      AppLogger.startup(
        'secure_storage_delete_deferred',
        fields: {'reason': error.runtimeType.toString()},
      );
    }
  }

  Future<Map<String, dynamic>> login(String email, String password) async {
    AppLogger.info('auth', 'login_started');
    final response = await _dio.post<Map<String, dynamic>>(
      '/auth/login',
      data: {'email': email.trim(), 'password': password},
    );
    final body = response.data!;
    await _writeSecure('access_token', body['accessToken'] as String);
    AppLogger.info('auth', 'login_succeeded');
    return body;
  }

  Future<Map<String, dynamic>> register({
    required String name,
    required String email,
    required String password,
  }) async {
    AppLogger.info('auth', 'registration_started');
    final response = await _dio.post<Map<String, dynamic>>(
      '/auth/register',
      data: {
        'name': name.trim(),
        'email': email.trim().toLowerCase(),
        'password': password,
      },
    );
    AppLogger.info('auth', 'registration_succeeded');
    return response.data!;
  }

  Future<void> resendActivation(String email) async {
    AppLogger.info('auth', 'activation_resend_started');
    await _dio.post<Map<String, dynamic>>(
      '/auth/resend-activation',
      data: {'email': email.trim().toLowerCase()},
    );
    AppLogger.info('auth', 'activation_resend_accepted');
  }

  Future<Map<String, dynamic>> currentUser() =>
      get<Map<String, dynamic>>('/auth/me');
  Future<void> logout() async {
    AppLogger.info('auth', 'logout_started');
    try {
      await _dio.post<void>('/auth/logout');
    } catch (_) {
      /* Local logout must still clear the session. */
    }
    final displayLanguage = await _readSecure('allshops_display_language');
    _volatileStorage.clear();
    try {
      await _storage.deleteAll().timeout(_secureStorageDeadline);
    } on Object catch (error) {
      AppLogger.startup(
        'secure_storage_clear_deferred',
        fields: {'reason': error.runtimeType.toString()},
      );
    }
    if (displayLanguage != null) {
      await _writeSecure('allshops_display_language', displayLanguage);
    }
    AppLogger.info('auth', 'logout_completed');
  }

  Future<T> get<T>(String path, {Map<String, dynamic>? query}) async {
    return (await _dio.get<T>(path, queryParameters: query)).data as T;
  }

  Future<T> post<T>(
    String path, {
    Object? data,
    Map<String, dynamic>? headers,
  }) async {
    return (await _dio.post<T>(
          path,
          data: data,
          options: Options(headers: headers),
        )).data
        as T;
  }

  Future<T> patch<T>(String path, {Object? data}) async {
    return (await _dio.patch<T>(path, data: data)).data as T;
  }

  Future<Map<String, dynamic>> uploadImage(
    String path, {
    required String filePath,
    required String filename,
  }) async {
    final extension = filename.split('.').last.toLowerCase();
    final contentType = switch (extension) {
      'png' => 'image/png',
      'webp' => 'image/webp',
      _ => 'image/jpeg',
    };
    final form = FormData.fromMap({
      'image': await MultipartFile.fromFile(
        filePath,
        filename: filename,
        contentType: DioMediaType.parse(contentType),
      ),
    });
    return (await _dio.post<Map<String, dynamic>>(path, data: form)).data!;
  }
}

String apiErrorMessage(Object error) {
  final failure = _apiFailure(error);
  if (failure != null) return failure.message;
  if (error is DioException) {
    return switch (error.type) {
      DioExceptionType.connectionTimeout ||
      DioExceptionType.sendTimeout ||
      DioExceptionType.receiveTimeout =>
        'The service took too long to respond. Please try again.',
      DioExceptionType.connectionError =>
        'Unable to connect to AllShops. Check your internet and try again.',
      _ => 'We could not complete that request. Please try again.',
    };
  }
  if (error is TimeoutException) {
    return 'The service took too long to respond. Please try again.';
  }
  return 'Something went wrong. Please try again.';
}

String? apiErrorCode(Object error) => _apiFailure(error)?.code;

ApiFailure? _apiFailure(Object? error, [int depth = 0]) {
  if (depth > 4 || error == null) return null;
  if (error is ApiFailure) return error;
  if (error is DioException) {
    final nested = _apiFailure(error.error, depth + 1);
    if (nested != null) return nested;
    final data = error.response?.data;
    if (data is Map) {
      final message = data['message'];
      if (message != null) {
        return ApiFailure(
          message.toString(),
          code: data['code']?.toString() ?? 'ERROR',
          status: error.response?.statusCode,
        );
      }
    }
  }
  return null;
}

int? apiStatusCode(Object error) {
  final failure = _apiFailure(error);
  if (failure != null) return failure.status;
  if (error is DioException) {
    final nested = error.error;
    if (nested is ApiFailure) return nested.status;
    return error.response?.statusCode;
  }
  return null;
}
