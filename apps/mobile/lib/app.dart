import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'core/api_client.dart';
import 'core/app_logger.dart';
import 'core/offline_store.dart';
import 'core/theme.dart';
import 'features/auth/welcome_screen.dart';
import 'features/home/home_screen.dart';
import 'core/models.dart';

final apiProvider = Provider<ApiClient>((ref) => ApiClient());
final offlineStoreProvider = Provider<OfflineStore>((ref) => OfflineStore());

class AppLanguageScope extends InheritedWidget {
  const AppLanguageScope({
    super.key,
    required this.language,
    required this.setLanguage,
    required super.child,
  });
  final String language;
  final ValueChanged<String> setLanguage;
  bool get isSwahili => language == 'sw';
  static AppLanguageScope of(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<AppLanguageScope>()!;
  @override
  bool updateShouldNotify(AppLanguageScope oldWidget) =>
      language != oldWidget.language;
}

String tr(BuildContext context, String english, String swahili) =>
    AppLanguageScope.of(context).isSwahili ? swahili : english;

const _swahiliLabels = <String, String>{
  'Products': 'Bidhaa',
  'Sales': 'Mauzo',
  'Customers': 'Wateja',
  'Purchases': 'Manunuzi',
  'Suppliers': 'Wasambazaji',
  'Expenses': 'Gharama',
  'Expense categories': 'Aina za gharama',
  'Appointments': 'Miadi',
  'Staff': 'Wafanyakazi',
  'Commissions': 'Kamisheni',
  'Commission rules': 'Kanuni za kamisheni',
  'Branches': 'Matawi',
  'Users': 'Watumiaji',
  'Devices': 'Vifaa',
  'Subscription': 'Usajili',
  'Billing': 'Malipo',
  'Sync conflicts': 'Migongano ya usawazishaji',
  'Readiness': 'Utayari',
  'Support diagnostics': 'Msaada na uchunguzi',
  'Current stock': 'Stoo ya sasa',
  'Transfers': 'Uhamisho',
  'Movements': 'Miamala ya stoo',
  'Categories': 'Aina',
  'Brands': 'Chapa',
  'Units': 'Vipimo',
  'End-of-day cash-up': 'Hesabu ya mwisho wa siku',
  'Reports': 'Ripoti',
  'Dashboard': 'Dashibodi',
  'Profit': 'Faida',
  'Payments': 'Malipo',
  'Inventory': 'Stoo',
  'New': 'Mpya',
  'Search': 'Tafuta',
  'Name': 'Jina',
  'Full name': 'Jina kamili',
  'Email': 'Barua pepe',
  'Phone': 'Simu',
  'Address': 'Anwani',
  'Role': 'Wajibu',
  'Branch': 'Tawi',
  'Status': 'Hali',
  'Notes': 'Maelezo',
  'Quantity': 'Idadi',
  'Price': 'Bei',
  'Cost': 'Gharama',
  'Product': 'Bidhaa',
  'Category': 'Aina',
  'Brand': 'Chapa',
  'Reference': 'Rejeleo',
  'Payment method': 'Njia ya malipo',
  'Date': 'Tarehe',
  'Description': 'Maelezo',
  'Business details': 'Maelezo ya biashara',
  'Open workspace': 'Fungua mfumo',
  'Display language': 'Lugha ya kuonyesha',
  'Save changes': 'Hifadhi mabadiliko',
  'Required': 'Inahitajika',
};

String translateLabel(BuildContext context, String english) =>
    AppLanguageScope.of(context).isSwahili
    ? _swahiliLabels[english] ?? english
    : english;

class AllShopsApp extends StatefulWidget {
  const AllShopsApp({super.key});
  @override
  State<AllShopsApp> createState() => _AllShopsAppState();
}

class _AllShopsAppState extends State<AllShopsApp> {
  static const storage = FlutterSecureStorage();
  String language = 'en';
  @override
  void initState() {
    super.initState();
    storage
        .read(key: 'allshops_display_language')
        .timeout(const Duration(seconds: 2))
        .then((value) {
          if (mounted && (value == 'en' || value == 'sw')) {
            setState(() => language = value!);
          }
        })
        .catchError((Object _) => null);
  }

