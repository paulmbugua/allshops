import 'package:flutter/material.dart';
import '../../core/theme.dart';
import 'login_screen.dart';

class WelcomeScreen extends StatelessWidget {
  const WelcomeScreen({super.key, this.shopName});

  final String? shopName;

  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: AllShopsTheme.qatarMaroon,
    body: Stack(
      fit: StackFit.expand,
      children: [
        Image.asset(
          'assets/culture/qatar-shop-welcome.webp',
          fit: BoxFit.cover,
          alignment: Alignment.topCenter,
          filterQuality: FilterQuality.high,
        ),
        const DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              stops: [0, .42, .72, 1],
              colors: [
                Color(0x19000000),
                Color(0x26000000),
                Color(0xD9150E11),
                Color(0xFF150E11),
              ],
            ),
          ),
        ),
        SafeArea(
          child: LayoutBuilder(
            builder: (context, constraints) => Padding(
              padding: const EdgeInsets.fromLTRB(24, 20, 24, 24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _Brand(shopName: shopName),
                  const Spacer(),
                  ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 520),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const _QatarWelcomeBadge(),
                        const SizedBox(height: 18),
                        Text(
                          shopName == null
                              ? 'Modern business,\nrooted in Qatar.'
                              : 'Welcome to\n$shopName.',
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: constraints.maxWidth > 600 ? 54 : 42,
                            height: .98,
                            letterSpacing: -1.8,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                        const SizedBox(height: 14),
                        Text(
                          'A beautifully simple workspace for the people who serve, sell and grow Qatar every day.',
                          style: TextStyle(
                            color: Colors.white.withValues(alpha: .72),
                            fontSize: 15,
                            height: 1.55,
                          ),
                        ),
                        const SizedBox(height: 24),
                        FilledButton(
                          style: FilledButton.styleFrom(
                            minimumSize: const Size.fromHeight(58),
                            backgroundColor: AllShopsTheme.qatarSand,
                            foregroundColor: AllShopsTheme.qatarMaroon,
                          ),
                          onPressed: () => Navigator.of(context).push(
                            MaterialPageRoute(
                              builder: (_) => const LoginScreen(),
                            ),
                          ),
                          child: const Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Text(
                                'Staff sign in',
                                style: TextStyle(fontWeight: FontWeight.w900),
                              ),
                              SizedBox(width: 10),
                              Icon(Icons.arrow_forward_rounded),
                            ],
                          ),
                        ),
                        const SizedBox(height: 16),
                        const Row(
                          children: [
                            Icon(
                              Icons.verified_user_outlined,
                              color: Colors.white54,
                              size: 16,
                            ),
                            SizedBox(width: 7),
                            Text(
                              'Secure • QAR-ready • Built for every branch',
                              style: TextStyle(
                                color: Colors.white54,
                                fontSize: 11,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
    ),
  );
}

class _Brand extends StatelessWidget {
  const _Brand({this.shopName});
  final String? shopName;
  @override
  Widget build(BuildContext context) => Row(
    children: [
      Container(
        width: 46,
        height: 46,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(15),
          boxShadow: const [
            BoxShadow(
              color: Colors.black26,
              blurRadius: 24,
              offset: Offset(0, 8),
            ),
          ],
        ),
        child: const Text(
          '✦',
          style: TextStyle(
            color: AllShopsTheme.qatarMaroon,
            fontSize: 23,
            fontWeight: FontWeight.w900,
          ),
        ),
      ),
      const SizedBox(width: 12),
      Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            shopName ?? 'AllShops',
            style: const TextStyle(
              color: Colors.white,
              fontSize: 16,
              fontWeight: FontWeight.w900,
            ),
          ),
          const Text(
            'POINT OF SALE • QATAR',
            style: TextStyle(
              color: Colors.white60,
              fontSize: 8,
              letterSpacing: 1.5,
              fontWeight: FontWeight.w800,
            ),
          ),
        ],
      ),
    ],
  );
}

class _QatarWelcomeBadge extends StatelessWidget {
  const _QatarWelcomeBadge();
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 8),
    decoration: BoxDecoration(
      color: Colors.white.withValues(alpha: .12),
      border: Border.all(color: Colors.white24),
      borderRadius: BorderRadius.circular(99),
    ),
    child: const Text(
      'أهلاً وسهلاً  •  WELCOME',
      style: TextStyle(
        color: AllShopsTheme.qatarSand,
        fontSize: 11,
        letterSpacing: 1.1,
        fontWeight: FontWeight.w900,
      ),
    ),
  );
}
