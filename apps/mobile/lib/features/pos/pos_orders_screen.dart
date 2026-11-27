import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:uuid/uuid.dart';

import '../../core/api_client.dart';

const stages = ['PLACED', 'IN_PROGRESS', 'READY', 'FULFILLED'];

String orderMoney(Object? minor) =>
    'Ksh ${((minor as num? ?? 0) / 100).toStringAsFixed(2)}';

Future<Map<String, String>?> captureOrderDetails(
  BuildContext context,
  Map<String, dynamic> workflow,
) {
  final channels = (workflow['channels'] as List).cast<String>();
  var channel = channels.first;
  var reference = '';
  var notes = '';
  final form = GlobalKey<FormState>();
  return showDialog<Map<String, String>>(
    context: context,
    builder: (dialogContext) => AlertDialog(
      title: Text('Place ${workflow['ticket'].toString().toLowerCase()}'),
      content: Form(
        key: form,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              DropdownButtonFormField<String>(
                initialValue: channel,
                isExpanded: true,
                decoration: const InputDecoration(labelText: 'Order type'),
                items: channels
                    .map(
                      (value) =>
                          DropdownMenuItem(value: value, child: Text(value)),
                    )
                    .toList(),
                onChanged: (value) {
                  if (value != null) channel = value;
                },
              ),
              TextFormField(
                maxLength: 120,
                decoration: InputDecoration(
                  labelText: 'Reference',
                  helperText: workflow['example']?.toString(),
                ),
                onChanged: (value) => reference = value.trim(),
                validator: (value) => value == null || value.trim().isEmpty
                    ? 'Enter a reference.'
                    : null,
              ),
              TextFormField(
                maxLength: 1000,
                maxLines: 2,
                decoration: const InputDecoration(
                  labelText: 'Instructions (optional)',
                ),
                onChanged: (value) => notes = value.trim(),
              ),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(dialogContext),
          child: const Text('Cancel'),
        ),
        FilledButton(
          onPressed: () {
            if (form.currentState?.validate() ?? false) {
              Navigator.pop(dialogContext, {
                'channel': channel,
                'reference': reference,
                if (notes.isNotEmpty) 'notes': notes,
              });
            }
          },
          child: const Text('Place order'),
        ),
      ],
    ),
  );
}

class PosOrdersScreen extends StatefulWidget {
  const PosOrdersScreen({
    super.key,
    required this.api,
    required this.organizationId,
    required this.branchId,
    required this.profiles,
    required this.title,
    required this.canAdvance,
    required this.canCancel,
    required this.canPay,
    required this.canReceipt,
  });

  final ApiClient api;
  final String organizationId;
  final String branchId;
  final Map<String, dynamic> profiles;
  final String title;
  final bool canAdvance, canCancel, canPay, canReceipt;

  @override
  State<PosOrdersScreen> createState() => _PosOrdersScreenState();
}

class _PosOrdersScreenState extends State<PosOrdersScreen> {
  static const pageSize = 25;
  List<dynamic> rows = [];
  int page = 1, total = 0;
  bool busy = false;
  String? error;
  Map<String, dynamic>? ticket, sale;
  String? attemptPayload, attemptKey;
  String get base => '/organizations/${widget.organizationId}';

  @override
  void initState() {
    super.initState();
    refresh();
  }

