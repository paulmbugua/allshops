import 'package:flutter/material.dart';
import '../../core/models.dart';
import '../inventory/inventory_screen.dart';
import 'module_config.dart';
import 'module_screen.dart';

class WorkspaceScreen extends StatelessWidget {
  const WorkspaceScreen({
    super.key,
    required this.membership,
    required this.title,
    required this.subtitle,
    required this.paths,
  });
  final Membership membership;
  final String title;
  final String subtitle;
  final List<String> paths;

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
            padding: const EdgeInsets.fromLTRB(20, 24, 20, 8),
            sliver: SliverToBoxAdapter(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: const TextStyle(
                      fontSize: 30,
                      fontWeight: FontWeight.w900,
                      letterSpacing: -1,
                    ),
                  ),
                  const SizedBox(height: 5),
                  Text(
                    subtitle,
                    style: const TextStyle(color: Colors.blueGrey, height: 1.4),
                  ),
                ],
              ),
            ),
          ),
          SliverPadding(
            padding: const EdgeInsets.all(20),
            sliver: SliverList.separated(
              itemCount: allowedPaths.length,
              separatorBuilder: (_, _) => const SizedBox(height: 11),
              itemBuilder: (_, index) {
                final config = configFor(
                  allowedPaths[index],
                  prettyLabel(allowedPaths[index].split('/').last),
                );
                return Card(
                  child: InkWell(
                    borderRadius: BorderRadius.circular(20),
                    onTap: () => Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) {
                          final inventoryTab = switch (config.path) {
                            'inventory' => 0,
                            'inventory/movements' => 1,
                            'inventory/transfers' => 2,
                            _ => null,
                          };
                          return inventoryTab == null
                              ? ModuleScreen(
                                  membership: membership,
                                  title: config.title,
                                  path: config.path,
                                )
                              : InventoryScreen(
                                  membership: membership,
                                  initialTab: inventoryTab,
                                );
                        },
                      ),
                    ),
                    child: Padding(
                      padding: const EdgeInsets.all(17),
                      child: Row(
                        children: [
                          Container(
                            width: 48,
                            height: 48,
                            decoration: BoxDecoration(
                              color: config.color.withValues(alpha: .13),
                              borderRadius: BorderRadius.circular(15),
                            ),
                            child: Icon(config.icon, color: config.color),
                          ),
                          const SizedBox(width: 15),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  config.title,
                                  style: const TextStyle(
                                    fontSize: 16,
                                    fontWeight: FontWeight.w900,
                                  ),
                                ),
                                const SizedBox(height: 3),
                                const Text(
                                  'View records and available actions',
                                  style: TextStyle(
                                    color: Colors.blueGrey,
                                    fontSize: 12,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const Icon(Icons.arrow_forward_rounded),
                        ],
                      ),
                    ),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

const stockWorkspacePaths = [
  'inventory',
  'inventory/transfers',
  'inventory/movements',
  'inventory/reconciliation',
  'products',
  'categories',
  'brands',
  'units',
];
const reportWorkspacePaths = [
  'reports/dashboard',
  'reports/sales',
  'reports/profit',
  'reports/payments',
  'reports/inventory',
  'reports/purchases',
  'reports/expenses',
  'reports/customers',
  'reports/appointments',
  'reports/commissions',
  'reports/staff-performance',
];
