

# Backup and Restore Strategy

Production-grade backup and disaster recovery procedures for EitherWay PostgreSQL database.

## Backup Strategy

### 1. Automated Daily Logical Backups

**pg_dump with compression:**

```bash
#!/bin/bash
# /scripts/backup-daily.sh

BACKUP_DIR="/var/backups/eitherway/daily"
DATE=$(date +%Y-%m-%d)
DB_NAME="eitherway"

mkdir -p $BACKUP_DIR

pg_dump \
  -h localhost \
  -U postgres \
  -d $DB_NAME \
  --format=custom \
  --compress=9 \
  --file="$BACKUP_DIR/eitherway-$DATE.dump"

# Rotate old backups (keep 30 days)
find $BACKUP_DIR -name "*.dump" -mtime +30 -delete

# Upload to S3 (optional)
# aws s3 cp "$BACKUP_DIR/eitherway-$DATE.dump" s3://my-backups/eitherway/
```

**Schedule with cron:**

```cron
# Run daily at 2 AM
0 2 * * * /scripts/backup-daily.sh
```

### 2. Continuous WAL Archiving

**Configure postgresql.conf:**

```conf
wal_level = replica
archive_mode = on
archive_command = 'test ! -f /var/backups/eitherway/wal/%f && cp %p /var/backups/eitherway/wal/%f'
max_wal_senders = 3
```

**Create WAL archive directory:**

```bash
mkdir -p /var/backups/eitherway/wal
chown postgres:postgres /var/backups/eitherway/wal
```

### 3. Weekly Full Backups

```bash
#!/bin/bash
# /scripts/backup-weekly.sh

BACKUP_DIR="/var/backups/eitherway/weekly"
DATE=$(date +%Y-W%V)

mkdir -p $BACKUP_DIR

pg_basebackup \
  -h localhost \
  -U postgres \
  -D "$BACKUP_DIR/base-$DATE" \
  --format=tar \
  --gzip \
  --progress \
  --checkpoint=fast

# Keep 8 weeks
find $BACKUP_DIR -name "base-*" -mtime +56 -exec rm -rf {} \;
```

**Schedule weekly:**

```cron
# Run Sundays at 1 AM
0 1 * * 0 /scripts/backup-weekly.sh
```

### 4. Backup Verification

**Monthly restore test:**

```bash
#!/bin/bash
# /scripts/verify-backup.sh

LATEST_BACKUP=$(ls -t /var/backups/eitherway/daily/*.dump | head -1)
TEST_DB="eitherway_restore_test"

# Drop test DB if exists
psql -U postgres -c "DROP DATABASE IF EXISTS $TEST_DB"

# Create test DB
psql -U postgres -c "CREATE DATABASE $TEST_DB"

# Restore
pg_restore \
  -U postgres \
  -d $TEST_DB \
  --verbose \
  $LATEST_BACKUP

# Run integrity checks
psql -U postgres -d $TEST_DB -c "SELECT core.analyze_query_performance()"
psql -U postgres -d $TEST_DB -c "SELECT COUNT(*) FROM core.users"
psql -U postgres -d $TEST_DB -c "SELECT COUNT(*) FROM core.sessions"

# Cleanup
psql -U postgres -c "DROP DATABASE $TEST_DB"

echo "Backup verification completed: $(date)"
```

## Restore Procedures

### Quick Restore (Development)

```bash
# 1. Stop application
docker-compose down

# 2. Drop and recreate database
psql -U postgres -c "DROP DATABASE eitherway"
psql -U postgres -c "CREATE DATABASE eitherway"

# 3. Restore from backup
pg_restore \
  -U postgres \
  -d eitherway \
  --verbose \
  /path/to/backup.dump

# 4. Restart application
docker-compose up -d
```

### Production Restore

```bash
#!/bin/bash
# /scripts/restore-production.sh

BACKUP_FILE=$1

if [ -z "$BACKUP_FILE" ]; then
  echo "Usage: $0 <backup-file>"
  exit 1
fi

# 1. Announce maintenance
echo "STARTING MAINTENANCE MODE"

# 2. Stop application servers
systemctl stop eitherway-api

# 3. Terminate connections
psql -U postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'eitherway' AND pid <> pg_backend_pid()"

# 4. Drop database
psql -U postgres -c "DROP DATABASE eitherway"

# 5. Recreate database
psql -U postgres -c "CREATE DATABASE eitherway"

# 6. Restore
pg_restore \
  -U postgres \
  -d eitherway \
  --verbose \
  --jobs=4 \
  $BACKUP_FILE

# 7. Run integrity checks
psql -U postgres -d eitherway -c "SELECT core.analyze_query_performance()"

# 8. Restart application
systemctl start eitherway-api

echo "RESTORE COMPLETED: $(date)"
```

### Point-in-Time Recovery (PITR)

```bash
# 1. Restore base backup
tar -xzf /var/backups/eitherway/weekly/base-2025-W01/base.tar.gz -C /var/lib/postgresql/data

# 2. Create recovery.conf
cat > /var/lib/postgresql/data/recovery.conf <<EOF
restore_command = 'cp /var/backups/eitherway/wal/%f %p'
recovery_target_time = '2025-01-15 14:30:00'
recovery_target_action = 'promote'
EOF

# 3. Start PostgreSQL
systemctl start postgresql

# 4. Monitor recovery
tail -f /var/log/postgresql/postgresql-*.log
```

## Disaster Recovery Scenarios

### Scenario 1: Corrupted Database

**Symptoms:** Query errors, data inconsistency

