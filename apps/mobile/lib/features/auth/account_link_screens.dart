import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app.dart';
import '../../core/api_client.dart';
import '../../core/models.dart';
import '../home/home_screen.dart';
import 'login_screen.dart';

class StaffActivationEntryScreen extends StatefulWidget {
  const StaffActivationEntryScreen({super.key});

  @override
  State<StaffActivationEntryScreen> createState() =>
      _StaffActivationEntryScreenState();
}

class _StaffActivationEntryScreenState
    extends State<StaffActivationEntryScreen> {
  final activation = TextEditingController();
  String? error;

  @override
  void dispose() {
    activation.dispose();
    super.dispose();
  }

  void continueActivation() {
    final value = activation.text.trim();
    final parsed = Uri.tryParse(value);
    final token = parsed?.queryParameters['token'] ?? value;
    if (token.length < 32) {
      setState(
        () => error =
            'Paste the complete activation link or token from your email.',
      );
      return;
    }
    Navigator.of(context).pushReplacement(
      MaterialPageRoute(builder: (_) => StaffActivationScreen(token: token)),
    );
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Activate staff account')),
    body: Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 440),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Icon(Icons.admin_panel_settings_outlined, size: 56),
              const SizedBox(height: 18),
              const Text(
                'Assigned a role in AllShops?',
                style: TextStyle(fontSize: 28, fontWeight: FontWeight.w900),
              ),
              const SizedBox(height: 8),
              const Text(
                'Tap the activation button in the email sent by your owner or administrator. You may also paste that complete link below.',
              ),
              const SizedBox(height: 20),
              TextField(
                controller: activation,
                minLines: 2,
                maxLines: 4,
                decoration: const InputDecoration(
                  labelText: 'Activation link or token',
                  prefixIcon: Icon(Icons.link_rounded),
                ),
              ),
              if (error != null) ...[
                const SizedBox(height: 12),
                Text(error!, style: const TextStyle(color: Colors.red)),
              ],
              const SizedBox(height: 20),
              FilledButton.icon(
                onPressed: continueActivation,
                icon: const Icon(Icons.verified_user_outlined),
                label: const Text('Activate assigned access'),
              ),
            ],
          ),
        ),
      ),
    ),
  );
}

class StaffActivationScreen extends ConsumerStatefulWidget {
  const StaffActivationScreen({required this.token, super.key});
  final String token;

  @override
  ConsumerState<StaffActivationScreen> createState() =>
      _StaffActivationScreenState();
}

class _StaffActivationScreenState extends ConsumerState<StaffActivationScreen> {
  bool busy = true;
  String message = 'Activating your assigned access…';
  String? email;

  @override
  void initState() {
    super.initState();
    _activate();
  }

