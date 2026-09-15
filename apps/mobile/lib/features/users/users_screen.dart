import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app.dart';
import '../../core/api_client.dart';
import '../../core/models.dart';

class UsersScreen extends ConsumerStatefulWidget {
  const UsersScreen({super.key, required this.membership});
  final Membership membership;
  @override
  ConsumerState<UsersScreen> createState() => _UsersScreenState();
}

class _UsersScreenState extends ConsumerState<UsersScreen> {
  List<Map<String, dynamic>> users = const [];
  List<Map<String, dynamic>> roles = const [];
  List<Map<String, dynamic>> branches = const [];
  bool loading = true;
  String? message;
  String get base => '/organizations/${widget.membership.organizationId}';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (mounted) setState(() => loading = true);
    try {
      final values = await Future.wait<Object>([
        ref.read(apiProvider).get<List<dynamic>>('$base/users'),
        ref.read(apiProvider).get<List<dynamic>>('$base/roles'),
        ref.read(apiProvider).get<List<dynamic>>('$base/branches'),
      ]);
      if (mounted) {
        setState(() {
          users = _rows(values[0]);
          roles = _rows(values[1]);
          branches = _rows(values[2]);
          message = null;
        });
      }
    } catch (error) {
      if (mounted) setState(() => message = apiErrorMessage(error));
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> _invite() async {
    final changed = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      showDragHandle: true,
      builder: (_) =>
          _InviteUserSheet(base: base, roles: roles, branches: branches),
    );
    if (changed == true) await _load();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: Text(
        tr(context, 'Users & roles', 'المستخدمون والأدوار'),
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
        widget.membership.hasAllPermissions(const [
          'user.invite',
          'role.assign',
        ])
        ? FloatingActionButton.extended(
            onPressed: _invite,
            icon: const Icon(Icons.person_add_alt_1),
            label: const Text('Add user'),
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
                colors: [Color(0xFF3D2D72), Color(0xFF7864B9)],
              ),
              borderRadius: BorderRadius.circular(22),
            ),
            child: const Row(
              children: [
                CircleAvatar(
                  backgroundColor: Color(0xFFFFCF5C),
                  child: Icon(
                    Icons.admin_panel_settings_outlined,
                    color: Color(0xFF3D2D72),
                  ),
                ),
                SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Least-privilege access',
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 20,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                      Text(
                        'Choose role, branch and account status from controlled lists.',
                        style: TextStyle(color: Color(0xFFE2DCFA)),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          if (loading)
            const Padding(
              padding: EdgeInsets.all(30),
              child: Center(child: CircularProgressIndicator()),
            ),
          if (message != null)
            Padding(padding: const EdgeInsets.all(8), child: Text(message!)),
          ...users.map(
            (user) => _UserCard(
              base: base,
              user: user,
              roles: roles,
              branches: branches,
              canUpdate: widget.membership.hasAllPermissions(const [
                'user.update',
                'role.assign',
              ]),
              canInvite: widget.membership.hasPermission('user.invite'),
              onChanged: _load,
            ),
          ),
        ],
      ),
    ),
  );
}

class _UserCard extends ConsumerStatefulWidget {
  const _UserCard({
    required this.base,
    required this.user,
    required this.roles,
    required this.branches,
    required this.canUpdate,
    required this.canInvite,
    required this.onChanged,
  });
  final String base;
  final Map<String, dynamic> user;
  final List<Map<String, dynamic>> roles;
  final List<Map<String, dynamic>> branches;
  final bool canUpdate;
  final bool canInvite;
  final Future<void> Function() onChanged;
  @override
  ConsumerState<_UserCard> createState() => _UserCardState();
}

class _UserCardState extends ConsumerState<_UserCard> {
  late String roleId;
  String? branchId;
  late String status;
  bool saving = false;
  String? error;
  @override
  void initState() {
    super.initState();
    roleId = _nested(widget.user, 'role', 'id') ?? '';
    branchId = widget.user['branchId']?.toString();
    status = widget.user['status'] == 'INVITED'
        ? 'ACTIVE'
        : widget.user['status']?.toString() ?? 'ACTIVE';
  }

