import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'core/api_client.dart';
import 'core/app_logger.dart';
import 'core/offline_store.dart';
import 'core/theme.dart';
import 'features/auth/login_screen.dart';
import 'features/home/home_screen.dart';
import 'core/models.dart';

final apiProvider = Provider<ApiClient>((ref) => ApiClient());
final offlineStoreProvider = Provider<OfflineStore>((ref) => OfflineStore());

class AllShopsApp extends StatelessWidget {
  const AllShopsApp({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp(
    title: 'AllShops POS',
    debugShowCheckedModeBanner: false,
    theme: AllShopsTheme.light,
    navigatorObservers: [AppNavigationObserver()],
    home: const SessionGate(),
  );
}

class SessionGate extends ConsumerStatefulWidget {
  const SessionGate({super.key});
  @override
  ConsumerState<SessionGate> createState() => _SessionGateState();
}

class _SessionGateState extends ConsumerState<SessionGate> {
  late final Future<CurrentUser?> session;
  @override
  void initState() {
    super.initState();
    session = _restore();
  }

  Future<CurrentUser?> _restore() async {
    AppLogger.info('session', 'restore_started');
    try {
      final user = CurrentUser.fromJson(
        await ref.read(apiProvider).currentUser(),
      );
      AppLogger.info(
        'session',
        'restore_succeeded',
        fields: {'membershipCount': user.memberships.length},
      );
      return user;
    } catch (error, stackTrace) {
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
      return null;
    }
  }

  @override
  Widget build(BuildContext context) => FutureBuilder<CurrentUser?>(
    future: session,
    builder: (_, snapshot) {
      if (snapshot.connectionState != ConnectionState.done) {
        return const Scaffold(body: Center(child: CircularProgressIndicator()));
      }
      final user = snapshot.data;
      if (user == null || user.memberships.isEmpty) return const LoginScreen();
      return HomeScreen(user: user, membership: user.memberships.first);
    },
  );
}
