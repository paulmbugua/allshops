import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../app.dart';
import '../../core/api_client.dart';
import '../../core/models.dart';

class ReconciliationScreen extends ConsumerStatefulWidget {
  const ReconciliationScreen({super.key, required this.membership});
  final Membership membership;

  @override
  ConsumerState<ReconciliationScreen> createState() =>
      _ReconciliationScreenState();
}

class _ReconciliationScreenState extends ConsumerState<ReconciliationScreen> {
  DateTime date = DateTime.now();
  List<Map<String, dynamic>> branches = const [];
  Map<String, dynamic>? report;
  String? branchId;
  String? message;
  bool loading = true;

  String get base => '/organizations/${widget.membership.organizationId}';
  String get dateKey => DateFormat('yyyy-MM-dd').format(date);

  @override
  void initState() {
    super.initState();
    branchId = widget.membership.branchId;
    _bootstrap();
  }

  Future<void> _bootstrap() async {
    try {
      final values = await ref
          .read(apiProvider)
          .get<List<dynamic>>('$base/branches');
      branches = values
          .whereType<Map>()
          .map((row) => Map<String, dynamic>.from(row))
          .toList();
      if (branchId == null &&
          !widget.membership.hasPermission('reconciliation.read_all')) {
        branchId = branches.firstOrNull?['id']?.toString();
      }
      await _load();
    } catch (error) {
      if (mounted) {
        setState(() {
          message = apiErrorMessage(error);
          loading = false;
        });
      }
    }
  }