  Future<void> save() async {
    setState(() {
      saving = true;
      error = null;
    });
    try {
      await ref
          .read(apiProvider)
          .patch<Object?>(
            '${widget.base}/users/${widget.user['id']}',
            data: {'roleId': roleId, 'branchId': branchId, 'status': status},
          );
      await widget.onChanged();
    } catch (value) {
      if (mounted) setState(() => error = apiErrorMessage(value));
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  Future<void> resend() async {
    try {
      await ref
          .read(apiProvider)
          .post<Object?>(
            '${widget.base}/users/${widget.user['id']}/resend-invitation',
          );
      if (mounted) {
        setState(() => error = 'A fresh activation link was emailed.');
      }
    } catch (value) {
      if (mounted) setState(() => error = apiErrorMessage(value));
    }
  }

  Future<void> sendPasswordReset() async {
    try {
      final response = await ref
          .read(apiProvider)
          .post<Map<String, dynamic>>(
            '${widget.base}/users/${widget.user['id']}/send-password-reset',
          );
      if (mounted) {
        setState(
          () => error = response['emailDelivery'] == 'SENT'
              ? 'A password-reset link was emailed.'
              : 'Reset created, but email delivery failed. Check SMTP settings.',
        );
      }
    } catch (value) {
      if (mounted) setState(() => error = apiErrorMessage(value));
    }
  }

  @override
  Widget build(BuildContext context) {
    final person = widget.user['user'] as Map?;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                CircleAvatar(
                  child: Text(
                    (person?['name']?.toString() ?? 'U')[0].toUpperCase(),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        person?['name']?.toString() ?? 'User',
                        style: const TextStyle(fontWeight: FontWeight.w900),
                      ),
                      Text(
                        '${widget.user['employeeNumber'] ?? ''} · ${person?['email'] ?? ''}',
                        style: const TextStyle(
                          fontSize: 11,
                          color: Colors.blueGrey,
                        ),
                      ),
                    ],
                  ),
                ),
                Chip(label: Text(widget.user['status']?.toString() ?? '')),
              ],
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              initialValue: roleId,
              decoration: const InputDecoration(labelText: 'Role'),
              items: widget.roles
                  .map(
                    (role) => DropdownMenuItem(
                      value: role['id'].toString(),
                      child: Text(role['name']?.toString() ?? ''),
                    ),
                  )
                  .toList(),
              onChanged: widget.canUpdate
                  ? (value) => setState(() => roleId = value!)
                  : null,
            ),
            const SizedBox(height: 8),
            DropdownButtonFormField<String?>(
              initialValue: branchId,
              decoration: const InputDecoration(labelText: 'Branch'),
              items: [
                const DropdownMenuItem<String?>(
                  value: null,
                  child: Text('All branches'),
                ),
                ...widget.branches.map(
                  (branch) => DropdownMenuItem<String?>(
                    value: branch['id'].toString(),
                    child: Text(branch['name']?.toString() ?? ''),
                  ),
                ),
              ],
              onChanged: widget.canUpdate
                  ? (value) => setState(() => branchId = value)
                  : null,
            ),
            const SizedBox(height: 8),
            DropdownButtonFormField<String>(
              initialValue: status,
              decoration: const InputDecoration(labelText: 'Access status'),
              items: const [
                DropdownMenuItem(value: 'ACTIVE', child: Text('Active')),
                DropdownMenuItem(value: 'SUSPENDED', child: Text('Inactive')),
              ],
              onChanged: widget.canUpdate
                  ? (value) => setState(() => status = value!)
                  : null,
            ),
            if (error != null)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text(error!),
              ),
            const SizedBox(height: 10),
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                if (widget.user['status'] == 'INVITED' && widget.canInvite)
                  TextButton.icon(
                    onPressed: resend,
                    icon: const Icon(Icons.forward_to_inbox_outlined),
                    label: const Text('Resend invite'),
                  ),
                if (widget.user['status'] == 'ACTIVE' && widget.canUpdate)
                  TextButton.icon(
                    onPressed: sendPasswordReset,
                    icon: const Icon(Icons.lock_reset_outlined),
                    label: const Text('Reset password'),
                  ),
                if (widget.canUpdate)
                  FilledButton.icon(
                    onPressed: saving ? null : save,
                    icon: const Icon(Icons.save_outlined),
                    label: Text(saving ? 'Saving…' : 'Save access'),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _InviteUserSheet extends ConsumerStatefulWidget {
  const _InviteUserSheet({
    required this.base,
    required this.roles,
    required this.branches,
  });
  final String base;
  final List<Map<String, dynamic>> roles;
  final List<Map<String, dynamic>> branches;
  @override
  ConsumerState<_InviteUserSheet> createState() => _InviteUserSheetState();
}

class _InviteUserSheetState extends ConsumerState<_InviteUserSheet> {
  final name = TextEditingController();
  final email = TextEditingController();
  String? roleId;
  String? branchId;
  bool busy = false;
  String? error;
  @override
  void initState() {
    super.initState();
    roleId = widget.roles.firstOrNull?['id']?.toString();
  }

  @override
  void dispose() {
    name.dispose();
    email.dispose();
    super.dispose();
  }

  Future<void> save() async {
    if (name.text.trim().length < 2 ||
        !email.text.contains('@') ||
        roleId == null) {
      setState(() => error = 'Enter a name, email and role.');
      return;
    }
    setState(() => busy = true);
    try {
      await ref
          .read(apiProvider)
          .post<Object?>(
            '${widget.base}/users',
            data: {
              'name': name.text.trim(),
              'email': email.text.trim(),
              'roleId': roleId,
              'branchId': branchId,
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
            'Add a team member',
            style: TextStyle(fontSize: 23, fontWeight: FontWeight.w900),
          ),
          const Text(
            'They receive a one-time activation email and create their private password.',
            style: TextStyle(color: Colors.blueGrey),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: name,
            decoration: const InputDecoration(labelText: 'Full name'),
          ),
          const SizedBox(height: 9),
          TextField(
            controller: email,
            keyboardType: TextInputType.emailAddress,
            decoration: const InputDecoration(labelText: 'Work email'),
          ),
          const SizedBox(height: 9),
          DropdownButtonFormField<String>(
            initialValue: roleId,
            decoration: const InputDecoration(labelText: 'Role'),
            items: widget.roles
                .map(
                  (role) => DropdownMenuItem(
                    value: role['id'].toString(),
                    child: Text(role['name']?.toString() ?? ''),
                  ),
                )
                .toList(),
            onChanged: (value) => setState(() => roleId = value),
          ),
          const SizedBox(height: 9),
          DropdownButtonFormField<String?>(
            initialValue: branchId,
            decoration: const InputDecoration(labelText: 'Branch'),
            items: [
              const DropdownMenuItem<String?>(
                value: null,
                child: Text('All branches'),
              ),
              ...widget.branches.map(
                (branch) => DropdownMenuItem<String?>(
                  value: branch['id'].toString(),
                  child: Text(branch['name']?.toString() ?? ''),
                ),
              ),
            ],
            onChanged: (value) => setState(() => branchId = value),
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
            label: Text(busy ? 'Creating…' : 'Create & email activation'),
          ),
        ],
      ),
    ),
  );
}

List<Map<String, dynamic>> _rows(dynamic value) =>
    (value as List<dynamic>? ?? const [])
        .whereType<Map>()
        .map((row) => Map<String, dynamic>.from(row))
        .toList();
String? _nested(Map<String, dynamic> row, String parent, String key) =>
    row[parent] is Map ? (row[parent] as Map)[key]?.toString() : null;
