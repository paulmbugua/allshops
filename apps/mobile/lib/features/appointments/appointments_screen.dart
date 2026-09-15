import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:uuid/uuid.dart';

import '../../app.dart';
import '../../core/api_client.dart';
import '../../core/models.dart';

class AppointmentsScreen extends ConsumerStatefulWidget {
  const AppointmentsScreen({super.key, required this.membership});
  final Membership membership;
  @override
  ConsumerState<AppointmentsScreen> createState() => _AppointmentsScreenState();
}

class _AppointmentsScreenState extends ConsumerState<AppointmentsScreen> {
  List<Map<String, dynamic>> rows = const [];
  String status = '';
  String? error;
  bool loading = true;
  String get base => '/organizations/${widget.membership.organizationId}';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final response = await ref
          .read(apiProvider)
          .get<Map<String, dynamic>>(
            '$base/appointments',
            query: {'pageSize': 100, if (status.isNotEmpty) 'status': status},
          );
      if (mounted) setState(() => rows = _items(response));
    } catch (caught) {
      if (mounted) setState(() => error = apiErrorMessage(caught));
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: const Text(
        'Appointments',
        style: TextStyle(fontWeight: FontWeight.w900),
      ),
      actions: [
        IconButton(
          onPressed: loading ? null : _load,
          icon: const Icon(Icons.refresh_rounded),
        ),
      ],
    ),
    floatingActionButton: widget.membership.hasPermission('appointment.create')
        ? FloatingActionButton.extended(
            onPressed: _book,
            icon: const Icon(Icons.add_rounded),
            label: const Text('Book'),
          )
        : null,
    body: RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 100),
        children: [
          Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [Color(0xFF3D315F), Color(0xFF8B5C91)],
              ),
              borderRadius: BorderRadius.circular(22),
            ),
            child: const Row(
              children: [
                CircleAvatar(
                  backgroundColor: Color(0xFFFFD8E7),
                  child: Icon(
                    Icons.calendar_month_rounded,
                    color: Color(0xFF6C3E72),
                  ),
                ),
                SizedBox(width: 13),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Service calendar',
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 21,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                      Text(
                        'Book, reschedule, progress and checkout appointments.',
                        style: TextStyle(
                          color: Color(0xFFE1CCE5),
                          fontSize: 12,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            initialValue: status,
            decoration: const InputDecoration(
              labelText: 'Appointment status',
              prefixIcon: Icon(Icons.filter_list_rounded),
            ),
            items: const [
              DropdownMenuItem(value: '', child: Text('All statuses')),
              DropdownMenuItem(value: 'BOOKED', child: Text('Booked')),
              DropdownMenuItem(value: 'CONFIRMED', child: Text('Confirmed')),
              DropdownMenuItem(
                value: 'IN_PROGRESS',
                child: Text('In progress'),
              ),
              DropdownMenuItem(value: 'COMPLETED', child: Text('Completed')),
              DropdownMenuItem(value: 'CANCELLED', child: Text('Cancelled')),
              DropdownMenuItem(value: 'NO_SHOW', child: Text('No show')),
            ],
            onChanged: (value) {
              status = value ?? '';
              _load();
            },
          ),
          if (loading)
            const Padding(
              padding: EdgeInsets.all(28),
              child: Center(child: CircularProgressIndicator()),
            ),
          if (error != null) _Notice(error!, error: true),
          if (!loading && rows.isEmpty)
            const _Empty(
              icon: Icons.event_busy_outlined,
              text: 'No appointments match this filter.',
            ),
          ...rows.map(
            (row) => _AppointmentCard(
              row: row,
              onTap: () => _open(row['id'].toString()),
            ),
          ),
        ],
      ),
    ),
  );

  Future<void> _book() async {
    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _BookingSheet(base: base),
    );
    if (saved == true) await _load();
  }

  Future<void> _open(String id) async {
    try {
      final appointment = await ref
          .read(apiProvider)
          .get<Map<String, dynamic>>('$base/appointments/$id');
      if (!mounted) return;
      final changed = await showModalBottomSheet<bool>(
        context: context,
        isScrollControlled: true,
        showDragHandle: true,
        builder: (_) => _AppointmentDetail(
          base: base,
          membership: widget.membership,
          appointment: appointment,
        ),
      );
      if (changed == true) await _load();
    } catch (caught) {
      if (mounted) setState(() => error = apiErrorMessage(caught));
    }
  }
}

