import 'dart:convert';
import 'package:path/path.dart' as p;
import 'package:sqflite/sqflite.dart';
import 'app_logger.dart';

class OfflineStore {
  Database? _database;
  Future<Database> get database async => _database ??= await openDatabase(
    p.join(await getDatabasesPath(), 'allshops_pos.db'),
    version: 3,
    onCreate: (db, _) async {
      await db.execute(
        'CREATE TABLE products (key TEXT PRIMARY KEY, branch_id TEXT NOT NULL, barcode TEXT, sku TEXT, normalized_name TEXT NOT NULL, payload TEXT NOT NULL, snapshot_at TEXT NOT NULL)',
      );
      await db.execute(
        'CREATE INDEX products_barcode_idx ON products(barcode)',
      );
      await db.execute(
        'CREATE INDEX products_branch_barcode_idx ON products(branch_id, barcode)',
      );
      await db.execute(
        'CREATE TABLE pending_sales (transaction_uuid TEXT PRIMARY KEY, organization_id TEXT NOT NULL, branch_id TEXT NOT NULL, device_id TEXT NOT NULL, local_reference TEXT NOT NULL, payload TEXT NOT NULL, status TEXT NOT NULL, attempt_count INTEGER NOT NULL DEFAULT 0, last_error_code TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)',
      );
      await db.execute(
        'CREATE INDEX pending_sales_status_idx ON pending_sales(status, updated_at)',
      );
      await db.execute(
        'CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
      );
      await _createCheckoutOutbox(db);
    },
    onUpgrade: (db, oldVersion, _) async {
      if (oldVersion < 2) await _createCheckoutOutbox(db);
      if (oldVersion < 3) {
        await db.execute(
          'CREATE INDEX IF NOT EXISTS products_branch_barcode_idx ON products(branch_id, barcode)',
        );
      }
    },
  );

  static Future<void> _createCheckoutOutbox(DatabaseExecutor db) async {
    await db.execute(
      'CREATE TABLE IF NOT EXISTS checkout_outbox (idempotency_key TEXT PRIMARY KEY, organization_id TEXT NOT NULL, payload TEXT NOT NULL, status TEXT NOT NULL, attempt_count INTEGER NOT NULL DEFAULT 0, last_error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)',
    );
    await db.execute(
      'CREATE INDEX IF NOT EXISTS checkout_outbox_status_idx ON checkout_outbox(status, updated_at)',
    );
  }

  Future<void> replaceProducts(
    String branchId,
    List<Map<String, dynamic>> rows,
    String snapshotAt,
  ) async {
    final db = await database;
    await db.transaction((tx) async {
      await tx.delete(
        'products',
        where: 'branch_id = ?',
        whereArgs: [branchId],
      );
      for (final row in rows) {
        final productId = row['productId']?.toString() ?? row['id'].toString();
        final variantId = row['variantId']?.toString();
        await tx.insert('products', {
          'key': '$productId:${variantId ?? 'BASE'}',
          'branch_id': branchId,
          'barcode': row['barcode'],
          'sku': row['sku'],
          'normalized_name': '${row['name'] ?? ''} ${row['variantName'] ?? ''}'
              .toLowerCase(),
          'payload': jsonEncode(row),
          'snapshot_at': snapshotAt,
        });
      }
    });
  }

  Future<List<Map<String, dynamic>>> products(
    String branchId, [
    String query = '',
  ]) async {
    final db = await database;
    final value = query.trim().toLowerCase();
    final rows = await db.query(
      'products',
      where: value.isEmpty
          ? 'branch_id = ?'
          : 'branch_id = ? AND (normalized_name LIKE ? OR barcode = ? OR sku = ?)',
      whereArgs: value.isEmpty
          ? [branchId]
          : [branchId, '%$value%', query.trim(), query.trim()],
      limit: 100,
    );
    return rows
        .map(
          (row) => jsonDecode(row['payload'] as String) as Map<String, dynamic>,
        )
        .toList();
  }

