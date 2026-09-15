import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:uuid/uuid.dart';

import '../../app.dart';
import '../../core/api_client.dart';
import '../../core/models.dart';

class SubscriptionScreen extends ConsumerStatefulWidget {
  const SubscriptionScreen({super.key, required this.membership});

  final Membership membership;

  @override
  ConsumerState<SubscriptionScreen> createState() => _SubscriptionScreenState();
}

class _SubscriptionScreenState extends ConsumerState<SubscriptionScreen>
    with WidgetsBindingObserver {
  static const _storage = FlutterSecureStorage();
  static const _referenceKey = 'subscription_paystack_reference';

  Map<String, dynamic>? _subscription;
  Map<String, dynamic> _usage = const {};
  List<Map<String, dynamic>> _plans = const [];
  List<Map<String, dynamic>> _bills = const [];
  String _interval = 'MONTHLY';
  String? _message;
  bool _loading = true;
  bool _busy = false;
  bool _paymentPending = false;

  String get _organizationId => widget.membership.organizationId;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _load();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && _paymentPending) {
      _verifyPendingPayment();
    }
  }

  Future<void> _load() async {
    if (mounted) setState(() => _loading = true);
    try {
      final api = ref.read(apiProvider);
      final values = await Future.wait<Object>([
        api.get<Map<String, dynamic>>(
          '/organizations/$_organizationId/subscription',
        ),
        api.get<Map<String, dynamic>>(
          '/organizations/$_organizationId/subscription/usage',
        ),
        api.get<List<dynamic>>('/plans'),
        api.get<List<dynamic>>('/organizations/$_organizationId/billing'),
      ]);
      final pendingReference = await _storage.read(key: _referenceKey);
      if (!mounted) return;
      setState(() {
        _subscription = values[0] as Map<String, dynamic>;
        _usage = values[1] as Map<String, dynamic>;
        _plans = (values[2] as List<dynamic>)
            .whereType<Map<String, dynamic>>()
            .toList();
        _bills = (values[3] as List<dynamic>)
            .whereType<Map<String, dynamic>>()
            .toList();
        _paymentPending = pendingReference != null;
        _message = null;
      });
    } catch (error) {
      if (mounted) setState(() => _message = apiErrorMessage(error));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _selectPlan(String planCode) async {
    await _run(() async {
      final selection = await ref
          .read(apiProvider)
          .post<Map<String, dynamic>>(
            '/organizations/$_organizationId/subscription/select-plan',
            data: {'planCode': planCode, 'billingInterval': _interval},
          );
      final bill = selection['billingRecord'];
      if (bill is Map<String, dynamic> && bill['id'] != null) {
        await _payBill(bill['id'].toString(), nested: true);
      } else {
        _message = 'Plan change scheduled for the next billing period.';
        await _load();
      }
    });
  }

  Future<void> _payBill(String billId, {bool nested = false}) async {
    Future<void> action() async {
      final intent = await ref
          .read(apiProvider)
          .post<Map<String, dynamic>>(
            '/organizations/$_organizationId/payments/paystack/subscriptions/$billId/initialize',
            headers: {'Idempotency-Key': const Uuid().v4()},
          );
      final reference = intent['reference']?.toString();
      final authorizationUrl = intent['authorizationUrl']?.toString();
      if (reference == null || authorizationUrl == null) {
        throw ApiFailure('Paystack did not return a payment session.');
      }
      await _storage.write(key: _referenceKey, value: reference);
      _paymentPending = true;
      final opened = await launchUrl(
        Uri.parse(authorizationUrl),
        mode: LaunchMode.externalApplication,
      );
      if (!opened) throw ApiFailure('Unable to open Paystack checkout.');
      if (mounted) {
        setState(() {
          _message =
              'Complete payment in Paystack, then return here. Verification is automatic and safe to retry.';
        });
      }
    }

    if (nested) {
      await action();
    } else {
      await _run(action);
    }
  }

  Future<void> _verifyPendingPayment() async {
    final reference = await _storage.read(key: _referenceKey);
    if (reference == null || _busy) return;
    await _run(() async {
      final result = await ref
          .read(apiProvider)
          .post<Map<String, dynamic>>(
            '/organizations/$_organizationId/payments/paystack/subscriptions/${Uri.encodeComponent(reference)}/verify',
          );
      final status = result['status']?.toString() ?? 'PENDING';
      if (status == 'COMPLETED') {
        await _storage.delete(key: _referenceKey);
        _paymentPending = false;
        _message = 'Payment verified. Your AllShops subscription is active.';
        await _load();
      } else {
        _message = 'Payment status: $status. You can verify again safely.';
      }
    });
  }

  Future<void> _renewal(String action) async {
    await _run(() async {
      await ref
          .read(apiProvider)
          .post<Object?>(
            '/organizations/$_organizationId/subscription/$action',
          );
      _message = action == 'resume'
          ? 'Automatic renewal resumed.'
          : 'Subscription will cancel at the end of the paid period.';
      await _load();
    });
  }

  Future<void> _run(Future<void> Function() action) async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _message = null;
    });
    try {
      await action();
    } catch (error) {
      if (mounted) setState(() => _message = apiErrorMessage(error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: const Text('Subscription'),
      actions: [
        IconButton(
          onPressed: _busy ? null : _load,
          icon: const Icon(Icons.refresh),
        ),
      ],
    ),
    body: _loading
        ? const Center(child: CircularProgressIndicator())
        : RefreshIndicator(
            onRefresh: _load,
            child: ListView(
              padding: const EdgeInsets.all(18),
              children: [
                _SubscriptionHero(subscription: _subscription),
                const SizedBox(height: 14),
                if (_message != null) _Notice(message: _message!, error: false),
                if (_paymentPending) ...[
                  const SizedBox(height: 10),
                  FilledButton.icon(
                    onPressed: _busy ? null : _verifyPendingPayment,
                    icon: const Icon(Icons.verified_user_outlined),
                    label: const Text('Verify Paystack payment'),
                  ),
                ],
                const SizedBox(height: 18),
                Row(
                  children: [
                    const Expanded(
                      child: Text(
                        'Usage & limits',
                        style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                    ),
                    if (_subscription?['currentPeriodEnd'] != null)
                      TextButton(
                        onPressed: _busy
                            ? null
                            : () => _renewal(
                                _subscription?['cancelAtPeriodEnd'] == true
                                    ? 'resume'
                                    : 'cancel',
                              ),
                        child: Text(
                          _subscription?['cancelAtPeriodEnd'] == true
                              ? 'Resume renewal'
                              : 'Cancel renewal',
                        ),
                      ),
                  ],
                ),
                ..._usage.entries.map((entry) {
                  final value = entry.value is Map
                      ? Map<String, dynamic>.from(entry.value as Map)
                      : const <String, dynamic>{};
                  final current = value['current'] ?? 0;
                  final maximum = value['maximum'];
                  final percentage = (value['percentage'] as num?)?.toDouble();
                  return Card(
                    child: Padding(
                      padding: const EdgeInsets.all(14),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Expanded(child: Text(_label(entry.key))),
                              Text('$current / ${maximum ?? 'Unlimited'}'),
                            ],
                          ),
                          if (percentage != null) ...[
                            const SizedBox(height: 10),
                            LinearProgressIndicator(
                              value: (percentage / 100).clamp(0, 1),
                              borderRadius: BorderRadius.circular(20),
                            ),
                          ],
                        ],
                      ),
                    ),
                  );
                }),
                const SizedBox(height: 18),
                Row(
                  children: [
                    const Expanded(
                      child: Text(
                        'Choose a plan',
                        style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                    ),
                    SegmentedButton<String>(
                      segments: const [
                        ButtonSegment(value: 'MONTHLY', label: Text('Monthly')),
                        ButtonSegment(value: 'ANNUAL', label: Text('Annual')),
                      ],
                      selected: {_interval},
                      onSelectionChanged: _busy
                          ? null
                          : (value) => setState(() => _interval = value.first),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                ..._plans
                    .where((plan) => plan['code'] != 'ENTERPRISE')
                    .map(
                      (plan) => _PlanCard(
                        plan: plan,
                        interval: _interval,
                        current:
                            (_subscription?['plan'] as Map?)?['code'] ==
                            plan['code'],
                        canManage: widget.membership.hasPermission(
                          'billing.manage',
                        ),
                        busy: _busy,
                        onSelect: () => _selectPlan(plan['code'].toString()),
                      ),
                    ),
                if (_plans.any((plan) => plan['code'] == 'ENTERPRISE'))
                  Container(
                    margin: const EdgeInsets.only(top: 6),
                    padding: const EdgeInsets.all(17),
                    decoration: BoxDecoration(
                      color: const Color(0xFF173B34),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: const Row(
                      children: [
                        CircleAvatar(
                          backgroundColor: Color(0xFFFFCF5C),
                          child: Icon(Icons.apartment_rounded),
                        ),
                        SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'Enterprise rollout',
                                style: TextStyle(
                                  color: Colors.white,
                                  fontWeight: FontWeight.w900,
                                ),
                              ),
                              Text(
                                'Custom limits and assisted multi-site planning. Contact support@ekazi.co.ke.',
                                style: TextStyle(
                                  color: Color(0xFFBDD4CD),
                                  fontSize: 12,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                const SizedBox(height: 18),
                const Text(
                  'Billing history',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900),
                ),
                const SizedBox(height: 10),
                if (_bills.isEmpty)
                  const Card(
                    child: ListTile(title: Text('No billing records yet.')),
                  ),
                ..._bills.map(
                  (bill) => Card(
                    child: ListTile(
                      title: Text(
                        bill['billingNumber']?.toString() ?? 'Bill',
                        style: const TextStyle(fontWeight: FontWeight.w800),
                      ),
                      subtitle: Text(
                        '${bill['planNameSnapshot'] ?? ''} · ${bill['currency'] ?? ''} ${(((bill['amountMinor'] as num?) ?? 0) / 100).toStringAsFixed(2)}\n${bill['status'] ?? ''}',
                      ),
                      isThreeLine: true,
                      trailing: bill['status'] == 'DUE'
                          ? FilledButton.tonal(
                              onPressed: _busy
                                  ? null
                                  : () => _payBill(bill['id'].toString()),
                              child: const Text('Pay by card'),
                            )
                          : const Icon(Icons.check_circle_outline),
                    ),
                  ),
                ),
              ],
            ),
          ),
  );
}

class _SubscriptionHero extends StatelessWidget {
  const _SubscriptionHero({required this.subscription});
  final Map<String, dynamic>? subscription;

  @override
  Widget build(BuildContext context) {
    final plan = subscription?['plan'];
    final planName = plan is Map ? plan['name']?.toString() : null;
    return Container(
      padding: const EdgeInsets.all(22),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFF172C2B), Color(0xFF28564D)],
        ),
        borderRadius: BorderRadius.circular(24),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'ALLSHOPS MEMBERSHIP',
            style: TextStyle(
              color: Color(0xFFFFCF5C),
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: 9),
          Text(
            planName ?? 'Subscription',
            style: const TextStyle(
              color: Colors.white,
              fontSize: 28,
              fontWeight: FontWeight.w900,
            ),
          ),
          Text(
            '${subscription?['status'] ?? 'Loading'} · ${subscription?['billingInterval'] ?? ''}',
            style: const TextStyle(color: Color(0xFFAEC5BD)),
          ),
          if (subscription?['currentPeriodEnd'] != null) ...[
            const SizedBox(height: 12),
            Text(
              'Current period ends ${subscription!['currentPeriodEnd']}',
              style: const TextStyle(color: Colors.white70),
            ),
          ],
        ],
      ),
    );
  }
}

