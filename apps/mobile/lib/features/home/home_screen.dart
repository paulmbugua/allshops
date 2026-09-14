import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../app.dart';
import '../../core/models.dart';
import '../auth/login_screen.dart';
import '../modules/module_config.dart';
import '../modules/module_screen.dart';
import '../modules/workspace_screen.dart';
import '../pos/pos_screen.dart';
import '../subscription/subscription_screen.dart';

class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key, required this.user, required this.membership});
  final CurrentUser user;
  final Membership membership;
  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> {
  int index = 0;
  @override
  Widget build(BuildContext context) {
    final canUsePos = widget.membership.hasAllPermissions(const [
      'catalogue.read',
      'sale.create',
      'payment.record',
    ]);
    final pages = <Widget>[
      DashboardTab(
        user: widget.user,
        membership: widget.membership,
        onOpenPos: canUsePos ? () => setState(() => index = 1) : null,
        onLogout: _logout,
      ),
      if (canUsePos) PosScreen(membership: widget.membership),
      if (widget.membership.hasPermission('inventory.read'))
        WorkspaceScreen(
          membership: widget.membership,
          title: 'Stock control',
          subtitle: 'Live quantities, transfers, movements and catalogue.',
          paths: stockWorkspacePaths,
        ),
      if (widget.membership.hasPermission('report.dashboard'))
        WorkspaceScreen(
          membership: widget.membership,
          title: 'Reports',
          subtitle:
              'The same tenant- and branch-scoped numbers as your web workspace.',
          paths: reportWorkspacePaths,
        ),
    ];
    final destinations = <NavigationDestination>[
      const NavigationDestination(
        icon: Icon(Icons.space_dashboard_outlined),
        selectedIcon: Icon(Icons.space_dashboard_rounded),
        label: 'Home',
      ),
      if (canUsePos)
        const NavigationDestination(
          icon: Icon(Icons.point_of_sale_outlined),
          selectedIcon: Icon(Icons.point_of_sale_rounded),
          label: 'POS',
        ),
      if (widget.membership.hasPermission('inventory.read'))
        const NavigationDestination(
          icon: Icon(Icons.inventory_2_outlined),
          label: 'Stock',
        ),
      if (widget.membership.hasPermission('report.dashboard'))
        const NavigationDestination(
          icon: Icon(Icons.insights_outlined),
          label: 'Reports',
        ),
    ];
    final selectedIndex = index.clamp(0, pages.length - 1);
    return Scaffold(
      body: IndexedStack(index: selectedIndex, children: pages),
      bottomNavigationBar: NavigationBar(
        selectedIndex: selectedIndex,
        onDestinationSelected: (value) => setState(() => index = value),
        destinations: destinations,
      ),
    );
  }

  Future<void> _logout() async {
    await ref.read(apiProvider).logout();
    if (mounted) {
      Navigator.of(context).pushAndRemoveUntil(
        MaterialPageRoute(builder: (_) => const LoginScreen()),
        (_) => false,
      );
    }
  }
}

class DashboardTab extends StatelessWidget {
  const DashboardTab({
    super.key,
    required this.user,
    required this.membership,
    this.onOpenPos,
    required this.onLogout,
  });
  final CurrentUser user;
  final Membership membership;
  final VoidCallback? onOpenPos;
  final VoidCallback onLogout;
  static const paths = [
    'products',
    'sales',
    'customers',
    'purchases',
    'suppliers',
    'expenses',
    'expense-categories',
    'appointments',
    'staff',
    'commissions',
    'commission-rules',
    'branches',
    'users',
    'devices',
    'subscription',
    'billing',
    'sync/conflicts',
    'pilot-readiness',
    'support/diagnostics',
  ];