**Solution:**

```bash
# 1. Attempt repair
psql -U postgres -d eitherway -c "REINDEX DATABASE eitherway"
psql -U postgres -d eitherway -c "VACUUM FULL ANALYZE"

# 2. If repair fails, restore from backup
./scripts/restore-production.sh /var/backups/eitherway/daily/eitherway-latest.dump
```

### Scenario 2: Accidental Data Deletion

**Symptoms:** Missing users, sessions, or files

**Solution:**

```bash
# 1. Create temporary restore database
psql -U postgres -c "CREATE DATABASE eitherway_recovery"

# 2. Restore to recovery DB
pg_restore -U postgres -d eitherway_recovery /var/backups/eitherway/daily/eitherway-yesterday.dump

# 3. Export missing data
pg_dump -U postgres -d eitherway_recovery \
  --table=core.users \
  --table=core.sessions \
  --data-only \
  > /tmp/recovered-data.sql

# 4. Import to production
psql -U postgres -d eitherway < /tmp/recovered-data.sql

# 5. Cleanup
psql -U postgres -c "DROP DATABASE eitherway_recovery"
```

### Scenario 3: Complete Server Loss

**Solution:**

```bash
# 1. Provision new server
# 2. Install PostgreSQL
# 3. Restore latest backup
pg_restore -U postgres -d eitherway /path/to/latest-backup.dump

# 4. Apply WAL files if available
# (Use PITR procedure above)

# 5. Update connection strings
# 6. Restart applications
```

## Backup Best Practices

### 1. Test Restores Monthly

```bash
# Add to crontab
0 3 1 * * /scripts/verify-backup.sh
```

### 2. Monitor Backup Size

```bash
#!/bin/bash
# Alert if backup size changes dramatically

CURRENT_SIZE=$(du -b /var/backups/eitherway/daily/eitherway-$(date +%Y-%m-%d).dump | cut -f1)
YESTERDAY_SIZE=$(du -b /var/backups/eitherway/daily/eitherway-$(date -d yesterday +%Y-%m-%d).dump | cut -f1 2>/dev/null || echo $CURRENT_SIZE)

DIFF=$(echo "scale=2; ($CURRENT_SIZE - $YESTERDAY_SIZE) / $YESTERDAY_SIZE * 100" | bc)

if (( $(echo "$DIFF > 50 || $DIFF < -50" | bc -l) )); then
  echo "WARNING: Backup size changed by ${DIFF}%"
  # Send alert
fi
```

### 3. Encrypt Sensitive Backups

```bash
# Encrypt backup
gpg --symmetric --cipher-algo AES256 eitherway-backup.dump

# Decrypt for restore
gpg --decrypt eitherway-backup.dump.gpg > eitherway-backup.dump
```

### 4. Off-site Backup Storage

```bash
# S3 sync
aws s3 sync /var/backups/eitherway/ s3://my-backups/eitherway/ \
  --storage-class GLACIER \
  --exclude "*" \
  --include "*.dump"

# Google Cloud Storage
gsutil -m rsync -r /var/backups/eitherway/ gs://my-backups/eitherway/
```

## Recovery Time Objectives (RTO)

| Scenario | Target RTO | Procedure |
|----------|-----------|-----------|
| Single table restore | < 15 minutes | Selective restore from daily backup |
| Full database restore | < 1 hour | Production restore procedure |
| Point-in-time recovery | < 2 hours | PITR with WAL replay |
| Complete disaster recovery | < 4 hours | New server + latest backup |

## Monitoring

### Check Backup Status

```sql
-- Last successful backup time (custom table)
CREATE TABLE IF NOT EXISTS backup_log (
  id SERIAL PRIMARY KEY,
  backup_type TEXT,
  backup_file TEXT,
  backup_size BIGINT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Record backup
INSERT INTO backup_log (backup_type, backup_file, backup_size)
VALUES ('daily', 'eitherway-2025-01-15.dump', 1234567890);

-- Check recent backups
SELECT * FROM backup_log ORDER BY created_at DESC LIMIT 10;
```

### Alert on Backup Failures

```bash
#!/bin/bash
# Monitor backup completion

EXPECTED_BACKUP="/var/backups/eitherway/daily/eitherway-$(date +%Y-%m-%d).dump"

if [ ! -f "$EXPECTED_BACKUP" ]; then
  echo "ALERT: Daily backup missing for $(date +%Y-%m-%d)"
  # Send notification
  curl -X POST https://hooks.slack.com/... -d "{\"text\":\"Backup failed\"}"
fi
```

## Checklist

**Daily:**
- [ ] Verify daily backup completed
- [ ] Check backup file size
- [ ] Monitor disk space

**Weekly:**
- [ ] Review backup logs
- [ ] Verify WAL archiving
- [ ] Check off-site sync

**Monthly:**
- [ ] Test restore procedure
- [ ] Validate backup integrity
- [ ] Review retention policies
- [ ] Update disaster recovery documentation

**Quarterly:**
- [ ] Full disaster recovery drill
- [ ] Review RTO/RPO targets
- [ ] Update runbooks

## Emergency Contacts

- **Database Admin:** [Contact Info]
- **DevOps Lead:** [Contact Info]
- **On-Call:** [PagerDuty/OpsGenie Link]

## Additional Resources

- [PostgreSQL Backup Documentation](https://www.postgresql.org/docs/current/backup.html)
- [WAL-E for continuous archiving](https://github.com/wal-e/wal-e)
- [pgBackRest](https://pgbackrest.org/)
