#!/usr/bin/env python3
"""Hold the native audit lock and supervise one worker and its browser children."""
import fcntl
import os
from pathlib import Path
import signal
import subprocess
import sys
import time

worker = None
launching = False
requested_signal = None
owned_processes = {}


class QueuedLaunchInterrupted(Exception):
    pass


def send_group(pgid, sig):
    try:
        os.killpg(pgid, sig)
    except ProcessLookupError:
        pass


def receive_signal(sig, _frame):
    global requested_signal
    if requested_signal is None:
        requested_signal = sig
    if worker is not None:
        # Capture a newly launched detached browser before terminating Node:
        # otherwise a signal between polling ticks can reparent that child
        # before the main loop has observed its original parent.
        remember_descendants()
        send_group(worker.pid, sig)
    elif not launching:
        raise QueuedLaunchInterrupted()


def process_snapshot():
    processes = {}
    for entry in Path('/proc').iterdir():
        if not entry.name.isdigit():
            continue
        try:
            tail = (entry / 'stat').read_text().rsplit(')', 1)[1].split()
            processes[int(entry.name)] = (tail[0], int(tail[1]), int(tail[2]), int(tail[19]))
        except (OSError, ValueError, IndexError):
            continue
    return processes


def remember_descendants():
    processes = process_snapshot()
    if worker is not None and worker.pid not in owned_processes and worker.pid in processes:
        owned_processes[worker.pid] = processes[worker.pid][3]
    # A PID alone is not an ownership token: retain its start time so a later
    # unrelated process reusing that PID can never be signaled by this audit.
    roots = {pid for pid, started in tuple(owned_processes.items())
             if pid in processes and processes[pid][3] == started}
    while True:
        children = {pid for pid, row in processes.items() if row[1] in roots}
        unseen = children - roots
        if not unseen:
            break
        for pid in unseen:
            owned_processes[pid] = processes[pid][3]
        roots.update(unseen)
    return processes


def active_owned(processes):
    # Zombies cannot run or retain the lock. Remembered children remain owned
    # after Node exits and Linux reparents them to PID 1.
    return {pid: row for pid, row in processes.items()
            if row[0] not in ('Z', 'X') and owned_processes.get(pid) == row[3]}


def signal_owned(sig, processes=None):
    processes = processes if processes is not None else remember_descendants()
    groups = set()
    for pid, row in active_owned(processes).items():
        pgid = row[2]
        leader = processes.get(pgid)
        # Playwright launches Chromium detached into its own process group.
        # Signal that group only when its leader is also an owned child. A
        # child that joined a caller's group is signaled individually instead.
        owned_group = pgid in owned_processes and (leader is None or owned_processes[pgid] == leader[3])
        if owned_group:
            if pgid not in groups:
                send_group(pgid, sig)
                groups.add(pgid)
        else:
            try:
                os.kill(pid, sig)
            except ProcessLookupError:
                pass


def cleanup_owned():
    processes = remember_descendants()
    if not active_owned(processes):
        return
    signal_owned(signal.SIGTERM, processes)
    until = time.monotonic() + 15
    while active_owned(remember_descendants()) and time.monotonic() < until:
        time.sleep(0.05)
    signal_owned(signal.SIGKILL)


def main():
    global worker, launching
    if len(sys.argv) < 2:
        raise ValueError('Pass a Node audit script and any script arguments.')
    budget = float(os.environ.get('AUDIT_NATIVE_TIMEOUT_SECONDS', '780'))
    if not 0 < budget < float('inf'):
        raise ValueError('AUDIT_NATIVE_TIMEOUT_SECONDS must be finite and positive.')
    lock_path = os.environ.get('AUDIT_LOCK_PATH', '/tmp/mtg-native-audit.lock')
    signal.signal(signal.SIGTERM, receive_signal)
    signal.signal(signal.SIGINT, receive_signal)
    try:
        with open(lock_path, 'a') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            # A signal during Popen is retained and forwarded after the child
            # identity exists, so no fork-to-handler-registration race leaks it.
            launching = True
            try:
                worker = subprocess.Popen(['node', '--max-old-space-size=3072', *sys.argv[1:]], start_new_session=True)
                row = process_snapshot().get(worker.pid)
                if row is not None:
                    owned_processes[worker.pid] = row[3]
            finally:
                launching = False
            if requested_signal is not None:
                send_group(worker.pid, requested_signal)
            deadline = time.monotonic() + budget
            grace_deadline = None
            timed_out = False
            while True:
                processes = remember_descendants()
                if worker.poll() is not None:
                    break
                now = time.monotonic()
                if not timed_out and requested_signal is None and now >= deadline:
                    timed_out = True
                    print(f'audit worker reached its {budget:g}-second outer timeout', file=sys.stderr, flush=True)
                    send_group(worker.pid, signal.SIGTERM)
                if timed_out or requested_signal is not None:
                    if grace_deadline is None:
                        grace_deadline = now + 15
                    if now >= grace_deadline:
                        signal_owned(signal.SIGKILL, processes)
                time.sleep(0.05)
            code = worker.wait()
            cleanup_owned()
            if timed_out:
                return 124
            if requested_signal is not None:
                return 128 + requested_signal
            return code if code >= 0 else 128 - code
    except QueuedLaunchInterrupted:
        print(f'audit launch interrupted by {signal.Signals(requested_signal).name} before worker start', file=sys.stderr, flush=True)
        return 128 + requested_signal
    finally:
        if worker is not None and worker.poll() is None:
            send_group(worker.pid, signal.SIGTERM)
            try:
                worker.wait(timeout=15)
            except subprocess.TimeoutExpired:
                send_group(worker.pid, signal.SIGKILL)
                worker.wait()
        if worker is not None:
            cleanup_owned()


if __name__ == '__main__':
    sys.exit(main())
