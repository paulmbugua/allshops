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
          defaultValue: 'http://10.0.2.2:4000/api/v1',
        ),
        connectTimeout: const Duration(seconds: 12),
        receiveTimeout: const Duration(seconds: 20),
        headers: {'Accept': 'application/json'},
      ),
    );
    _ready = _configureCookies();
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
          final token = await _storage.read(key: 'access_token');
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
                await _storage.write(key: 'access_token', value: token);
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
              await _storage.delete(key: 'access_token');
            }
          }
          final data = error.response?.data;
          final body = data is Map<String, dynamic>
              ? data
              : const <String, dynamic>{};
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
                body['message']?.toString() ?? 'Request failed.',
                code: body['code']?.toString() ?? 'ERROR',
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
  late final Future<void> _ready;
  final FlutterSecureStorage _storage;
  int _requestSequence = 0;

  static int? _elapsedMs(RequestOptions options) {
    final startedAt = options.extra['_logStartedAt'];
    if (startedAt is! int) return null;
    return (DateTime.now().microsecondsSinceEpoch - startedAt) ~/ 1000;
  }

  Future<void> _configureCookies() async {
    final directory = await getApplicationSupportDirectory();
    _dio.interceptors.insert(
      0,
      CookieManager(
        PersistCookieJar(storage: FileStorage('${directory.path}/cookies')),
      ),
    );
  }

  Future<Map<String, dynamic>> login(String email, String password) async {
    await _ready;
    AppLogger.info('auth', 'login_started');
    final response = await _dio.post<Map<String, dynamic>>(
      '/auth/login',
      data: {'email': email.trim(), 'password': password},
    );
    final body = response.data!;
    await _storage.write(
      key: 'access_token',
      value: body['accessToken'] as String,
    );
    AppLogger.info('auth', 'login_succeeded');
    return body;
  }

  Future<Map<String, dynamic>> currentUser() =>
      get<Map<String, dynamic>>('/auth/me');
  Future<void> logout() async {
    AppLogger.info('auth', 'logout_started');
    await _ready;
    try {
      await _dio.post<void>('/auth/logout');
    } catch (_) {
      /* Local logout must still clear the session. */
    }
    final displayLanguage = await _storage.read(
      key: 'allshops_display_language',
    );
    await _storage.deleteAll();
    if (displayLanguage != null) {
      await _storage.write(
        key: 'allshops_display_language',
        value: displayLanguage,
      );
    }
    AppLogger.info('auth', 'logout_completed');
  }

  Future<T> get<T>(String path, {Map<String, dynamic>? query}) async {
    await _ready;
    return (await _dio.get<T>(path, queryParameters: query)).data as T;
  }

  Future<T> post<T>(
    String path, {
    Object? data,
    Map<String, dynamic>? headers,
  }) async {
    await _ready;
    return (await _dio.post<T>(
          path,
          data: data,
          options: Options(headers: headers),
        )).data
        as T;
  }

  Future<T> patch<T>(String path, {Object? data}) async {
    await _ready;
    return (await _dio.patch<T>(path, data: data)).data as T;
  }
}

String apiErrorMessage(Object error) {
  if (error is ApiFailure) return error.message;
  if (error is DioException && error.error is ApiFailure) {
    return (error.error! as ApiFailure).message;
  }
  return error.toString().replaceFirst('Exception: ', '');
}