class _AppointmentCard extends StatelessWidget {
  const _AppointmentCard({required this.row, required this.onTap});
  final Map<String, dynamic> row;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    final services = (row['services'] as List<dynamic>? ?? const [])
        .whereType<Map>()
        .map((item) => item['serviceNameSnapshot'])
        .whereType<String>()
        .join(', ');
    final staff = row['primaryStaff'] is Map
        ? row['primaryStaff']['displayName']
        : null;
    return Card(
      margin: const EdgeInsets.only(top: 10),
      child: InkWell(
        borderRadius: BorderRadius.circular(20),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(15),
          child: Row(
            children: [
              _DateBadge(row['startAt']?.toString()),
              const SizedBox(width: 13),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      row['customerNameSnapshot']?.toString() ??
                          'Walk-in customer',
                      style: const TextStyle(
                        fontWeight: FontWeight.w900,
                        fontSize: 16,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      services.isEmpty ? 'Service appointment' : services,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(color: Colors.blueGrey),
                    ),
                    Text(
                      staff?.toString() ?? '',
                      style: const TextStyle(
                        fontSize: 11,
                        color: Colors.blueGrey,
                      ),
                    ),
                  ],
                ),
              ),
              _StatusChip(row['status']?.toString() ?? ''),
            ],
          ),
        ),
      ),
    );
  }
}

class _BookingSheet extends ConsumerStatefulWidget {
  const _BookingSheet({required this.base});
  final String base;
  @override
  ConsumerState<_BookingSheet> createState() => _BookingSheetState();
}

class _BookingSheetState extends ConsumerState<_BookingSheet> {
  final form = GlobalKey<FormState>();
  final customer = TextEditingController();
  final phone = TextEditingController();
  final notes = TextEditingController();
  List<Map<String, dynamic>> branches = const [],
      services = const [],
      staff = const [];
  String? branchId, serviceId, staffId;
  DateTime start = DateTime.now().add(const Duration(hours: 1));
  bool loading = true, busy = false;
  String? error;

  @override
  void initState() {
    super.initState();
    _options();
  }

  @override
  void dispose() {
    customer.dispose();
    phone.dispose();
    notes.dispose();
    super.dispose();
  }

  Future<void> _options() async {
    try {
      final api = ref.read(apiProvider);
      final values = await Future.wait([
        api.get<List<dynamic>>('${widget.base}/branches'),
        api.get<Map<String, dynamic>>(
          '${widget.base}/products',
          query: {'pageSize': 100, 'type': 'SERVICE', 'isActive': true},
        ),
      ]);
      branches = (values[0] as List)
          .whereType<Map>()
          .map((e) => Map<String, dynamic>.from(e))
          .toList();
      services = _items(values[1] as Map<String, dynamic>);
      branchId = branches.length == 1 ? branches.first['id']?.toString() : null;
    } catch (caught) {
      error = apiErrorMessage(caught);
    }
    if (mounted) setState(() => loading = false);
  }

  Future<void> _loadStaff() async {
    staff = const [];
    staffId = null;
    if (branchId == null || serviceId == null) {
      setState(() {});
      return;
    }
    setState(() => loading = true);
    try {
      final response = await ref
          .read(apiProvider)
          .get<Map<String, dynamic>>(
            '${widget.base}/staff',
            query: {
              'pageSize': 100,
              'isActive': true,
              'branchId': branchId,
              'serviceProductId': serviceId,
            },
          );
      staff = _items(response);
    } catch (caught) {
      error = apiErrorMessage(caught);
    }
    if (mounted) setState(() => loading = false);
  }