  Future<void> _load() async {
    if (branchId == null &&
        !widget.membership.hasPermission('reconciliation.read_all')) {
      return;
    }
    if (mounted) setState(() => loading = true);
    try {
      final value = await ref
          .read(apiProvider)
          .get<Map<String, dynamic>>(
            '$base/reconciliations/daily',
            query: {
              'date': dateKey,
              if (branchId != null) 'branchId': branchId,
            },
          );
      if (mounted) {
        setState(() {
          report = value;
          message = null;
        });
      }
    } catch (error) {
      if (mounted) setState(() => message = apiErrorMessage(error));
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> _pickDate() async {
    final value = await showDatePicker(
      context: context,
      initialDate: date,
      firstDate: DateTime(2020),
      lastDate: DateTime.now(),
    );
    if (value != null) {
      setState(() => date = value);
      await _load();
    }
  }

  Future<void> _submit() async {
    final rows = (report?['rows'] as List<dynamic>? ?? const [])
        .whereType<Map>();
    final currentUserId = report?['currentUserId']?.toString();
    final own = rows
        .where((row) => row['cashierId']?.toString() == currentUserId)
        .firstOrNull;
    final changed = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      showDragHandle: true,
      builder: (_) => _CashDeclarationSheet(
        base: base,
        branchId: branchId!,
        date: dateKey,
        expectedMinor: _int(own?['expectedCashMinor']),
      ),
    );
    if (changed == true) await _load();
  }

  Future<void> _approve(String id) async {
    try {
      await ref
          .read(apiProvider)
          .patch<Object?>('$base/reconciliations/$id/approve');
      if (mounted) setState(() => message = 'Cash-up approved.');
      await _load();
    } catch (error) {
      if (mounted) setState(() => message = apiErrorMessage(error));
    }
  }

  @override
  Widget build(BuildContext context) {
    final aggregate = report?['aggregate'] as Map<String, dynamic>? ?? const {};
    final rows = (report?['rows'] as List<dynamic>? ?? const [])
        .whereType<Map>()
        .map((row) => Map<String, dynamic>.from(row))
        .toList();
    return Scaffold(
      appBar: AppBar(
        title: Text(
          translateLabel(context, 'End-of-day cash-up'),
          style: const TextStyle(fontWeight: FontWeight.w900),
        ),
        actions: [
          IconButton(
            onPressed: loading ? null : _load,
            icon: const Icon(Icons.refresh_rounded),
          ),
        ],
      ),
      floatingActionButton:
          widget.membership.hasPermission('reconciliation.submit') &&
              branchId != null
          ? FloatingActionButton.extended(
              onPressed: _submit,
              icon: const Icon(Icons.price_check_rounded),
              label: const Text('Declare cash'),
            )
          : null,
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(14, 12, 14, 100),
          children: [
            Container(
              padding: const EdgeInsets.all(18),
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [Color(0xFF6D1734), Color(0xFF9C3155)],
                ),
                borderRadius: BorderRadius.circular(22),
              ),
              child: const Row(
                children: [
                  CircleAvatar(
                    backgroundColor: Color(0xFFFFCF5C),
                    child: Icon(
                      Icons.account_balance_wallet_outlined,
                      color: Color(0xFF6D1734),
                    ),
                  ),
                  SizedBox(width: 13),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Daily reconciliation',
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: 20,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                        Text(
                          'Cashier declarations roll up to branch and head office.',
                          style: TextStyle(color: Color(0xFFFFDCE8)),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: InkWell(
                    onTap: _pickDate,
                    child: InputDecorator(
                      decoration: const InputDecoration(
                        labelText: 'Business date',
                      ),
                      child: Text(DateFormat('d MMM y').format(date)),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: DropdownButtonFormField<String?>(
                    initialValue: branchId,
                    decoration: const InputDecoration(labelText: 'Branch'),
                    items: [
                      if (widget.membership.branchId == null &&
                          widget.membership.hasPermission(
                            'reconciliation.read_all',
                          ))
                        const DropdownMenuItem<String?>(
                          value: null,
                          child: Text('All branches · head office'),
                        ),
                      ...branches.map(
                        (row) => DropdownMenuItem<String?>(
                          value: row['id']?.toString(),
                          child: Text(row['name']?.toString() ?? ''),
                        ),
                      ),
                    ],
                    onChanged: widget.membership.branchId == null
                        ? (value) {
                            setState(() => branchId = value);
                            _load();
                          }
                        : null,
                  ),
                ),
              ],
            ),
            if (loading)
              const Padding(
                padding: EdgeInsets.all(24),
                child: Center(child: CircularProgressIndicator()),
              ),
            if (message != null)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 8),
                child: Text(message!),
              ),
            if (report != null) ...[
              const SizedBox(height: 12),
              GridView.count(
                crossAxisCount: 2,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                childAspectRatio: 1.75,
                mainAxisSpacing: 8,
                crossAxisSpacing: 8,
                children: [
                  _Metric(
                    'Total sales',
                    aggregate['totalSalesMinor'],
                    Icons.receipt_long_outlined,
                  ),
                  _Metric(
                    'Expected cash',
                    aggregate['expectedCashMinor'],
                    Icons.payments_outlined,
                  ),
                  _Metric(
                    'Local cards',
                    aggregate['cardSalesMinor'],
                    Icons.credit_card_outlined,
                  ),
                  _Metric(
                    'Credit sales',
                    aggregate['creditSalesMinor'],
                    Icons.person_pin_circle_outlined,
                  ),
                ],
              ),
              const SizedBox(height: 16),
              Text(
                '${_int(aggregate['transactionCount'])} transactions · ${_int(aggregate['submittedCount'])}/${rows.length} submitted',
                style: const TextStyle(fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 8),
              ...rows.map(
                (row) => Card(
                  child: Padding(
                    padding: const EdgeInsets.all(14),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Expanded(
                              child: Text(
                                row['cashierName']?.toString() ?? 'Cashier',
                                style: const TextStyle(
                                  fontWeight: FontWeight.w900,
                                  fontSize: 16,
                                ),
                              ),
                            ),
                            Chip(
                              label: Text(
                                row['status']?.toString() ?? 'PENDING',
                              ),
                            ),
                          ],
                        ),
                        Text(
                          '${row['employeeNumber'] ?? 'Staff'} · ${_int(row['transactionCount'])} transactions',
                          style: const TextStyle(color: Colors.blueGrey),
                        ),
                        const Divider(),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            const Text('Expected cash'),
                            Text(_money(row['expectedCashMinor'])),
                          ],
                        ),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            const Text('Counted cash'),
                            Text(
                              row['countedCashMinor'] == null
                                  ? 'Pending'
                                  : _money(row['countedCashMinor']),
                            ),
                          ],
                        ),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            const Text('Variance'),
                            Text(
                              row['varianceMinor'] == null
                                  ? '—'
                                  : _money(row['varianceMinor']),
                              style: TextStyle(
                                color: _int(row['varianceMinor']) == 0
                                    ? Colors.green
                                    : Colors.red,
                                fontWeight: FontWeight.w900,
                              ),
                            ),
                          ],
                        ),
                        if (widget.membership.hasPermission(
                              'reconciliation.approve',
                            ) &&
                            row['reconciliationId'] != null &&
                            row['status'] == 'SUBMITTED')
                          Align(
                            alignment: Alignment.centerRight,
                            child: TextButton.icon(
                              onPressed: () =>
                                  _approve(row['reconciliationId'].toString()),
                              icon: const Icon(Icons.verified_outlined),
                              label: const Text('Approve'),
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
              ),
              if (rows.isEmpty)
                const Padding(
                  padding: EdgeInsets.all(30),
                  child: Center(
                    child: Text('No completed sales for this date.'),
                  ),
                ),
            ],
          ],
        ),
      ),
    );
  }
}