class _PlanCard extends StatelessWidget {
  const _PlanCard({
    required this.plan,
    required this.interval,
    required this.current,
    required this.canManage,
    required this.busy,
    required this.onSelect,
  });
  final Map<String, dynamic> plan;
  final String interval;
  final bool current;
  final bool canManage;
  final bool busy;
  final VoidCallback onSelect;

  @override
  Widget build(BuildContext context) {
    final code = plan['code']?.toString() ?? '';
    final featured = code == 'BUSINESS';
    final amount =
        ((interval == 'ANNUAL'
                    ? plan['annualPriceMinor']
                    : plan['monthlyPriceMinor'])
                as num? ??
            0) /
        100;
    final features = (plan['features'] as List<dynamic>? ?? const [])
        .whereType<Map<String, dynamic>>()
        .where((item) => item['enabled'] == true)
        .toList();
    final limits = (plan['limits'] as List<dynamic>? ?? const [])
        .whereType<Map<String, dynamic>>()
        .toList();
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(19),
      decoration: BoxDecoration(
        gradient: featured
            ? const LinearGradient(
                colors: [Color(0xFFFFF8E5), Color(0xFFFFE8DE)],
              )
            : null,
        color: featured ? null : Colors.white,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(
          color: featured ? const Color(0xFFF35F45) : const Color(0xFFDDE9E4),
          width: featured ? 2 : 1,
        ),
        boxShadow: const [
          BoxShadow(
            color: Color(0x100F342B),
            blurRadius: 22,
            offset: Offset(0, 9),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 45,
                height: 45,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: featured
                      ? const Color(0xFFFFDED3)
                      : const Color(0xFFE5F5EE),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Icon(
                  code == 'STARTER'
                      ? Icons.bolt_rounded
                      : code == 'BUSINESS'
                      ? Icons.storefront_rounded
                      : Icons.auto_graph_rounded,
                  color: featured
                      ? const Color(0xFFF35F45)
                      : const Color(0xFF278565),
                ),
              ),
              const Spacer(),
              if (featured)
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 9,
                    vertical: 5,
                  ),
                  decoration: BoxDecoration(
                    color: const Color(0xFFFFCF5C),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: const Text(
                    'MOST POPULAR',
                    style: TextStyle(fontSize: 9, fontWeight: FontWeight.w900),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 14),
          Text(
            plan['name']?.toString() ?? 'Plan',
            style: const TextStyle(fontSize: 23, fontWeight: FontWeight.w900),
          ),
          Text(
            plan['description']?.toString() ?? _planDescription(code),
            style: const TextStyle(color: Colors.blueGrey, height: 1.4),
          ),
          const SizedBox(height: 12),
          Text.rich(
            TextSpan(
              children: [
                TextSpan(
                  text:
                      '${plan['currency'] ?? ''} ${amount.toStringAsFixed(amount.truncateToDouble() == amount ? 0 : 2)}',
                  style: const TextStyle(
                    fontSize: 24,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                TextSpan(
                  text: interval == 'ANNUAL' ? ' / year' : ' / month',
                  style: const TextStyle(color: Colors.blueGrey),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 7,
            runSpacing: 7,
            children: limits
                .map(
                  (limit) => Chip(
                    visualDensity: VisualDensity.compact,
                    label: Text(
                      '${limit['value'] ?? 'Unlimited'} ${_limitLabel(limit['limitCode']?.toString() ?? '')}',
                      style: const TextStyle(fontSize: 11),
                    ),
                  ),
                )
                .toList(),
          ),
          const SizedBox(height: 12),
          ...features.map(
            (feature) => Padding(
              padding: const EdgeInsets.only(bottom: 7),
              child: Row(
                children: [
                  const Icon(
                    Icons.check_circle_rounded,
                    size: 17,
                    color: Color(0xFF2B9A6D),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      _featureLabel(feature['featureCode']?.toString() ?? ''),
                      style: const TextStyle(fontWeight: FontWeight.w600),
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 10),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: current || !canManage || busy ? null : onSelect,
              child: Text(
                current
                    ? 'Current plan'
                    : canManage
                    ? 'Choose ${plan['name']}'
                    : 'Owner approval required',
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Notice extends StatelessWidget {
  const _Notice({required this.message, required this.error});
  final String message;
  final bool error;
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(14),
    decoration: BoxDecoration(
      color: error ? const Color(0xFFFFE4DA) : const Color(0xFFE5F5EF),
      borderRadius: BorderRadius.circular(14),
    ),
    child: Text(message, style: const TextStyle(fontWeight: FontWeight.w700)),
  );
}

String _label(String value) => value
    .replaceAllMapped(RegExp(r'([A-Z])'), (match) => ' ${match.group(1)}')
    .replaceAll('_', ' ')
    .trim()
    .split(' ')
    .map(
      (part) =>
          part.isEmpty ? part : '${part[0].toUpperCase()}${part.substring(1)}',
    )
    .join(' ');

String _planDescription(String code) =>
    const {
      'STARTER':
          'A focused toolkit for a single counter and growing catalogue.',
      'BUSINESS': 'Complete daily operations for established shops and teams.',
      'GROWTH': 'Multi-branch control, offline selling and deeper insight.',
    }[code] ??
    'Flexible tools for your business.';

String _featureLabel(String code) =>
    const {
      'pos': 'Modern POS checkout',
      'inventory': 'Inventory control',
      'customers': 'Customer records',
      'reports': 'Core reporting',
      'suppliers': 'Suppliers & purchasing',
      'purchases': 'Purchase workflows',
      'expenses': 'Expense tracking',
      'customer_credit': 'Customer credit',
      'reports_profit': 'Profit reporting',
      'exports': 'Protected exports',
      'appointments': 'Appointments',
      'commissions': 'Staff commissions',
      'offline_pos': 'Offline POS',
      'multi_branch': 'Multi-branch operations',
    }[code] ??
    _label(code);

String _limitLabel(String code) =>
    const {
      'branches.max': 'branches',
      'users.max': 'users',
      'devices.max': 'POS devices',
      'products.max': 'products',
    }[code] ??
    code;