  @override
  Widget build(BuildContext context) => SafeArea(
    child: Padding(
      padding: EdgeInsets.fromLTRB(
        20,
        0,
        20,
        MediaQuery.viewInsetsOf(context).bottom + 20,
      ),
      child: SingleChildScrollView(
        child: Form(
          key: form,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text(
                'Book appointment',
                style: TextStyle(fontSize: 24, fontWeight: FontWeight.w900),
              ),
              const SizedBox(height: 16),
              _dropdown('Branch', branchId, branches, (value) {
                branchId = value;
                _loadStaff();
              }),
              TextFormField(
                controller: customer,
                decoration: const InputDecoration(labelText: 'Customer name'),
                validator: (value) =>
                    (value == null || value.trim().isEmpty) &&
                        phone.text.trim().isEmpty
                    ? 'Enter a customer name or phone'
                    : null,
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: phone,
                keyboardType: TextInputType.phone,
                decoration: const InputDecoration(labelText: 'Customer phone'),
              ),
              const SizedBox(height: 12),
              _dropdown('Service', serviceId, services, (value) {
                serviceId = value;
                _loadStaff();
              }),
              _dropdown(
                'Staff member',
                staffId,
                staff,
                (value) => setState(() => staffId = value),
                labelKeys: const ['displayName', 'employeeNumber'],
              ),
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.schedule_rounded),
                title: const Text('Starts'),
                subtitle: Text(
                  DateFormat('EEE, d MMM y · h:mm a').format(start),
                ),
                trailing: const Icon(Icons.edit_calendar_outlined),
                onTap: _pickDateTime,
              ),
              TextFormField(
                controller: notes,
                maxLines: 2,
                decoration: const InputDecoration(
                  labelText: 'Notes (optional)',
                ),
              ),
              if (loading)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 10),
                  child: LinearProgressIndicator(),
                ),
              if (error != null) _Notice(error!, error: true),
              const SizedBox(height: 12),
              FilledButton.icon(
                onPressed: busy ? null : _save,
                icon: const Icon(Icons.event_available_rounded),
                label: const Text('Book appointment'),
              ),
            ],
          ),
        ),
      ),
    ),
  );

  Widget _dropdown(
    String label,
    String? value,
    List<Map<String, dynamic>> options,
    ValueChanged<String?> changed, {
    List<String> labelKeys = const ['name', 'code'],
  }) => Padding(
    padding: const EdgeInsets.only(bottom: 12),
    child: DropdownButtonFormField<String>(
      key: ValueKey('$label:${options.length}:$value'),
      initialValue: options.any((e) => e['id']?.toString() == value)
          ? value
          : null,
      isExpanded: true,
      decoration: InputDecoration(labelText: label),
      items: options
          .map(
            (row) => DropdownMenuItem(
              value: row['id']?.toString(),
              child: Text(
                labelKeys
                    .map((key) => row[key]?.toString())
                    .where((v) => v != null && v.isNotEmpty)
                    .join(' · '),
                overflow: TextOverflow.ellipsis,
              ),
            ),
          )
          .toList(),
      validator: (v) => v == null || v.isEmpty ? '$label is required' : null,
      onChanged: changed,
    ),
  );

  Future<void> _pickDateTime() async {
    final date = await showDatePicker(
      context: context,
      initialDate: start,
      firstDate: DateTime.now().subtract(const Duration(days: 1)),
      lastDate: DateTime.now().add(const Duration(days: 730)),
    );
    if (date == null || !mounted) return;
    final time = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(start),
    );
    if (time != null) {
      setState(
        () => start = DateTime(
          date.year,
          date.month,
          date.day,
          time.hour,
          time.minute,
        ),
      );
    }
  }

  Future<void> _save() async {
    if (!form.currentState!.validate()) return;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await ref
          .read(apiProvider)
          .post<dynamic>(
            '${widget.base}/appointments',
            data: {
              'branchId': branchId,
              'customerName': customer.text.trim().isEmpty
                  ? null
                  : customer.text.trim(),
              'customerPhone': phone.text.trim().isEmpty
                  ? null
                  : phone.text.trim(),
              'primaryStaffProfileId': staffId,
              'startAt': start.toUtc().toIso8601String(),
              'notes': notes.text.trim().isEmpty ? null : notes.text.trim(),
              'services': [
                {'serviceProductId': serviceId, 'staffProfileId': staffId},
              ],
            },
          );
      if (mounted) Navigator.pop(context, true);
    } catch (caught) {
      if (mounted) {
        setState(() {
          busy = false;
          error = apiErrorMessage(caught);
        });
      }
    }
  }
}