  Future<Map<String, dynamic>?> productByBarcode(
    String branchId,
    String rawBarcode,
  ) async {
    final barcode = rawBarcode.trim();
    if (barcode.isEmpty) return null;
    final db = await database;
    final rows = await db.query(
      'products',
      columns: ['payload'],
      where: 'branch_id = ? AND barcode = ?',
      whereArgs: [branchId, barcode],
      limit: 1,
    );
    if (rows.isEmpty) return null;
    return jsonDecode(rows.first['payload'] as String) as Map<String, dynamic>;
  }

  Future<void> persistPaidSale(Map<String, dynamic> payload) async {
    final db = await database;
    final now = DateTime.now().toUtc().toIso8601String();
    await db.transaction((tx) async {
      await tx.insert('pending_sales', {
        'transaction_uuid': payload['transactionUuid'],
        'organization_id': payload['organizationId'],
        'branch_id': payload['branchId'],
        'device_id': payload['deviceId'],
        'local_reference': payload['localReference'],
        'payload': jsonEncode(payload),
        'status': 'LOCAL_PENDING',
        'attempt_count': 0,
        'created_at': now,
        'updated_at': now,
      }, conflictAlgorithm: ConflictAlgorithm.abort);
    });
    AppLogger.info('offline', 'paid_sale_persisted');
  }

  Future<List<Map<String, dynamic>>> pendingSales({String? deviceId}) async {
    final db = await database;
    final rows = await db.query(
      'pending_sales',
      where: deviceId == null
          ? "status IN ('LOCAL_PENDING','FAILED_RETRYABLE','SYNCING')"
          : "device_id = ? AND status IN ('LOCAL_PENDING','FAILED_RETRYABLE','SYNCING')",
      whereArgs: deviceId == null ? null : [deviceId],
      orderBy: 'created_at ASC',
    );
    AppLogger.debug(
      'offline',
      'pending_sales_loaded',
      fields: {'count': rows.length},
    );
    return rows;
  }

  Future<void> markResult(
    String transactionUuid,
    String status, {
    String? errorCode,
  }) async {
    final db = await database;
    await db.update(
      'pending_sales',
      {
        'status': status,
        'last_error_code': errorCode,
        'updated_at': DateTime.now().toUtc().toIso8601String(),
      },
      where: 'transaction_uuid = ?',
      whereArgs: [transactionUuid],
    );
    AppLogger.info(
      'offline',
      'sale_status_changed',
      fields: {'status': status, 'errorCode': errorCode},
    );
  }

  Future<void> persistCheckout(
    String idempotencyKey,
    String organizationId,
    Map<String, dynamic> payload,
  ) async {
    final db = await database;
    final now = DateTime.now().toUtc().toIso8601String();
    await db.insert('checkout_outbox', {
      'idempotency_key': idempotencyKey,
      'organization_id': organizationId,
      'payload': jsonEncode(payload),
      'status': 'PENDING',
      'attempt_count': 0,
      'created_at': now,
      'updated_at': now,
    }, conflictAlgorithm: ConflictAlgorithm.ignore);
    AppLogger.info('offline', 'checkout_persisted');
  }

  Future<List<Map<String, dynamic>>> pendingCheckouts() async {
    final db = await database;
    final rows = await db.query(
      'checkout_outbox',
      where: "status IN ('PENDING','RETRYABLE')",
      orderBy: 'created_at ASC',
    );
    AppLogger.debug(
      'offline',
      'pending_checkouts_loaded',
      fields: {'count': rows.length},
    );
    return rows;
  }

  Future<void> markCheckout(
    String idempotencyKey,
    String status, {
    String? error,
  }) async {
    final db = await database;
    await db.rawUpdate(
      'UPDATE checkout_outbox SET status = ?, last_error = ?, attempt_count = attempt_count + 1, updated_at = ? WHERE idempotency_key = ?',
      [status, error, DateTime.now().toUtc().toIso8601String(), idempotencyKey],
    );
    AppLogger.info(
      'offline',
      'checkout_status_changed',
      fields: {'status': status, 'hasError': error != null},
    );
  }
}