  Future<void> run(Future<void> Function() action) async {
    if (busy) return;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await action();
    } catch (failure) {
      error = apiErrorMessage(failure);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> refresh([int? requestedPage]) => run(() async {
    final nextPage = requestedPage ?? page;
    final result = await widget.api.get<Map<String, dynamic>>(
      '$base/pos/orders',
      query: {
        'branchId': widget.branchId,
        'page': nextPage,
        'pageSize': pageSize,
      },
    );
    rows = result['items'] as List;
    total = result['total'] as int;
    page = nextPage;
  });

  Future<void> openOrder(String id) => run(() async {
    final result = await widget.api.get<Map<String, dynamic>>(
      '$base/sales/$id',
    );
    if (result['status'] != 'HELD' || result['orderStage'] == null) {
      throw StateError('This order is no longer open. Refresh the queue.');
    }
    ticket = result;
  });

  List<String> stepLabels(Map<String, dynamic> order) {
    final profile = widget.profiles[order['orderCategory']];
    final workflow = profile is Map<String, dynamic>
        ? profile['workflow']
        : null;
    return workflow is Map<String, dynamic> && workflow['steps'] is List
        ? (workflow['steps'] as List).cast<String>()
        : ['Placed', 'In progress', 'Ready', 'Handed over'];
  }

  Future<void> advance(Map<String, dynamic> order) => run(() async {
    ticket = await widget.api.post<Map<String, dynamic>>(
      '$base/pos/orders/${order['id']}/advance',
      data: {'from': order['orderStage']},
    );
  });

  Future<void> cancel(Map<String, dynamic> order) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Cancel unpaid order?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Keep order'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('Cancel order'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    await run(() async {
      await widget.api.post<dynamic>('$base/sales/${order['id']}/cancel');
      ticket = null;
    });
    if (mounted && ticket == null) await refresh(1);
  }

  Future<void> pay(Map<String, dynamic> order) async {
    final due = order['totalMinor'] as int;
    var method = 'CASH';
    var entry = '';
    final form = GlobalKey<FormState>();
    final payment = await showDialog<Map<String, Object?>>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, update) => AlertDialog(
          title: Text('Collect ${orderMoney(due)}'),
          content: Form(
            key: form,
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (due > 0) ...[
                    DropdownButtonFormField<String>(
                      initialValue: method,
                      isExpanded: true,
                      decoration: const InputDecoration(
                        labelText: 'Payment method',
                      ),
                      items: const [
                        DropdownMenuItem(value: 'CASH', child: Text('Cash')),
                        DropdownMenuItem(
                          value: 'CARD',
                          child: Text('Local bank card'),
                        ),
                        DropdownMenuItem(
                          value: 'MPESA',
                          child: Text('M-Pesa PayBill received'),
                        ),
                      ],
                      onChanged: (value) {
                        if (value != null) {
                          update(() {
                            entry = '';
                            method = value;
                          });
                        }
                      },
                    ),
                    TextFormField(
                      key: ValueKey(method),
                      maxLength: 80,
                      keyboardType: method == 'CASH'
                          ? const TextInputType.numberWithOptions(decimal: true)
                          : TextInputType.text,
                      decoration: InputDecoration(
                        labelText: method == 'CASH'
                            ? 'Cash received'
                            : method == 'CARD'
                            ? 'Terminal approval reference'
                            : 'Verified PayBill transaction code',
                        hintText: method == 'CASH'
                            ? (due / 100).toStringAsFixed(2)
                            : null,
                      ),
                      onChanged: (value) => entry = value.trim(),
                      validator: (_) {
                        if (method == 'CASH') {
                          final amount = double.tryParse(entry);
                          return entry.isEmpty ||
                                  (amount != null &&
                                      amount.isFinite &&
                                      (amount * 100).round() >= due)
                              ? null
                              : 'Cash must cover the total.';
                        }
                        if (method == 'MPESA') {
                          return RegExp(r'^[A-Za-z0-9]{8,16}$').hasMatch(entry)
                              ? null
                              : 'Enter the verified transaction code.';
                        }
                        return entry.isEmpty
                            ? 'Enter the terminal reference.'
                            : null;
                      },
                    ),
                    if (method == 'MPESA')
                      const Text(
                        'Confirm the payment in your PayBill account first.',
                      ),
                  ],
                ],
              ),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext),
              child: const Text('Back'),
            ),
            FilledButton(
              onPressed: () {
                if (!(form.currentState?.validate() ?? false)) return;
                Navigator.pop(dialogContext, <String, Object?>{
                  'payments': due == 0
                      ? []
                      : [
                          {
                            'method': method == 'MPESA' ? 'OTHER' : method,
                            'amountMinor': method == 'CASH' && entry.isNotEmpty
                                ? (double.parse(entry) * 100).round()
                                : due,
                            if (method == 'MPESA')
                              'reference':
                                  'M-PESA MANUAL:${entry.toUpperCase()}',
                            if (method == 'CARD') 'reference': 'LOCAL:$entry',
                          },
                        ],
                });
              },
              child: const Text('Complete payment'),
            ),
          ],
        ),
      ),
    );
    if (payment == null || !mounted) return;
    final payload = '${order['id']}:${jsonEncode(payment)}';
    if (attemptPayload != payload) {
      attemptPayload = payload;
      attemptKey = const Uuid().v4();
    }
    await run(() async {
      sale = await widget.api.post<Map<String, dynamic>>(
        '$base/sales/${order['id']}/complete',
        data: payment,
        headers: {'Idempotency-Key': attemptKey},
      );
      ticket = null;
    });
  }

  @override
  Widget build(BuildContext context) {
    final order = ticket;
    final paid = sale;
    final stage = order == null
        ? -1
        : stages.indexOf(order['orderStage'] as String);
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.title),
        actions: [
          if (order == null && paid == null)
            IconButton(
              onPressed: busy ? null : () => refresh(1),
              icon: const Icon(Icons.refresh),
              tooltip: 'Refresh orders',
            ),
        ],
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            if (busy) const LinearProgressIndicator(),
            if (error != null)
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: Text(
                  error!,
                  style: TextStyle(color: Theme.of(context).colorScheme.error),
                ),
              ),
            if (paid != null) ...[
              Text(
                'Payment complete',
                style: Theme.of(context).textTheme.headlineSmall,
              ),
              Text(
                '${paid['invoiceNumber']} · ${orderMoney(paid['totalMinor'])}',
              ),
              if ((paid['changeMinor'] as int? ?? 0) > 0)
                Text('Change due ${orderMoney(paid['changeMinor'])}'),
              if (widget.canReceipt)
                TextButton(
                  onPressed: busy
                      ? null
                      : () => run(() async {
                          final receipt = await widget.api
                              .get<Map<String, dynamic>>(
                                '$base/sales/${paid['id']}/receipt',
                              );
                          if (!context.mounted) return;
                          await showDialog<void>(
                            context: context,
                            builder: (dialogContext) => AlertDialog(
                              title: Text(
                                'Receipt ${receipt['invoiceNumber']}',
                              ),
                              content: SingleChildScrollView(
                                child: Column(
                                  mainAxisSize: MainAxisSize.min,
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      (receipt['organization'] as Map?)?['name']
                                              ?.toString() ??
                                          '',
                                    ),
                                    if ((receipt['branch']
                                            as Map?)?['address'] !=
                                        null)
                                      Text(
                                        '${(receipt['branch'] as Map)['address']}',
                                      ),
                                    if (receipt['kraPin'] != null)
                                      Text('KRA PIN ${receipt['kraPin']}'),
                                    for (final line
                                        in (receipt['items'] as List))
                                      Text(
                                        '${line['quantity']} × ${line['productNameSnapshot']} · ${orderMoney(line['totalMinor'])}',
                                      ),
                                    Text(
                                      'Paid ${orderMoney(receipt['paidMinor'])}',
                                    ),
                                  ],
                                ),
                              ),
                              actions: [
                                TextButton(
                                  onPressed: () => Navigator.pop(dialogContext),
                                  child: const Text('Done'),
                                ),
                              ],
                            ),
                          );
                        }),
                  child: const Text('View receipt'),
                ),
              FilledButton(
                onPressed: busy
                    ? null
                    : () {
                        setState(() => sale = null);
                        refresh(1);
                      },
                child: const Text('Back to orders'),
              ),
            ] else if (order != null) ...[
              TextButton(
                onPressed: busy
                    ? null
                    : () {
                        setState(() => ticket = null);
                        refresh(1);
                      },
                child: const Text('Back to orders'),
              ),
              Text(
                order['orderReference'].toString(),
                style: Theme.of(context).textTheme.headlineSmall,
              ),
              Text(
                '${order['orderChannel']} · ${stage < 0 ? '' : stepLabels(order)[stage]}',
              ),
              if (order['notes'] != null) Text(order['notes'].toString()),
              for (final item in (order['items'] as List))
                ListTile(
                  title: Text(item['productNameSnapshot'].toString()),
                  subtitle: Text(
                    '${item['quantity']} · ${item['variantNameSnapshot'] ?? ''}',
                  ),
                  trailing: Text(orderMoney(item['totalMinor'])),
                ),
              Text(
                orderMoney(order['totalMinor']),
                style: Theme.of(context).textTheme.headlineSmall,
              ),
              if (stage == 3 && widget.canPay)
                FilledButton(
                  onPressed: busy ? null : () => pay(order),
                  child: const Text('Take payment'),
                ),
              if (stage >= 0 && stage < 3 && widget.canAdvance)
                FilledButton(
                  onPressed: busy ? null : () => advance(order),
                  child: Text(
                    'Mark ${stepLabels(order)[stage + 1].toLowerCase()}',
                  ),
                ),
              if (stage < 3 && widget.canCancel)
                TextButton(
                  onPressed: busy ? null : () => cancel(order),
                  child: const Text('Cancel order'),
                ),
            ] else ...[
              if (!busy && rows.isEmpty)
                const Text('No open orders for this branch.'),
              for (final raw in rows)
                Builder(
                  builder: (context) {
                    final item = raw as Map<String, dynamic>;
                    final index = stages.indexOf(item['orderStage'] as String);
                    return Card(
                      child: ListTile(
                        onTap: busy
                            ? null
                            : () => openOrder(item['id'] as String),
                        title: Text(item['orderReference'].toString()),
                        subtitle: Text(
                          '${item['orderChannel']} · ${index == 3
                              ? 'Awaiting payment'
                              : index >= 0
                              ? stepLabels(item)[index]
                              : ''}',
                        ),
                        trailing: Text(orderMoney(item['totalMinor'])),
                      ),
                    );
                  },
                ),
              if (page > 1 || page * pageSize < total)
                Wrap(
                  spacing: 8,
                  children: [
                    TextButton(
                      onPressed: busy || page <= 1
                          ? null
                          : () => refresh(page - 1),
                      child: const Text('Previous'),
                    ),
                    TextButton(
                      onPressed: busy || page * pageSize >= total
                          ? null
                          : () => refresh(page + 1),
                      child: const Text('Next'),
                    ),
                  ],
                ),
            ],
          ],
        ),
      ),
    );
  }
}