class _AppointmentDetail extends ConsumerStatefulWidget {
  const _AppointmentDetail({
    required this.base,
    required this.membership,
    required this.appointment,
  });
  final String base;
  final Membership membership;
  final Map<String, dynamic> appointment;
  @override
  ConsumerState<_AppointmentDetail> createState() => _AppointmentDetailState();
}

class _AppointmentDetailState extends ConsumerState<_AppointmentDetail> {
  late Map<String, dynamic> row = widget.appointment;
  bool busy = false;
  String? message;
  String get path => '${widget.base}/appointments/${row['id']}';
  Future<void> _refresh() async {
    row = await ref.read(apiProvider).get<Map<String, dynamic>>(path);
    if (mounted) setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final status = row['status']?.toString() ?? '';
    final services = (row['services'] as List<dynamic>? ?? const [])
        .whereType<Map>()
        .toList();
    final total = services.fold<int>(
      0,
      (sum, item) => sum + ((item['priceMinorSnapshot'] as num?)?.toInt() ?? 0),
    );
    return SafeArea(
      child: DraggableScrollableSheet(
        expand: false,
        initialChildSize: .82,
        maxChildSize: .96,
        builder: (_, controller) => ListView(
          controller: controller,
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 28),
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    row['customerNameSnapshot']?.toString() ??
                        'Walk-in customer',
                    style: const TextStyle(
                      fontSize: 23,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ),
                _StatusChip(status),
              ],
            ),
            const SizedBox(height: 6),
            Text(
              _dateTime(row['startAt']?.toString()),
              style: const TextStyle(color: Colors.blueGrey),
            ),
            const Divider(height: 28),
            ...services.map(
              (service) => ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const CircleAvatar(child: Icon(Icons.spa_outlined)),
                title: Text(
                  service['serviceNameSnapshot']?.toString() ?? 'Service',
                ),
                subtitle: Text(
                  '${service['staffProfile'] is Map ? service['staffProfile']['displayName'] : ''} · ${service['durationMinutesSnapshot']} min',
                ),
                trailing: Text(
                  _money(service['priceMinorSnapshot']),
                  style: const TextStyle(fontWeight: FontWeight.w900),
                ),
              ),
            ),
            ListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text(
                'Appointment total',
                style: TextStyle(fontWeight: FontWeight.w900),
              ),
              trailing: Text(
                _money(total),
                style: const TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ),
            if (message != null) _Notice(message!, error: false),
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                if (['BOOKED', 'CONFIRMED'].contains(status) &&
                    widget.membership.hasPermission('appointment.update'))
                  OutlinedButton.icon(
                    onPressed: busy ? null : _reschedule,
                    icon: const Icon(Icons.edit_calendar_outlined),
                    label: const Text('Reschedule'),
                  ),
                if (status == 'BOOKED' &&
                    widget.membership.hasPermission('appointment.confirm'))
                  FilledButton.icon(
                    onPressed: busy ? null : () => _transition('confirm'),
                    icon: const Icon(Icons.check_rounded),
                    label: const Text('Confirm'),
                  ),
                if (status == 'CONFIRMED' &&
                    widget.membership.hasPermission('appointment.start'))
                  FilledButton.icon(
                    onPressed: busy ? null : () => _transition('start'),
                    icon: const Icon(Icons.play_arrow_rounded),
                    label: const Text('Start'),
                  ),
                if (status == 'IN_PROGRESS' &&
                    widget.membership.hasPermission('appointment.complete'))
                  FilledButton.icon(
                    onPressed: busy ? null : () => _transition('complete'),
                    icon: const Icon(Icons.task_alt_rounded),
                    label: const Text('Complete'),
                  ),
                if (['BOOKED', 'CONFIRMED'].contains(status) &&
                    widget.membership.hasPermission('appointment.no_show'))
                  OutlinedButton.icon(
                    onPressed: busy ? null : () => _transition('no-show'),
                    icon: const Icon(Icons.person_off_outlined),
                    label: const Text('No show'),
                  ),
                if (['BOOKED', 'CONFIRMED'].contains(status) &&
                    widget.membership.hasPermission('appointment.cancel'))
                  OutlinedButton.icon(
                    onPressed: busy
                        ? null
                        : () => _transition(
                            'cancel',
                            data: {
                              'cancellationReason': 'Cancelled from mobile',
                            },
                          ),
                    icon: const Icon(Icons.cancel_outlined),
                    label: const Text('Cancel'),
                  ),
                if (status == 'COMPLETED' &&
                    row['sale'] == null &&
                    widget.membership.hasAllPermissions(const [
                      'appointment.checkout',
                      'sale.create',
                      'payment.record',
                    ]))
                  FilledButton.icon(
                    onPressed: busy ? null : () => _checkout(total),
                    icon: const Icon(Icons.point_of_sale_rounded),
                    label: const Text('Checkout'),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _transition(String action, {Map<String, dynamic>? data}) async {
    setState(() => busy = true);
    try {
      await ref.read(apiProvider).post<dynamic>('$path/$action', data: data);
      await _refresh();
      message = 'Appointment updated.';
    } catch (caught) {
      message = apiErrorMessage(caught);
    }
    if (mounted) setState(() => busy = false);
  }

  Future<void> _reschedule() async {
    final current =
        DateTime.tryParse(row['startAt']?.toString() ?? '')?.toLocal() ??
        DateTime.now();
    final date = await showDatePicker(
      context: context,
      initialDate: current,
      firstDate: DateTime.now().subtract(const Duration(days: 1)),
      lastDate: DateTime.now().add(const Duration(days: 730)),
    );
    if (date == null || !mounted) return;
    final time = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(current),
    );
    if (time == null) return;
    setState(() => busy = true);
    try {
      final next = DateTime(
        date.year,
        date.month,
        date.day,
        time.hour,
        time.minute,
      );
      await ref
          .read(apiProvider)
          .patch<dynamic>(
            path,
            data: {'startAt': next.toUtc().toIso8601String()},
          );
      await _refresh();
      message = 'Appointment rescheduled.';
    } catch (caught) {
      message = apiErrorMessage(caught);
    }
    if (mounted) setState(() => busy = false);
  }

