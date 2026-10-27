#!/usr/bin/env python3
"""Read-only, lossless Redis export. Run while application writes are stopped.

Uses the existing Upstash REST variables. Never prints keys, values or credentials.
The output is sensitive (password hashes and private games); store outside the repo.
"""
import hashlib
import json
import os
from pathlib import Path
import sys
import time
import urllib.error
import urllib.request


def export(destination):
    url = os.environ.get('KV_REST_API_URL') or os.environ.get('UPSTASH_REDIS_REST_URL')
    token = os.environ.get('KV_REST_API_TOKEN') or os.environ.get('UPSTASH_REDIS_REST_TOKEN')
    if not url or not token:
        raise RuntimeError('Redis REST credentials are not configured.')

    def command(*args):
        request = urllib.request.Request(url, json.dumps(args).encode(), {
            'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'})
        try:
            with urllib.request.urlopen(request, timeout=40) as response:
                result = json.load(response)
        except urllib.error.HTTPError as error:
            # Do not print request URLs, tokens or database contents on failure.
            raise RuntimeError('Redis export blocked (HTTP %s). No import was performed.' % error.code) from None
        if result.get('error'):
            raise RuntimeError('Redis rejected an export command. No import was performed.')
        return result['result']

    keys = set()
    for prefix in ('commander-account:v1:*', 'commander-live:room:*'):
        cursor = '0'
        while True:
            cursor, batch = command('SCAN', cursor, 'MATCH', prefix, 'COUNT', '100')
            keys.update(batch)
            if str(cursor) == '0':
                break
    records = []
    for key in sorted(keys):
        if key.startswith('commander-account:v1:ratelimit:'):
            continue  # Short-lived throttle counters restart on PostgreSQL.
        kind = command('TYPE', key)
        if kind == 'none':
            continue
        if kind not in ('string', 'hash', 'set', 'list'):
            raise RuntimeError('Unsupported Redis type; refusing an incomplete export.')
        # An atomic read retains the original strings and remaining expiration.
        script = "local t=redis.call('PTTL',KEYS[1]); if t == -2 then return {t} end; return {t,redis.call(ARGV[1],KEYS[1],unpack(ARGV,2))}"
        operation = {'string': ['GET'], 'hash': ['HGETALL'], 'set': ['SMEMBERS'], 'list': ['LRANGE', '0', '-1']}[kind]
        captured = int(time.time() * 1000)
        row = command('EVAL', script, '1', key, *operation)
        ttl = int(row[0])
        if ttl == -2:
            continue
        records.append({'key': key, 'type': kind, 'value': row[1],
                        'expiresAt': None if ttl == -1 else captured + ttl})
    snapshot = {'format': 'commander-redis-export/v1', 'exportedAt': int(time.time() * 1000),
                'sourceFingerprint': hashlib.sha256(url.rstrip('/').encode()).hexdigest(), 'records': records}
    payload = (json.dumps(snapshot, ensure_ascii=False, separators=(',', ':')) + '\n').encode()
    descriptor = os.open(destination, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    with os.fdopen(descriptor, 'wb') as handle:
        handle.write(payload)
    print(json.dumps({'exported': len(records), 'bytes': len(payload), 'sha256': hashlib.sha256(payload).hexdigest()}))


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit('Usage: python scripts/export-redis.py /private/path/commander-export.json')
    try:
        export(Path(sys.argv[1]))
    except Exception as error:
        # All remote errors above are sanitized. Never display a raw network traceback.
        sys.exit(str(error) if isinstance(error, (RuntimeError, FileExistsError)) else 'Redis export failed; no completed export was written.')