  void setLanguage(String value) {
    if (value != 'en' && value != 'sw') return;
    setState(() => language = value);
    unawaited(
      storage
          .write(key: 'allshops_display_language', value: value)
          .timeout(const Duration(seconds: 2))
          .catchError((Object _) => null),
    );
  }

  @override
  Widget build(BuildContext context) => AppLanguageScope(
    language: language,
    setLanguage: setLanguage,
    child: MaterialApp(
      title: 'AllShops POS + ERP',
      debugShowCheckedModeBanner: false,
      theme: AllShopsTheme.light,
      locale: Locale(language),
      supportedLocales: const [Locale('en'), Locale('sw')],
      localizationsDelegates: GlobalMaterialLocalizations.delegates,
      navigatorObservers: [AppNavigationObserver()],
      home: const SessionGate(),
    ),
  );
}

class SessionGate extends ConsumerStatefulWidget {
  const SessionGate({
    super.key,
    this.restoreDeadline = const Duration(seconds: 15),
  });

  final Duration restoreDeadline;

  @override
  ConsumerState<SessionGate> createState() => _SessionGateState();
}

enum _SessionRestoreStatus { authenticated, anonymous, unavailable }

class _SessionRestoreResult {
  const _SessionRestoreResult(this.status, {this.user, this.timedOut = false});

  final _SessionRestoreStatus status;
  final CurrentUser? user;
  final bool timedOut;
}

class _SessionGateState extends ConsumerState<SessionGate> {
  late Future<_SessionRestoreResult> session;

  @override
  void initState() {
    super.initState();
    session = _restore();
  }

  Future<_SessionRestoreResult> _restore() async {
    AppLogger.startup('session_restore_started');
    AppLogger.info('session', 'restore_started');
    try {
      final user = CurrentUser.fromJson(
        await ref
            .read(apiProvider)
            .currentUser()
            .timeout(widget.restoreDeadline),
      );
      AppLogger.startup('session_restore_authenticated');
      AppLogger.info(
        'session',
        'restore_succeeded',
        fields: {'membershipCount': user.memberships.length},
      );
      return _SessionRestoreResult(
        _SessionRestoreStatus.authenticated,
        user: user,
      );
    } on TimeoutException catch (error, stackTrace) {
      AppLogger.startup('session_restore_deadline_exceeded');
      AppLogger.warning(
        'session',
        'restore_timed_out',
        fields: {'errorType': error.runtimeType.toString()},
      );
      AppLogger.debug(
        'session',
        'restore_timeout_detail',
        fields: {'hasStackTrace': stackTrace.toString().isNotEmpty},
      );
      return const _SessionRestoreResult(
        _SessionRestoreStatus.unavailable,
        timedOut: true,
      );
    } catch (error, stackTrace) {
      final status = apiStatusCode(error);
      final anonymous = status == 401 || status == 403;
      AppLogger.startup(
        anonymous ? 'session_restore_anonymous' : 'session_restore_unavailable',
        fields: {'classification': error.runtimeType.toString()},
      );
      AppLogger.warning(
        'session',
        'restore_failed',
        fields: {'errorType': error.runtimeType.toString()},
      );
      AppLogger.debug(
        'session',
        'restore_failure_detail',
        fields: {'hasStackTrace': stackTrace.toString().isNotEmpty},
      );
      return _SessionRestoreResult(
        anonymous
            ? _SessionRestoreStatus.anonymous
            : _SessionRestoreStatus.unavailable,
      );
    }
  }

  void _retry() {
    setState(() {
      session = _restore();
    });
  }

  @override
  Widget build(BuildContext context) => FutureBuilder<_SessionRestoreResult>(
    future: session,
    builder: (_, snapshot) {
      if (snapshot.connectionState != ConnectionState.done) {
        return const Scaffold(body: Center(child: CircularProgressIndicator()));
      }
      final result = snapshot.data;
      final user = result?.user;
      if (result?.status != _SessionRestoreStatus.authenticated ||
          user == null ||
          user.memberships.isEmpty) {
        return WelcomeScreen(
          startupUnavailable:
              result?.status == _SessionRestoreStatus.unavailable,
          startupTimedOut: result?.timedOut ?? false,
          onRetryStartup: result?.status == _SessionRestoreStatus.unavailable
              ? _retry
              : null,
        );
      }
      return HomeScreen(user: user, membership: user.memberships.first);
    },
  );
}
