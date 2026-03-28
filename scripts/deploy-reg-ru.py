from __future__ import annotations

import argparse
import json
import posixpath
import shlex
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path

try:
    import paramiko
except ImportError as exc:  # pragma: no cover - dependency check
    raise SystemExit(
        "Missing Python dependency 'paramiko'. Install it before deploying: pip install paramiko"
    ) from exc


DEFAULT_CONFIG_PATH = ".secrets/reg-ru-deploy.secret.json"
SSH_CONNECT_RETRIES = 5
SSH_CONNECT_TIMEOUT = 20
SSH_BANNER_TIMEOUT = 60
SSH_AUTH_TIMEOUT = 60
REMOTE_COMMAND_TIMEOUT = 1800


@dataclass
class DeployConfig:
    host: str
    username: str
    password: str
    remote_root: str
    port: int = 22
    build_command: str = "yarn build"


@dataclass
class RemoteFileInfo:
    size: int
    mtime: int


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Incremental REG.RU deploy for the built dist/ directory."
    )
    parser.add_argument(
        "--config",
        default=DEFAULT_CONFIG_PATH,
        help=f"Path to local JSON config (default: {DEFAULT_CONFIG_PATH})",
    )
    parser.add_argument(
        "--local-root",
        default="dist",
        help="Local build directory to upload (default: dist)",
    )
    parser.add_argument(
        "--skip-build",
        action="store_true",
        help="Upload the current dist/ without running the build command first",
    )
    parser.add_argument(
        "--prune",
        action="store_true",
        help="Delete remote files that no longer exist locally",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would change without uploading anything",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Print every skipped file as well as uploaded files",
    )
    return parser.parse_args()


def load_config(path: Path) -> DeployConfig:
    if not path.exists():
        raise SystemExit(
            f"Deploy config was not found: {path}\n"
            "Create it from .secrets/reg-ru-deploy.example.json."
        )

    data = json.loads(path.read_text(encoding="utf-8"))
    required_fields = ("host", "username", "password", "remote_root")
    missing = [field for field in required_fields if not data.get(field)]
    if missing:
        raise SystemExit(f"Deploy config is missing required fields: {', '.join(missing)}")

    return DeployConfig(
        host=data["host"],
        username=data["username"],
        password=data["password"],
        remote_root=data["remote_root"].rstrip("/"),
        port=int(data.get("port", 22)),
        build_command=data.get("build_command", "yarn build"),
    )


def run_build(command: str, repo_root: Path) -> None:
    print(f"[deploy] Running build: {command}")
    subprocess.run(command, cwd=repo_root, check=True, shell=True)


def connect_ssh(config: DeployConfig) -> paramiko.SSHClient:
    last_error: Exception | None = None

    for attempt in range(1, SSH_CONNECT_RETRIES + 1):
        ssh = paramiko.SSHClient()
        ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())

        try:
            ssh.connect(
                config.host,
                port=config.port,
                username=config.username,
                password=config.password,
                timeout=SSH_CONNECT_TIMEOUT,
                banner_timeout=SSH_BANNER_TIMEOUT,
                auth_timeout=SSH_AUTH_TIMEOUT,
                allow_agent=False,
                look_for_keys=False,
            )
            return ssh
        except Exception as exc:  # pragma: no cover - network dependent
            last_error = exc
            ssh.close()
            if attempt == SSH_CONNECT_RETRIES:
                break
            print(
                f"[deploy] SSH connect attempt {attempt}/{SSH_CONNECT_RETRIES} failed: {exc}"
            )
            time.sleep(attempt)

    raise RuntimeError(f"Unable to establish SSH connection: {last_error}")


def ensure_remote_dir(
    sftp: paramiko.SFTPClient, remote_dir: str, known_dirs: set[str]
) -> None:
    if remote_dir in known_dirs:
        return

    current = ""
    for part in remote_dir.strip("/").split("/"):
        current = f"{current}/{part}" if current else f"/{part}"
        if current in known_dirs:
            continue
        try:
            sftp.stat(current)
        except FileNotFoundError:
            sftp.mkdir(current)
        known_dirs.add(current)


def iter_local_files(local_root: Path) -> list[Path]:
    return sorted(path for path in local_root.rglob("*") if path.is_file())


def resolve_upload_source(rel_path: str, dist_path: Path, public_root: Path) -> Path:
    if rel_path != "index.html":
        public_path = public_root.joinpath(*rel_path.split("/"))
        if public_path.exists() and public_path.is_file():
            return public_path
    return dist_path


def collect_remote_file_stats(
    ssh: paramiko.SSHClient, remote_root: str
) -> dict[str, RemoteFileInfo]:
    command = f"find {shlex.quote(remote_root)} -type f -printf '%P\\t%s\\t%T@\\n'"
    stdin, stdout, stderr = ssh.exec_command(command, timeout=REMOTE_COMMAND_TIMEOUT)
    output = stdout.read().decode("utf-8", "ignore")
    error_output = stderr.read().decode("utf-8", "ignore").strip()
    if error_output:
        raise RuntimeError(f"Unable to inspect remote files: {error_output}")

    remote_files: dict[str, RemoteFileInfo] = {}
    for line in output.splitlines():
        rel_path, size_text, mtime_text = line.split("\t", 2)
        remote_files[rel_path] = RemoteFileInfo(
            size=int(size_text),
            mtime=int(float(mtime_text)),
        )
    return remote_files


def upload_needed(local_path: Path, remote_info: RemoteFileInfo | None) -> bool:
    if remote_info is None:
        return True

    local_stat = local_path.stat()
    if local_stat.st_size != remote_info.size:
        return True

    return abs(int(local_stat.st_mtime) - remote_info.mtime) > 1