  Future<void> _checkout(int total) async {
    final payment = await showModalBottomSheet<Map<String, dynamic>>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _AppointmentPayment(total: total),
    );
    if (payment == null) return;
    setState(() => busy = true);
    try {
      final sale = await ref
          .read(apiProvider)
          .post<Map<String, dynamic>>(
            '$path/checkout',
            headers: {'Idempotency-Key': const Uuid().v4()},
            data: {
              'payments': [payment],
              'additionalItems': [],
            },
          );
      await _refresh();
      message =
          'Paid · ${sale['invoiceNumber'] ?? 'receipt ready'}${(sale['changeMinor'] as num? ?? 0) > 0 ? ' · Change ${_money(sale['changeMinor'])}' : ''}';
    } catch (caught) {
      message = apiErrorMessage(caught);
    }
    if (mounted) setState(() => busy = false);
  }
}

class _AppointmentPayment extends StatefulWidget {
  const _AppointmentPayment({required this.total});
  final int total;
  @override
  State<_AppointmentPayment> createState() => _AppointmentPaymentState();
}

class _AppointmentPaymentState extends State<_AppointmentPayment> {
  String method = 'CASH';
  final amount = TextEditingController();
  final reference = TextEditingController();
  @override
  void initState() {
    super.initState();
    amount.text = (widget.total / 100).toStringAsFixed(2);
  }

