import 'dart:async';

import 'package:allshops_mobile/app.dart';
import 'package:allshops_mobile/core/api_client.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

class _NeverCompletingApiClient extends ApiClient {
  int calls = 0;

  @override
  Future<Map<String, dynamic>> currentUser() {
    calls++;
    return Completer<Map<String, dynamic>>().future;
  }
}

void main() {
  testWidgets('session deadline opens recoverable welcome screen', (
    tester,
  ) async {
    final api = _NeverCompletingApiClient();

    await tester.pumpWidget(
      ProviderScope(
        overrides: [apiProvider.overrideWithValue(api)],
        child: AppLanguageScope(
          language: 'en',
          setLanguage: (_) {},
          child: const MaterialApp(
            home: SessionGate(restoreDeadline: Duration(milliseconds: 20)),
          ),
        ),
      ),
    );

    expect(find.byType(CircularProgressIndicator), findsOneWidget);
    await tester.pump(const Duration(milliseconds: 25));
    await tester.pump();

    expect(find.text('Retry'), findsOneWidget);
    expect(find.text('Staff sign in'), findsOneWidget);
    expect(api.calls, 1);

    await tester.tap(find.text('Retry'));
    await tester.pump();
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
    expect(api.calls, 2);

    await tester.pump(const Duration(milliseconds: 25));
    await tester.pump(const Duration(seconds: 2));
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump();
  });
}
