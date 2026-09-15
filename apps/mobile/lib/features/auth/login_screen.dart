import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../app.dart';
import '../../core/models.dart';
import '../home/home_screen.dart';
import 'forgot_password_screen.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});
  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final email = TextEditingController();
  final password = TextEditingController();
  bool busy = false;
  String? error;
  Future<void> submit() async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final body = await ref.read(apiProvider).login(email.text, password.text);
      final user = CurrentUser.fromJson(body['user'] as Map<String, dynamic>);
      if (!mounted) return;
      if (user.memberships.isEmpty) {
        throw Exception('No active business membership is available.');
      }
      await Navigator.of(context).pushReplacement(
        MaterialPageRoute(
          builder: (_) =>
              HomeScreen(user: user, membership: user.memberships.first),
        ),
      );
    } catch (value) {
      if (mounted) setState(() => error = value.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    body: SafeArea(
      child: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 440),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Container(
                  width: 64,
                  height: 64,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: Theme.of(context).colorScheme.primary,
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: const Text(
                    '✦',
                    style: TextStyle(color: Colors.white, fontSize: 30),
                  ),
                ),
                const SizedBox(height: 28),
                Text(
                  tr(context, 'Welcome back', 'مرحباً بعودتك'),
                  style: const TextStyle(
                    fontSize: 40,
                    fontWeight: FontWeight.w900,
                    letterSpacing: -1.8,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  tr(
                    context,
                    'Sign in to open your AllShops workspace.',
                    'سجّل الدخول لفتح مساحة عمل AllShops.',
                  ),
                  style: TextStyle(
                    color: Colors.blueGrey.shade500,
                    fontSize: 16,
                  ),
                ),
                const SizedBox(height: 36),
                TextField(
                  controller: email,
                  keyboardType: TextInputType.emailAddress,
                  textInputAction: TextInputAction.next,
                  decoration: InputDecoration(
                    labelText: tr(
                      context,
                      'Email address',
                      'البريد الإلكتروني',
                    ),
                    prefixIcon: const Icon(Icons.alternate_email_rounded),
                  ),
                ),
                const SizedBox(height: 14),
                TextField(
                  controller: password,
                  obscureText: true,
                  onSubmitted: (_) => submit(),
                  decoration: InputDecoration(
                    labelText: tr(context, 'Password', 'كلمة المرور'),
                    prefixIcon: const Icon(Icons.lock_outline_rounded),
                  ),
                ),
                Align(
                  alignment: Alignment.centerRight,
                  child: TextButton(
                    onPressed: () => Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) => const ForgotPasswordScreen(),
                      ),
                    ),
                    child: Text(
                      tr(context, 'Forgot password?', 'هل نسيت كلمة المرور؟'),
                    ),
                  ),
                ),
                if (error != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 14),
                    child: Text(
                      error!,
                      style: TextStyle(
                        color: Theme.of(context).colorScheme.error,
                      ),
                    ),
                  ),
                const SizedBox(height: 22),
                ElevatedButton(
                  onPressed: busy ? null : submit,
                  child: Text(
                    busy
                        ? tr(context, 'Signing in…', 'جارٍ تسجيل الدخول…')
                        : tr(context, 'Sign in securely', 'تسجيل دخول آمن'),
                  ),
                ),
                const SizedBox(height: 24),
                Text(
                  tr(
                    context,
                    'Your access follows the same roles, branch restrictions and subscription controls as AllShops Web.',
                    'تتبع صلاحياتك الأدوار وقيود الفروع وضوابط الاشتراك نفسها في الويب.',
                  ),
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Colors.blueGrey, fontSize: 12),
                ),
              ],
            ),
          ),
        ),
      ),
    ),
  );
}