  @override
  void dispose() {
    amount.dispose();
    reference.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => SafeArea(
    child: Padding(
      padding: EdgeInsets.fromLTRB(
        20,
        0,
        20,
        MediaQuery.viewInsetsOf(context).bottom + 20,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'Collect ${_money(widget.total)}',
            style: const TextStyle(fontSize: 23, fontWeight: FontWeight.w900),
          ),
          const SizedBox(height: 14),
          SegmentedButton<String>(
            segments: const [
              ButtonSegment(
                value: 'CASH',
                label: Text('Cash'),
                icon: Icon(Icons.payments_outlined),
              ),
              ButtonSegment(
                value: 'CARD',
                label: Text('Local card'),
                icon: Icon(Icons.credit_card_outlined),
              ),
            ],
            selected: {method},
            onSelectionChanged: (value) => setState(() => method = value.first),
          ),
          const SizedBox(height: 12),
          if (method == 'CASH')
            TextField(
              controller: amount,
              keyboardType: const TextInputType.numberWithOptions(
                decimal: true,
              ),
              decoration: const InputDecoration(
                labelText: 'Cash received (QAR)',
              ),
            ),
          if (method == 'CARD')
            TextField(
              controller: reference,
              decoration: const InputDecoration(
                labelText: 'Terminal reference',
              ),
            ),
          const SizedBox(height: 14),
          FilledButton(
            onPressed: () {
              final tender = method == 'CASH'
                  ? ((double.tryParse(amount.text) ?? 0) * 100).round()
                  : widget.total;
              if (tender < widget.total ||
                  (method == 'CARD' && reference.text.trim().isEmpty)) {
                return;
              }
              Navigator.pop(context, {
                'method': method,
                'amountMinor': tender,
                if (method == 'CARD') 'reference': reference.text.trim(),
              });
            },
            child: const Text('Confirm payment'),
          ),
        ],
      ),
    ),
  );
}

class _DateBadge extends StatelessWidget {
  const _DateBadge(this.value);
  final String? value;
  @override
  Widget build(BuildContext context) {
    final date = DateTime.tryParse(value ?? '')?.toLocal();
    return Container(
      width: 54,
      height: 58,
      decoration: BoxDecoration(
        color: const Color(0xFFFFE5EE),
        borderRadius: BorderRadius.circular(15),
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(
            date == null ? '—' : DateFormat('MMM').format(date).toUpperCase(),
            style: const TextStyle(
              fontSize: 10,
              color: Color(0xFFA34F71),
              fontWeight: FontWeight.w900,
            ),
          ),
          Text(
            date?.day.toString() ?? '',
            style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w900),
          ),
        ],
      ),
    );
  }
}

class _StatusChip extends StatelessWidget {
  const _StatusChip(this.status);
  final String status;
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
    decoration: BoxDecoration(
      color: _statusColor(status).withValues(alpha: .13),
      borderRadius: BorderRadius.circular(20),
    ),
    child: Text(
      status.replaceAll('_', ' '),
      style: TextStyle(
        fontSize: 9,
        fontWeight: FontWeight.w900,
        color: _statusColor(status),
      ),
    ),
  );
}

class _Notice extends StatelessWidget {
  const _Notice(this.text, {required this.error});
  final String text;
  final bool error;
  @override
  Widget build(BuildContext context) => Container(
    margin: const EdgeInsets.only(top: 10),
    padding: const EdgeInsets.all(12),
    decoration: BoxDecoration(
      color: error ? const Color(0xFFFFE5E1) : const Color(0xFFE4F7ED),
      borderRadius: BorderRadius.circular(12),
    ),
    child: Text(text),
  );
}

class _Empty extends StatelessWidget {
  const _Empty({required this.icon, required this.text});
  final IconData icon;
  final String text;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.all(35),
    child: Column(
      children: [
        Icon(icon, size: 46, color: Colors.blueGrey.shade200),
        const SizedBox(height: 10),
        Text(text, style: const TextStyle(color: Colors.blueGrey)),
      ],
    ),
  );
}

List<Map<String, dynamic>> _items(Map<String, dynamic> response) =>
    (response['items'] as List<dynamic>? ?? const [])
        .whereType<Map>()
        .map((row) => Map<String, dynamic>.from(row))
        .toList();
String _dateTime(String? value) {
  final date = DateTime.tryParse(value ?? '')?.toLocal();
  return date == null
      ? 'Date unavailable'
      : DateFormat('EEE, d MMM y · h:mm a').format(date);
}

String _money(dynamic minor) =>
    'QAR ${(((minor as num?)?.toInt() ?? 0) / 100).toStringAsFixed(2)}';
Color _statusColor(String status) => switch (status) {
  'COMPLETED' => const Color(0xFF23845F),
  'IN_PROGRESS' => const Color(0xFF376FC1),
  'CANCELLED' || 'NO_SHOW' => const Color(0xFFC44E4E),
  _ => const Color(0xFF9A6B17),
};