  Future<void> _activate() async {
    try {
      final result = await ref
          .read(apiProvider)
          .post<Map<String, dynamic>>(
            '/auth/activate-invitation',
            data: {'token': widget.token},
          );
      if (!mounted) return;
      setState(() {
        email = result['email']?.toString();
        message =
            'Your account is active. Sign in with the temporary password from your email.';
        busy = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        message = apiErrorMessage(error);
        busy = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) => _LinkScaffold(
    icon: busy ? Icons.hourglass_top_rounded : Icons.verified_user_rounded,
    title: busy ? 'Activating account' : 'Team access activation',
    message: message,
    busy: busy,
    action: busy
        ? null
        : () => Navigator.of(context).pushReplacement(
            MaterialPageRoute(builder: (_) => LoginScreen(initialEmail: email)),
          ),
    actionLabel: 'Continue to sign in',
  );
}

class AccountActivationScreen extends ConsumerStatefulWidget {
  const AccountActivationScreen({required this.token, super.key});
  final String token;

  @override
  ConsumerState<AccountActivationScreen> createState() =>
      _AccountActivationScreenState();
}

class _AccountActivationScreenState
    extends ConsumerState<AccountActivationScreen> {
  bool busy = true;
  String message = 'Verifying your email address…';

  @override
  void initState() {
    super.initState();
    _activate();
  }

  Future<void> _activate() async {
    try {
      await ref
          .read(apiProvider)
          .post<Map<String, dynamic>>(
            '/auth/activate-account',
            data: {'token': widget.token},
          );
      if (mounted) {
        setState(() {
          busy = false;
          message =
              'Email verified. You can now sign in and set up your business.';
        });
      }
    } catch (error) {
      if (mounted) {
        setState(() {
          busy = false;
          message = apiErrorMessage(error);
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) => _LinkScaffold(
    icon: Icons.mark_email_read_rounded,
    title: busy ? 'Verifying email' : 'Account activation',
    message: message,
    busy: busy,
    action: busy
        ? null
        : () => Navigator.of(context).pushReplacement(
            MaterialPageRoute(builder: (_) => const LoginScreen()),
          ),
    actionLabel: 'Continue to sign in',
  );
}

class MobileResetPasswordScreen extends ConsumerStatefulWidget {
  const MobileResetPasswordScreen({required this.token, super.key});
  final String token;

  @override
  ConsumerState<MobileResetPasswordScreen> createState() =>
      _MobileResetPasswordScreenState();
}

class _MobileResetPasswordScreenState
    extends ConsumerState<MobileResetPasswordScreen> {
  final password = TextEditingController();
  final confirm = TextEditingController();
  bool busy = false;
  String? error;

  @override
  void dispose() {
    password.dispose();
    confirm.dispose();
    super.dispose();
  }

  Future<void> submit() async {
    if (password.text.length < 8 || password.text != confirm.text) {
      setState(
        () =>
            error = 'Use at least 8 characters and make both passwords match.',
      );
      return;
    }
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await ref
          .read(apiProvider)
          .post<Object?>(
            '/auth/reset-password',
            data: {'token': widget.token, 'password': password.text},
          );
      if (!mounted) return;
      Navigator.of(
        context,
      ).pushReplacement(MaterialPageRoute(builder: (_) => const LoginScreen()));
    } catch (value) {
      if (mounted) setState(() => error = apiErrorMessage(value));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Reset password')),
    body: Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 440),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Icon(Icons.lock_reset_rounded, size: 56),
              const SizedBox(height: 18),
              const Text(
                'Choose a new password',
                style: TextStyle(fontSize: 28, fontWeight: FontWeight.w900),
              ),
              const SizedBox(height: 20),
              TextField(
                controller: password,
                obscureText: true,
                decoration: const InputDecoration(labelText: 'New password'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: confirm,
                obscureText: true,
                decoration: const InputDecoration(
                  labelText: 'Confirm password',
                ),
              ),
              if (error != null) ...[
                const SizedBox(height: 12),
                Text(error!, style: const TextStyle(color: Colors.red)),
              ],
              const SizedBox(height: 20),
              FilledButton(
                onPressed: busy ? null : submit,
                child: Text(busy ? 'Updating…' : 'Save new password'),
              ),
            ],
          ),
        ),
      ),
    ),
  );
}

class TemporaryPasswordScreen extends ConsumerStatefulWidget {
  const TemporaryPasswordScreen({required this.user, super.key});
  final CurrentUser user;

  @override
  ConsumerState<TemporaryPasswordScreen> createState() =>
      _TemporaryPasswordScreenState();
}

class _TemporaryPasswordScreenState
    extends ConsumerState<TemporaryPasswordScreen> {
  final current = TextEditingController();
  final next = TextEditingController();
  final confirm = TextEditingController();
  bool busy = false;
  String? error;

  @override
  void dispose() {
    current.dispose();
    next.dispose();
    confirm.dispose();
    super.dispose();
  }

  Future<void> submit() async {
    if (next.text.length < 8 || next.text != confirm.text) {
      setState(
        () => error =
            'Use at least 8 characters and make both new passwords match.',
      );
      return;
    }
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await ref
          .read(apiProvider)
          .post<Object?>(
            '/auth/change-temporary-password',
            data: {'currentPassword': current.text, 'newPassword': next.text},
          );
      final refreshed = CurrentUser.fromJson(
        await ref.read(apiProvider).currentUser(),
      );
      if (!mounted) return;
      Navigator.of(context).pushAndRemoveUntil(
        MaterialPageRoute(
          builder: (_) => HomeScreen(
            user: refreshed,
            membership: refreshed.memberships.first,
          ),
        ),
        (_) => false,
      );
    } catch (value) {
      if (mounted) setState(() => error = apiErrorMessage(value));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Secure your account')),
    body: Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 440),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Icon(Icons.password_rounded, size: 56),
              const SizedBox(height: 18),
              const Text(
                'Create your private password',
                style: TextStyle(fontSize: 28, fontWeight: FontWeight.w900),
              ),
              const SizedBox(height: 8),
              const Text(
                'For security, replace the temporary password before opening your workspace.',
              ),
              const SizedBox(height: 20),
              TextField(
                controller: current,
                obscureText: true,
                decoration: const InputDecoration(
                  labelText: 'Temporary password',
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: next,
                obscureText: true,
                decoration: const InputDecoration(labelText: 'New password'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: confirm,
                obscureText: true,
                decoration: const InputDecoration(
                  labelText: 'Confirm new password',
                ),
              ),
              if (error != null) ...[
                const SizedBox(height: 12),
                Text(error!, style: const TextStyle(color: Colors.red)),
              ],
              const SizedBox(height: 20),
              FilledButton(
                onPressed: busy ? null : submit,
                child: Text(busy ? 'Securing…' : 'Save and open workspace'),
              ),
            ],
          ),
        ),
      ),
    ),
  );
}

class _LinkScaffold extends StatelessWidget {
  const _LinkScaffold({
    required this.icon,
    required this.title,
    required this.message,
    required this.busy,
    required this.actionLabel,
    this.action,
  });
  final IconData icon;
  final String title;
  final String message;
  final bool busy;
  final VoidCallback? action;
  final String actionLabel;

  @override
  Widget build(BuildContext context) => Scaffold(
    body: SafeArea(
      child: Center(
        child: Padding(
          padding: const EdgeInsets.all(28),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 420),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(icon, size: 64),
                const SizedBox(height: 20),
                Text(
                  title,
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    fontSize: 28,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 10),
                Text(message, textAlign: TextAlign.center),
                if (busy) ...[
                  const SizedBox(height: 24),
                  const CircularProgressIndicator(),
                ],
                if (action != null) ...[
                  const SizedBox(height: 24),
                  FilledButton(onPressed: action, child: Text(actionLabel)),
                ],
              ],
            ),
          ),
        ),
      ),
    ),
  );
}
