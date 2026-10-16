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
  bool get isArabic => language == 'ar';
  static AppLanguageScope of(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<AppLanguageScope>()!;
  @override
  bool updateShouldNotify(AppLanguageScope oldWidget) =>
      language != oldWidget.language;
}

String tr(BuildContext context, String english, String arabic) =>
    AppLanguageScope.of(context).isArabic ? arabic : english;

const _arabicLabels = <String, String>{
  'Products': 'المنتجات',
  'Sales': 'المبيعات',
  'Customers': 'العملاء',
  'Purchases': 'أوامر الشراء',
  'Suppliers': 'الموردون',
  'Expenses': 'المصروفات',
  'Expense categories': 'فئات المصروفات',
  'Appointments': 'المواعيد',
  'Staff': 'الموظفون',
  'Commissions': 'العمولات',
  'Commission rules': 'قواعد العمولة',
  'Branches': 'الفروع',
  'Users': 'المستخدمون',
  'Devices': 'الأجهزة',
  'Subscription': 'الاشتراك',
  'Billing': 'الفوترة',
  'Sync conflicts': 'تعارضات المزامنة',
  'Readiness': 'الجاهزية',
  'Support diagnostics': 'الدعم والتشخيص',
  'Current stock': 'المخزون الحالي',
  'Transfers': 'التحويلات',
  'Movements': 'الحركات',
  'Categories': 'الفئات',
  'Brands': 'العلامات التجارية',
  'Units': 'الوحدات',
  'End-of-day cash-up': 'تسوية نهاية اليوم',
  'Reports': 'التقارير',
  'Dashboard': 'لوحة المعلومات',
  'Profit': 'الأرباح',
  'Payments': 'المدفوعات',
  'Inventory': 'المخزون',
  'New': 'جديد',
  'Search': 'بحث',
  'Name': 'الاسم',
  'Full name': 'الاسم الكامل',
  'Email': 'البريد الإلكتروني',
  'Phone': 'الهاتف',
  'Address': 'العنوان',
  'Role': 'الدور',
  'Branch': 'الفرع',
  'Status': 'الحالة',
  'Notes': 'ملاحظات',
  'Quantity': 'الكمية',
  'Price': 'السعر',
  'Cost': 'التكلفة',
  'Product': 'المنتج',
  'Category': 'الفئة',
  'Brand': 'العلامة التجارية',
  'Reference': 'المرجع',
  'Payment method': 'طريقة الدفع',
  'Date': 'التاريخ',
  'Description': 'الوصف',
  'Business details': 'بيانات المنشأة',
  'Open workspace': 'فتح مساحة العمل',
  'Display language': 'لغة العرض',
  'Save changes': 'حفظ التغييرات',
  'Required': 'مطلوب',
};

String translateLabel(BuildContext context, String english) =>
    AppLanguageScope.of(context).isArabic
    ? _arabicLabels[english] ?? english
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
          if (mounted && (value == 'en' || value == 'ar')) {
            setState(() => language = value!);
          }
        })
        .catchError((Object _) => null);
  }

  void setLanguage(String value) {
    if (value != 'en' && value != 'ar') return;
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
      title: 'AllShops POS',
      debugShowCheckedModeBanner: false,
      theme: AllShopsTheme.light,
      locale: Locale(language),
      supportedLocales: const [Locale('en'), Locale('ar')],
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