class _CashDeclarationSheet extends ConsumerStatefulWidget {
  const _CashDeclarationSheet({
    required this.base,
    required this.branchId,
    required this.date,
    required this.expectedMinor,
  });
  final String base;
  final String branchId;
  final String date;
  final int expectedMinor;
  @override
  ConsumerState<_CashDeclarationSheet> createState() =>
      _CashDeclarationSheetState();
}

class _CashDeclarationSheetState extends ConsumerState<_CashDeclarationSheet> {
  final counted = TextEditingController();
  final notes = TextEditingController();
  bool busy = false;
  String? error;
  @override
  void dispose() {
    counted.dispose();
    notes.dispose();
    super.dispose();
  }

  Future<void> save() async {
    final amount = double.tryParse(counted.text);
    if (amount == null || amount < 0) {
      setState(() => error = 'Enter the physical cash counted.');
      return;
    }
    setState(() => busy = true);
    try {
      await ref
          .read(apiProvider)
          .post<Object?>(
            '${widget.base}/reconciliations',
            data: {
              'date': widget.date,
              'branchId': widget.branchId,
              'countedCashMinor': (amount * 100).round(),
              'notes': notes.text.trim().isEmpty ? null : notes.text.trim(),
            },
          );
      if (mounted) Navigator.pop(context, true);
    } catch (value) {
      if (mounted) {
        setState(() {
          busy = false;
          error = apiErrorMessage(value);
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) => Padding(
    padding: EdgeInsets.fromLTRB(
      20,
      0,
      20,
      MediaQuery.viewInsetsOf(context).bottom + 24,
    ),
    child: SingleChildScrollView(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text(
            'Declare cashier cash',
            style: TextStyle(fontSize: 23, fontWeight: FontWeight.w900),
          ),
          Text(
            'System expected ${_money(widget.expectedMinor)} after customer change.',
            style: const TextStyle(color: Colors.blueGrey),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: counted,
            autofocus: true,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: const InputDecoration(
              labelText: 'Counted cash',
              prefixText: 'QAR ',
            ),
          ),
          const SizedBox(height: 10),
          TextField(
            controller: notes,
            maxLines: 3,
            decoration: const InputDecoration(
              labelText: 'Difference note (optional)',
            ),
          ),
          if (error != null)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: Text(error!, style: const TextStyle(color: Colors.red)),
            ),
          const SizedBox(height: 12),
          FilledButton.icon(
            onPressed: busy ? null : save,
            icon: const Icon(Icons.send_outlined),
            label: Text(busy ? 'Submitting…' : 'Submit to management'),
          ),
        ],
      ),
    ),
  );
}

class _Metric extends StatelessWidget {
  const _Metric(this.label, this.value, this.icon);
  final String label;
  final dynamic value;
  final IconData icon;
  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 20),
          const Spacer(),
          Text(
            label,
            style: const TextStyle(fontSize: 11, color: Colors.blueGrey),
          ),
          Text(
            _money(value),
            style: const TextStyle(fontWeight: FontWeight.w900),
          ),
        ],
      ),
    ),
  );
}

int _int(dynamic value) =>
    value is num ? value.toInt() : int.tryParse('$value') ?? 0;
String _money(dynamic value) => 'QAR ${(_int(value) / 100).toStringAsFixed(2)}';
