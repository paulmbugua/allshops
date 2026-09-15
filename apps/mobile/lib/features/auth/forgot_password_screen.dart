import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app.dart';

class ForgotPasswordScreen extends ConsumerStatefulWidget {
  const ForgotPasswordScreen({super.key});

  @override
  ConsumerState<ForgotPasswordScreen> createState() =>
      _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends ConsumerState<ForgotPasswordScreen> {
  final email = TextEditingController();
  bool busy = false;
  String? message;

  @override
  void dispose() {
    email.dispose();
    super.dispose();
  }

  Future<void> submit() async {
    if (!email.text.contains('@')) {
      setState(() => message = 'Enter a valid email address.');
      return;
    }
    setState(() {
      busy = true;
      message = null;
    });
    try {
      final result = await ref
          .read(apiProvider)
          .post<Map<String, dynamic>>(
            '/auth/forgot-password',
            data: {'email': email.text.trim()},
          );
      if (mounted) setState(() => message = result['message']?.toString());
    } catch (error) {
      if (mounted) {
        setState(
          () => message =
              'If that email belongs to an eligible account, a reset link has been sent.',
        );
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Password recovery')),
    body: Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 440),
          child: Card(
            child: Padding(
              padding: const EdgeInsets.all(22),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Icon(Icons.mark_email_read_outlined, size: 48),
                  const SizedBox(height: 18),
                  const Text(
                    'Forgot your password?',
                    style: TextStyle(fontSize: 28, fontWeight: FontWeight.w900),
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'We will email a secure one-hour reset link. The same new password works on mobile and web.',
                    style: TextStyle(color: Colors.blueGrey),
                  ),
                  const SizedBox(height: 20),
                  TextField(
                    controller: email,
                    keyboardType: TextInputType.emailAddress,
                    decoration: const InputDecoration(
                      labelText: 'Email address',
                      prefixIcon: Icon(Icons.alternate_email_rounded),
                    ),
                  ),
                  if (message != null) ...[
                    const SizedBox(height: 12),
                    Text(message!),
                  ],
                  const SizedBox(height: 18),
                  FilledButton.icon(
                    onPressed: busy ? null : submit,
                    icon: const Icon(Icons.outgoing_mail),
                    label: Text(busy ? 'Sending…' : 'Send reset link'),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    ),
  );
}