def upload_file(
    sftp: paramiko.SFTPClient,
    local_path: Path,
    remote_path: str,
    known_dirs: set[str],
) -> None:
    ensure_remote_dir(sftp, posixpath.dirname(remote_path), known_dirs)
    temp_path = f"{remote_path}.codex-upload"
    local_stat = local_path.stat()

    last_error: Exception | None = None
    for attempt in range(1, 4):
        try:
            try:
                sftp.remove(temp_path)
            except FileNotFoundError:
                pass
            sftp.put(str(local_path), temp_path)
            sftp.utime(temp_path, (int(local_stat.st_mtime), int(local_stat.st_mtime)))
            try:
                sftp.remove(remote_path)
            except FileNotFoundError:
                pass
            sftp.rename(temp_path, remote_path)
            return
        except Exception as exc:  # pragma: no cover - network dependent
            last_error = exc
            try:
                sftp.remove(temp_path)
            except Exception:
                pass
            time.sleep(attempt)

    raise RuntimeError(f"Failed to upload {local_path} -> {remote_path}: {last_error}")


def collect_remote_tree(
    ssh: paramiko.SSHClient, remote_root: str
) -> tuple[set[str], set[str]]:
    command = f"find {shlex.quote(remote_root)} -mindepth 1 -printf '%y\\t%P\\n'"
    stdin, stdout, stderr = ssh.exec_command(command, timeout=REMOTE_COMMAND_TIMEOUT)
    output = stdout.read().decode("utf-8", "ignore")
    error_output = stderr.read().decode("utf-8", "ignore").strip()
    if error_output:
        raise RuntimeError(f"Unable to inspect remote tree: {error_output}")

    files: set[str] = set()
    dirs: set[str] = set()
    for line in output.splitlines():
        entry_type, rel_path = line.split("\t", 1)
        if entry_type == "d":
            dirs.add(rel_path)
        else:
            files.add(rel_path)
    return files, dirs


def remove_remote_file(sftp: paramiko.SFTPClient, remote_path: str) -> None:
    try:
        sftp.remove(remote_path)
    except FileNotFoundError:
        return


def remove_remote_dir(sftp: paramiko.SFTPClient, remote_path: str) -> None:
    try:
        sftp.rmdir(remote_path)
    except FileNotFoundError:
        return


def collect_live_dirs(local_rel_paths: set[str]) -> set[str]:
    live_dirs: set[str] = set()
    for rel_path in local_rel_paths:
        parent = posixpath.dirname(rel_path)
        while parent and parent != ".":
            live_dirs.add(parent)
            parent = posixpath.dirname(parent)
    return live_dirs


def main() -> int:
    args = parse_args()
    repo_root = Path(__file__).resolve().parent.parent
    local_root = (repo_root / args.local_root).resolve()
    public_root = (repo_root / "public").resolve()
    config = load_config((repo_root / args.config).resolve())

    if not args.skip_build:
        run_build(config.build_command, repo_root)

    if not local_root.exists():
        raise SystemExit(f"Local build directory does not exist: {local_root}")

    local_files = iter_local_files(local_root)
    if not local_files:
        raise SystemExit(f"No files found in build directory: {local_root}")

    print(f"[deploy] Local root:  {local_root}")
    print(f"[deploy] Remote root: {config.remote_root}")
    print(f"[deploy] Mode:        {'dry-run' if args.dry_run else 'upload'}")

    ssh = connect_ssh(config)
    sftp = ssh.open_sftp()

    started_at = time.perf_counter()
    uploaded = 0
    skipped = 0
    deleted = 0
    known_dirs = {"/"}

    try:
        ensure_remote_dir(sftp, config.remote_root, known_dirs)
        remote_file_stats = collect_remote_file_stats(ssh, config.remote_root)

        local_rel_paths: set[str] = set()
        for dist_path in local_files:
            rel_path = dist_path.relative_to(local_root).as_posix()
            local_path = resolve_upload_source(rel_path, dist_path, public_root)
            local_rel_paths.add(rel_path)
            remote_path = posixpath.join(config.remote_root, rel_path)
            remote_info = remote_file_stats.get(rel_path)

            if upload_needed(local_path, remote_info):
                action = "[upload]" if not args.dry_run else "[plan]"
                print(f"{action} {rel_path}")
                if not args.dry_run:
                    upload_file(sftp, local_path, remote_path, known_dirs)
                uploaded += 1
            else:
                skipped += 1
                if args.verbose:
                    print(f"[skip]   {rel_path}")

        if args.prune:
            remote_files, remote_dirs = collect_remote_tree(ssh, config.remote_root)
            stale_files = sorted(remote_files - local_rel_paths)
            stale_dirs = sorted(remote_dirs, key=lambda value: value.count("/"), reverse=True)
            live_dirs = collect_live_dirs(local_rel_paths)

            for rel_path in stale_files:
                print(f"{'[delete]' if not args.dry_run else '[prune] '} {rel_path}")
                if not args.dry_run:
                    remove_remote_file(sftp, posixpath.join(config.remote_root, rel_path))
                deleted += 1

            for rel_path in stale_dirs:
                if rel_path in live_dirs:
                    continue
                print(f"{'[rmdir] ' if not args.dry_run else '[prune] '} {rel_path}")
                if not args.dry_run:
                    remove_remote_dir(sftp, posixpath.join(config.remote_root, rel_path))

    finally:
        sftp.close()
        ssh.close()

    elapsed = time.perf_counter() - started_at
    print(
        f"[deploy] Done in {elapsed:.1f}s. uploaded={uploaded}, skipped={skipped}, deleted={deleted}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