  @override
  Widget build(BuildContext context) {
    final allowedPaths = paths
        .where((path) {
          final permission = moduleReadPermission(path);
          return permission == null || membership.hasPermission(permission);
        })
        .toList(growable: false);
    return SafeArea(
      child: CustomScrollView(
        slivers: [
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(20, 18, 20, 12),
            sliver: SliverToBoxAdapter(
              child: Row(
                children: [
                  Container(
                    width: 48,
                    height: 48,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: const Color(0xFFF35F45),
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: const Text(
                      '✦',
                      style: TextStyle(color: Colors.white, fontSize: 23),
                    ),
                  ),
                  const Spacer(),
                  PopupMenuButton<String>(
                    onSelected: (value) {
                      if (value == 'logout') onLogout();
                    },
                    itemBuilder: (_) => [
                      PopupMenuItem(
                        enabled: false,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              user.name,
                              style: const TextStyle(
                                fontWeight: FontWeight.w900,
                              ),
                            ),
                            Text(
                              user.email,
                              style: const TextStyle(fontSize: 12),
                            ),
                          ],
                        ),
                      ),
                      const PopupMenuDivider(),
                      const PopupMenuItem(
                        value: 'logout',
                        child: Row(
                          children: [
                            Icon(Icons.logout_rounded),
                            SizedBox(width: 10),
                            Text('Sign out'),
                          ],
                        ),
                      ),
                    ],
                    child: CircleAvatar(
                      backgroundColor: const Color(0xFFFFE4DA),
                      child: Text(
                        user.name.isEmpty ? 'U' : user.name[0].toUpperCase(),
                        style: const TextStyle(
                          fontWeight: FontWeight.w900,
                          color: Color(0xFFF35F45),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
          SliverPadding(
            padding: const EdgeInsets.all(20),
            sliver: SliverToBoxAdapter(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Good day, ${user.name.split(' ').first}',
                    style: const TextStyle(
                      fontSize: 13,
                      color: Colors.blueGrey,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 5),
                  Text(
                    membership.organizationName,
                    style: const TextStyle(
                      fontSize: 30,
                      fontWeight: FontWeight.w900,
                      letterSpacing: -1.2,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    '${membership.branchName ?? 'All branches'}  •  ${membership.role.replaceAll('_', ' ')}',
                    style: const TextStyle(
                      color: Colors.blueGrey,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 18),
                  Container(
                    padding: const EdgeInsets.all(22),
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(
                        colors: [Color(0xFF172C2B), Color(0xFF28564D)],
                      ),
                      borderRadius: BorderRadius.circular(24),
                    ),
                    child: Row(
                      children: [
                        const Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'Ready to sell?',
                                style: TextStyle(
                                  color: Colors.white,
                                  fontSize: 24,
                                  fontWeight: FontWeight.w900,
                                ),
                              ),
                              SizedBox(height: 6),
                              Text(
                                'Fast checkout. Cash or local card. Offline-safe.',
                                style: TextStyle(
                                  color: Color(0xFFAEC5BD),
                                  height: 1.4,
                                ),
                              ),
                            ],
                          ),
                        ),
                        if (onOpenPos != null)
                          FilledButton.tonal(
                            onPressed: onOpenPos,
                            style: FilledButton.styleFrom(
                              backgroundColor: const Color(0xFFFFCF5C),
                              foregroundColor: const Color(0xFF172C2B),
                            ),
                            child: const Icon(Icons.arrow_forward_rounded),
                          ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SliverPadding(
            padding: EdgeInsets.fromLTRB(20, 5, 20, 10),
            sliver: SliverToBoxAdapter(
              child: Text(
                'Your workspace',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900),
              ),
            ),
          ),
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(20, 4, 20, 28),
            sliver: SliverGrid(
              delegate: SliverChildBuilderDelegate((context, i) {
                final item = configFor(allowedPaths[i], allowedPaths[i]);
                return InkWell(
                  borderRadius: BorderRadius.circular(22),
                  onTap: () => Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (_) => item.path == 'subscription'
                          ? SubscriptionScreen(membership: membership)
                          : ModuleScreen(
                              membership: membership,
                              title: item.title,
                              path: item.path,
                            ),
                    ),
                  ),
                  child: Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Container(
                            width: 44,
                            height: 44,
                            decoration: BoxDecoration(
                              color: item.color.withValues(alpha: .13),
                              borderRadius: BorderRadius.circular(14),
                            ),
                            child: Icon(item.icon, color: item.color),
                          ),
                          const Spacer(),
                          Text(
                            item.title,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontWeight: FontWeight.w900,
                              fontSize: 14,
                            ),
                          ),
                          const SizedBox(height: 2),
                          const Text(
                            'Open workspace',
                            style: TextStyle(
                              color: Colors.blueGrey,
                              fontSize: 10,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                );
              }, childCount: allowedPaths.length),
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 3,
                mainAxisSpacing: 12,
                crossAxisSpacing: 12,
                childAspectRatio: .82,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
